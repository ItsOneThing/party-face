-- Reviewed grouping snapshots. Apply after 004; no activity is opened automatically.
create table public.person_group_revisions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  index_signature text not null,
  created_at timestamptz not null default now(),
  unique(id,event_id)
);
create table public.person_groups (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null,
  event_id uuid not null,
  name text not null check(length(name)<=60),
  reviewed boolean not null default false,
  foreign key(revision_id,event_id) references public.person_group_revisions(id,event_id) on delete cascade,
  unique(id,revision_id,event_id)
);
create table public.person_group_faces (
  group_id uuid not null,
  revision_id uuid not null,
  event_id uuid not null,
  face_id bigint not null references public.faces(id) on delete cascade,
  primary key(revision_id,face_id),
  foreign key(group_id,revision_id,event_id) references public.person_groups(id,revision_id,event_id) on delete cascade
);
create index person_group_faces_group_idx on public.person_group_faces(group_id);
alter table public.events add column published_group_revision uuid;
alter table public.events add constraint events_group_revision_fk foreign key(published_group_revision,id)
  references public.person_group_revisions(id,event_id);
alter table public.person_group_revisions enable row level security;
alter table public.person_groups enable row level security;
alter table public.person_group_faces enable row level security;
revoke all on public.person_group_revisions,public.person_groups,public.person_group_faces from public,anon,authenticated;
grant all on public.person_group_revisions,public.person_groups,public.person_group_faces to service_role;

create function public.person_index_signature(p_event uuid) returns text
language sql stable set search_path=public,pg_temp as $$
  select md5(coalesce(string_agg(id::text,',' order by id),'')) from public.faces where event_id=p_event;
$$;

