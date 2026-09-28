-- Apply AFTER 001_party_face.sql. Adds a gallery that does not depend on face recognition.
alter table public.photos add column if not exists album_path text not null default '';
alter table public.photos add column if not exists face_indexed boolean not null default true;
create index if not exists photos_gallery_idx on public.photos(event_id, album_path, name, id);

create or replace function public.gallery_summary(p_event uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with available as materialized (
    select p.album_path, p.face_indexed from public.photos p join public.events e on e.id=p.event_id
    where p.event_id=p_event and e.active and (e.expires_at is null or e.expires_at>now())
  ), albums as (select album_path as path, count(*) as count from available group by album_path)
  select jsonb_build_object('photo_count', (select count(*) from available),
    'indexed_photo_count', (select count(*) from available where face_indexed),
    'albums', coalesce((select jsonb_agg(to_jsonb(albums) order by path) from albums), '[]'::jsonb));
$$;

create or replace function public.browse_photos(p_event uuid, p_album text default null,
  p_query text default '', p_offset integer default 0)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with available as materialized (
    select p.id, p.name, p.drive_url, p.thumbnail_path, p.album_path
    from public.photos p join public.events e on e.id=p.event_id
    where p.event_id=p_event and e.active and (e.expires_at is null or e.expires_at>now())
      and (p_album is null or p.album_path=p_album)
      and (coalesce(p_query,'')='' or strpos(lower(p.name), lower(p_query))>0)
  ), page as (
    select * from available order by album_path, name, id limit 24 offset greatest(0,least(p_offset,100000))
  )
  select jsonb_build_object('total', (select count(*) from available),
    'photos', coalesce((select jsonb_agg(to_jsonb(page) order by album_path,name,id) from page),'[]'::jsonb));
$$;

-- New import parameters record the subfolder and distinguish unindexed photos from real zero-face detections.
drop function if exists public.import_photo(uuid,text,text,text,text,text,text,jsonb);
create or replace function public.import_photo(p_event uuid, p_file text, p_name text,
  p_url text, p_thumbnail text, p_fingerprint text, p_model text, p_faces jsonb,
  p_album text default '', p_indexed boolean default true)
returns uuid language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare photo_uuid uuid; expected_model text;
begin
  select model_version into expected_model from public.events where id=p_event;
  if expected_model is null or expected_model<>p_model then raise exception 'Model mismatch'; end if;
  if jsonb_typeof(p_faces)<>'array' or jsonb_array_length(p_faces)>300 or length(p_album)>1000
    then raise exception 'Invalid photo data'; end if;
  if not p_indexed and jsonb_array_length(p_faces)>0 then raise exception 'Unindexed photo has faces'; end if;
  insert into public.photos(event_id,drive_file_id,name,drive_url,thumbnail_path,fingerprint,model_version,face_count,album_path,face_indexed)
    values(p_event,p_file,p_name,p_url,p_thumbnail,p_fingerprint,p_model,jsonb_array_length(p_faces),p_album,p_indexed)
    on conflict(event_id,drive_file_id) do update set name=excluded.name,drive_url=excluded.drive_url,
      thumbnail_path=excluded.thumbnail_path,fingerprint=excluded.fingerprint,model_version=excluded.model_version,
      face_count=excluded.face_count,album_path=excluded.album_path,face_indexed=excluded.face_indexed,updated_at=now()
    returning id into photo_uuid;
  delete from public.faces where photo_id=photo_uuid;
  if exists(select 1 from jsonb_array_elements(p_faces) face where jsonb_array_length(face->'descriptor')<>128)
    then raise exception 'Invalid descriptor'; end if;
  insert into public.faces(photo_id,event_id,embedding,box)
    select photo_uuid,p_event,(face->'descriptor')::text::extensions.vector(128),face->'box'
    from jsonb_array_elements(p_faces) face;
  return photo_uuid;
end $$;

create or replace function public.consume_budget(p_event uuid, p_client text, p_action text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  minute_id text := floor(extract(epoch from now())/60)::bigint::text;
  day_id text := floor(extract(epoch from now())/86400)::bigint::text;
  scope text := case when p_action='info' then 'info' else 'photos' end;
  bucket_names text[];
  caps integer[];
  expiry timestamptz[];
  current_hits integer;
  i integer;
begin
  if p_action not in ('info','search','browse') or length(p_client)<>64 then return false; end if;
  bucket_names := array[p_event::text||':minute:'||minute_id,
    p_event::text||':client:'||p_client||':'||minute_id,p_event::text||':'||scope||':day:'||day_id];
  caps := array[1000,300,case when scope='info' then 20000 else 5000 end];
  expiry := array[now()+interval '2 minutes',now()+interval '2 minutes',now()+interval '1 day'];
  delete from public.request_limits where expires_at<now();
  for i in 1..3 loop
    current_hits := null;
    insert into public.request_limits as r(bucket,hits,expires_at) values(bucket_names[i],1,expiry[i])
      on conflict(bucket) do update set hits=r.hits+1 where r.hits<caps[i] returning hits into current_hits;
    if current_hits is null then return false; end if;
  end loop;
  return true;
end $$;

revoke all on function public.gallery_summary(uuid) from public,anon,authenticated;
revoke all on function public.browse_photos(uuid,text,text,integer) from public,anon,authenticated;
revoke all on function public.import_photo(uuid,text,text,text,text,text,text,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.gallery_summary(uuid) to service_role;
grant execute on function public.browse_photos(uuid,text,text,integer) to service_role;
grant execute on function public.import_photo(uuid,text,text,text,text,text,text,jsonb,text,boolean) to service_role;
