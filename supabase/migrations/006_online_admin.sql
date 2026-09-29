-- Online reviewers authenticate with Supabase Auth; membership is granted only by the project owner.
create table public.event_admins (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('owner','editor')),
  primary key(event_id,user_id)
);
alter table public.event_admins enable row level security;
revoke all on public.event_admins from public,anon,authenticated;
grant all on public.event_admins to service_role;
alter table public.events add column latest_group_revision uuid;
alter table public.events add constraint events_latest_group_fk foreign key(latest_group_revision,id)
  references public.person_group_revisions(id,event_id);
alter table public.person_group_revisions add column created_by uuid references auth.users(id) on delete set null;
update public.events e set latest_group_revision=(select id from public.person_group_revisions where event_id=e.id order by created_at desc,id desc limit 1);
create function public.track_group_revision() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin update public.events set latest_group_revision=new.id where id=new.event_id; return new; end $$;
create trigger track_group_revision after insert on public.person_group_revisions for each row execute function public.track_group_revision();
revoke all on function public.track_group_revision() from public,anon,authenticated;

-- Per-account shared budget across Edge instances; no biometric data in this table.
create table public.admin_request_limits(user_id uuid not null references auth.users(id) on delete cascade, minute timestamptz not null, requests integer not null, primary key(user_id,minute));
alter table public.admin_request_limits enable row level security;
revoke all on public.admin_request_limits from public,anon,authenticated;
grant all on public.admin_request_limits to service_role;
-- The trusted Edge handler supplies p_actor from Auth /user, never from the request body.
create function public.admin_groups(p_actor uuid,p_action text,p_slug text default null,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare e public.events%rowtype; permission text; signature text; revision uuid; result jsonb; request_count integer;
begin
  if p_actor is null then raise exception 'Unauthorized' using errcode='42501'; end if;
  insert into public.admin_request_limits(user_id,minute,requests) values(p_actor,date_trunc('minute',now()),1)
    on conflict(user_id,minute) do update set requests=admin_request_limits.requests+1 returning requests into request_count;
  if request_count>30 then raise exception 'Admin rate limit' using errcode='P0429'; end if;
  delete from public.admin_request_limits where minute<now()-interval '1 hour';
  if p_action='events' then
    return coalesce((select jsonb_agg(jsonb_build_object('slug',ev.slug,'title',ev.title,'role',a.role) order by ev.title,ev.slug)
      from public.event_admins a join public.events ev on ev.id=a.event_id where a.user_id=p_actor
      and ev.model_version='facenet512-onnx-ssd68-align5-prewhiten-l2-v1'),'[]'::jsonb);
  end if;
  select * into e from public.events where slug=p_slug;
  select role into permission from public.event_admins where event_id=e.id and user_id=p_actor for share;
  if permission is null then raise exception 'Not assigned to this activity' using errcode='42501'; end if;
  if e.model_version<>'facenet512-onnx-ssd68-align5-prewhiten-l2-v1' then raise exception 'Model mismatch'; end if;
  if p_payload->'consent' is distinct from 'true'::jsonb then raise exception 'Consent assertion required'; end if;
  if p_action='load' then
    -- One snapshot protects against index changes while preparing a consistent JSON response.
    lock table public.faces in share mode;
    select * into e from public.events where id=e.id for no key update;
    if (select count(*) from public.photos where event_id=e.id)>500 or
       (select count(*) from public.faces where event_id=e.id) not between 1 and 2000 then raise exception 'Use an indexed activity with at most 500 photos and 2000 faces'; end if;
    signature:=public.person_index_signature(e.id);
    select id into revision from public.person_group_revisions where id=e.latest_group_revision and index_signature=signature;
    return jsonb_build_object('event',e.id,'role',permission,'signature',signature,'revision',revision,
      'base_revision',e.latest_group_revision,'published',e.published_group_revision,
      'photos',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'drive_url',drive_url,'thumbnail_path',thumbnail_path) order by id) from public.photos where event_id=e.id),'[]'::jsonb),
      'faces',coalesce((select jsonb_agg(jsonb_build_object('id',id::text,'photoId',photo_id,'descriptor',embedding::text::jsonb,'box',box) order by id) from public.faces where event_id=e.id),'[]'::jsonb),
      'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'reviewed',g.reviewed,'faces',
        (select jsonb_agg(face_id::text order by face_id) from public.person_group_faces where group_id=g.id)) order by g.id)
        from public.person_groups g where g.revision_id=revision),'[]'::jsonb));
  elsif p_action='save' then
    result:=public.save_person_groups_checked(e.id,p_payload->'groups',p_payload->>'signature',(p_payload->>'base_revision')::uuid);
    update public.person_group_revisions set created_by=p_actor where id=(result->>'revision')::uuid;
    return result;
  elsif p_action='publish' then
    if permission<>'owner' then raise exception 'Only owner can publish' using errcode='42501'; end if;
    perform public.publish_person_groups_checked(e.id,(p_payload->>'revision')::uuid,(p_payload->>'base_published')::uuid);
    return jsonb_build_object('published',p_payload->>'revision','active',e.active);
  end if;
  raise exception 'Unknown action';
end $$;

create function public.save_person_groups_checked(p_event uuid,p_groups jsonb,p_signature text,p_base_revision uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare latest uuid;
begin
  -- Lock order matches load/publish and legacy writer's faces lock to avoid deadlocks.
  lock table public.faces in share mode;
  select latest_group_revision into latest from public.events where id=p_event for no key update;
  if latest is distinct from p_base_revision or p_signature is distinct from public.person_index_signature(p_event) then
    raise exception 'Conflict: reload latest draft before saving' using errcode='40001'; end if;
  return public.save_person_groups(p_event,p_groups,p_signature);
end $$;
create function public.publish_person_groups_checked(p_event uuid,p_revision uuid,p_base_published uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare latest uuid; published uuid;
begin
  lock table public.faces in share mode;
  select latest_group_revision,published_group_revision into latest,published from public.events where id=p_event for no key update;
  if latest is distinct from p_revision or published is distinct from p_base_published then
    raise exception 'Conflict: draft or published version changed' using errcode='40001'; end if;
  return public.publish_person_groups(p_event,p_revision);
end $$;
revoke all on function public.admin_groups(uuid,text,text,jsonb),public.save_person_groups_checked(uuid,jsonb,text,uuid),public.publish_person_groups_checked(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_groups(uuid,text,text,jsonb),public.save_person_groups_checked(uuid,jsonb,text,uuid),public.publish_person_groups_checked(uuid,uuid,uuid) to service_role;