create function public.save_person_groups(p_event uuid,p_groups jsonb,p_signature text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare revision uuid; group_uuid uuid; item jsonb; face_item jsonb; face_ids bigint[]; assigned bigint[]:=array[]::bigint[]; total integer;
begin
  lock table public.faces in share mode;
  if not exists(select 1 from public.events where id=p_event and model_version='facenet512-onnx-ssd68-align5-prewhiten-l2-v1') then raise exception 'Model mismatch'; end if;
  if p_signature is distinct from public.person_index_signature(p_event) then raise exception 'Index changed; reload groups'; end if;
  if jsonb_typeof(p_groups) is distinct from 'array' or jsonb_array_length(p_groups) not between 1 and 2000 then raise exception 'Invalid groups'; end if;
  select count(*) into total from public.faces where event_id=p_event;
  if total not between 1 and 2000 then raise exception 'Invalid face count'; end if;
  insert into public.person_group_revisions(event_id,index_signature) values(p_event,p_signature) returning id into revision;
  for item in select value from jsonb_array_elements(p_groups) loop
    if jsonb_typeof(item->'faces') is distinct from 'array' or jsonb_array_length(item->'faces')=0
      or jsonb_typeof(item->'reviewed') is distinct from 'boolean' or length(coalesce(item->>'name',''))>60 then raise exception 'Invalid group'; end if;
    face_ids:=array[]::bigint[];
    for face_item in select value from jsonb_array_elements(item->'faces') loop
      if (face_item #>> '{}') !~ '^[0-9]{1,18}$' then raise exception 'Invalid face ID'; end if;
      face_ids:=array_append(face_ids,(face_item #>> '{}')::bigint);
    end loop;
    if exists(select 1 from unnest(face_ids) fid left join public.faces f on f.id=fid and f.event_id=p_event where f.id is null)
      then raise exception 'Face belongs to another event'; end if;
    if (select count(distinct photo_id) from public.faces where id=any(face_ids))<>cardinality(face_ids)
      then raise exception 'Duplicate or co-occurring faces in group'; end if;
    assigned:=assigned||face_ids;
    insert into public.person_groups(revision_id,event_id,name,reviewed)
      values(revision,p_event,coalesce(item->>'name',''),(item->>'reviewed')::boolean) returning id into group_uuid;
    insert into public.person_group_faces(group_id,revision_id,event_id,face_id)
      select group_uuid,revision,p_event,unnest(face_ids);
  end loop;
  if cardinality(assigned)<>total or (select count(distinct id) from unnest(assigned) id)<>total then raise exception 'Incomplete or duplicate face assignment'; end if;
  return jsonb_build_object('revision',revision,'groups',jsonb_array_length(p_groups));
end $$;

create function public.publish_person_groups(p_event uuid,p_revision uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  lock table public.faces in share mode;
  if not exists(select 1 from public.events where id=p_event and model_version='facenet512-onnx-ssd68-align5-prewhiten-l2-v1') then raise exception 'Model mismatch'; end if;
  if not exists(select 1 from public.person_group_revisions where id=p_revision and event_id=p_event and index_signature=public.person_index_signature(p_event))
    then raise exception 'Index changed or revision invalid'; end if;
  if not exists(select 1 from public.person_groups where revision_id=p_revision and event_id=p_event and reviewed)
    then raise exception 'No reviewed group'; end if;
  update public.events set published_group_revision=p_revision where id=p_event;
  -- Does not open the activity. Only its separately published, reviewed groups are searchable.
  return true;
end $$;

create function public.match_person_groups(p_event uuid,p_descriptor extensions.vector,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public,extensions,pg_temp as $$
declare revision uuid; cutoff real; first_group uuid; first_distance real; second_distance real;
begin
  if p_descriptor is null or vector_dims(p_descriptor)<>512 or abs(vector_norm(p_descriptor)-1)>.01 then raise exception 'Invalid descriptor'; end if;
  select published_group_revision,threshold into revision,cutoff from public.events
    where id=p_event and active and model_version='facenet512-onnx-ssd68-align5-prewhiten-l2-v1' and (expires_at is null or expires_at>now());
  if revision is null then return jsonb_build_object('total',0,'photos','[]'::jsonb); end if;
  if not exists(select 1 from public.person_group_revisions where id=revision and event_id=p_event and index_signature=public.person_index_signature(p_event)) then raise exception 'Published index changed; review again'; end if;
  with scores as (
    select g.id,min(f.embedding <-> p_descriptor) distance from public.person_groups g
    join public.person_group_faces gf on gf.group_id=g.id
    join public.faces f on f.id=gf.face_id and f.event_id=p_event
    where g.revision_id=revision and g.event_id=p_event group by g.id
  ), ranked as(select id,distance,row_number() over(order by distance,id) rank from scores)
  select max(id::text) filter(where rank=1)::uuid,max(distance) filter(where rank=1),max(distance) filter(where rank=2)
    into first_group,first_distance,second_distance from ranked where rank<=2;
  if first_group is null or not exists(select 1 from public.person_groups where id=first_group and reviewed)
    or first_distance>cutoff or (second_distance is not null and second_distance-first_distance<.08)
    then return jsonb_build_object('total',0,'photos','[]'::jsonb); end if;
  return (
    with matching as materialized (
      select distinct f.photo_id from public.person_group_faces gf join public.faces f on f.id=gf.face_id and f.event_id=p_event
      where gf.group_id=first_group and gf.event_id=p_event
    ), page as (
      select p.id,p.name,p.drive_url,p.thumbnail_path,p.album_path from public.photos p join matching m on m.photo_id=p.id
      where p.event_id=p_event order by p.name,p.id limit 24 offset greatest(0,least(p_offset,100000))
    ) select jsonb_build_object('total',(select count(*) from matching),'photos',coalesce((select jsonb_agg(to_jsonb(page) order by name,id) from page),'[]'::jsonb))
  );
end $$;
revoke all on function public.person_index_signature(uuid) from public,anon,authenticated;
revoke all on function public.save_person_groups(uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.publish_person_groups(uuid,uuid) from public,anon,authenticated;
revoke all on function public.match_person_groups(uuid,extensions.vector,integer) from public,anon,authenticated;
grant execute on function public.person_index_signature(uuid),public.save_person_groups(uuid,jsonb,text),public.publish_person_groups(uuid,uuid),public.match_person_groups(uuid,extensions.vector,integer) to service_role;
