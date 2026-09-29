-- Preserve all legacy 128-D events; new 512-D events use separate event IDs.
-- Apply after 001-003. This does not reindex, open or delete any existing event.
alter table public.faces alter column embedding type extensions.vector using embedding::extensions.vector;
alter table public.events drop constraint if exists events_threshold_check;
alter table public.events add constraint events_threshold_check check (threshold between 0.35 and 1.4);

create or replace function public.import_photo(p_event uuid, p_file text, p_name text,
  p_url text, p_thumbnail text, p_fingerprint text, p_model text, p_faces jsonb,
  p_album text default '', p_indexed boolean default true)
returns uuid language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare photo_uuid uuid; expected_model text; dimension integer; item jsonb; descriptor extensions.vector;
begin
  select model_version into expected_model from public.events where id=p_event;
  if expected_model is null or expected_model<>p_model then raise exception 'Model mismatch'; end if;
  dimension := case p_model when 'face-api-0.22.2-ssd-landmark68-descriptor128-v1' then 128
    when 'facenet512-onnx-ssd68-align5-prewhiten-l2-v1' then 512 else null end;
  if dimension is null or jsonb_typeof(p_faces) is distinct from 'array' or jsonb_array_length(p_faces)>300 or length(p_album)>1000
    then raise exception 'Invalid photo data'; end if;
  if not p_indexed and jsonb_array_length(p_faces)>0 then raise exception 'Unindexed photo has faces'; end if;
  -- Validate all features before changing the existing photo, then replace transactionally.
  for item in select value from jsonb_array_elements(p_faces) loop
    if jsonb_typeof(item->'descriptor') is distinct from 'array' then raise exception 'Invalid descriptor'; end if;
    descriptor := (item->'descriptor')::text::extensions.vector;
    if vector_dims(descriptor)<>dimension then raise exception 'Descriptor dimension mismatch'; end if;
    if dimension=512 and abs(vector_norm(descriptor)-1)>0.01 then raise exception 'Descriptor must be normalized'; end if;
  end loop;
  insert into public.photos(event_id,drive_file_id,name,drive_url,thumbnail_path,fingerprint,model_version,face_count,album_path,face_indexed)
    values(p_event,p_file,p_name,p_url,p_thumbnail,p_fingerprint,p_model,jsonb_array_length(p_faces),p_album,p_indexed)
    on conflict(event_id,drive_file_id) do update set name=excluded.name,drive_url=excluded.drive_url,
      thumbnail_path=excluded.thumbnail_path,fingerprint=excluded.fingerprint,model_version=excluded.model_version,
      face_count=excluded.face_count,album_path=excluded.album_path,face_indexed=excluded.face_indexed,updated_at=now()
    returning id into photo_uuid;
  delete from public.faces where photo_id=photo_uuid;
  insert into public.faces(event_id,photo_id,embedding,box)
    select p_event,photo_uuid,(value->'descriptor')::text::extensions.vector,coalesce(value->'box','{}'::jsonb)
    from jsonb_array_elements(p_faces);
  return photo_uuid;
end $$;

create or replace function public.match_photos(p_event uuid,p_descriptor extensions.vector,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public,extensions,pg_temp as $$
declare dimension integer;
begin
  select case model_version when 'face-api-0.22.2-ssd-landmark68-descriptor128-v1' then 128
    when 'facenet512-onnx-ssd68-align5-prewhiten-l2-v1' then 512 else null end
    into dimension from public.events where id=p_event;
  if dimension is null or p_descriptor is null or vector_dims(p_descriptor)<>dimension then raise exception 'Model dimension mismatch'; end if;
  if dimension=512 and abs(vector_norm(p_descriptor)-1)>0.01 then raise exception 'Descriptor must be normalized'; end if;
  return (
    with matching as materialized (
      select f.photo_id,min(f.embedding <-> p_descriptor) as distance
      from public.faces f join public.events e on e.id=f.event_id
      where f.event_id=p_event and e.active and (e.expires_at is null or e.expires_at>now())
      group by f.photo_id having min(f.embedding <-> p_descriptor)<=max(e.threshold)
    ), page as (
      select p.id,p.name,p.drive_url,p.thumbnail_path,p.album_path,m.distance
      from matching m join public.photos p on p.id=m.photo_id
      order by m.distance,p.id limit 24 offset greatest(0,least(p_offset,100000))
    ) select jsonb_build_object('total',(select count(*) from matching),
      'photos',coalesce((select jsonb_agg(to_jsonb(page) order by distance,id) from page),'[]'::jsonb))
  );
end $$;
revoke all on function public.import_photo(uuid,text,text,text,text,text,text,jsonb,text,boolean) from public,anon,authenticated;
revoke all on function public.match_photos(uuid,extensions.vector,integer) from public,anon,authenticated;
grant execute on function public.import_photo(uuid,text,text,text,text,text,text,jsonb,text,boolean) to service_role;
grant execute on function public.match_photos(uuid,extensions.vector,integer) to service_role;
