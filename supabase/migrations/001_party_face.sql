-- Run once in Supabase SQL Editor. All visitor access goes through the Edge Function.
create schema if not exists extensions;
create extension if not exists vector with schema extensions;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  title text not null check (length(title) between 1 and 100),
  title_it text check (title_it is null or length(title_it) between 1 and 100),
  token_hash text not null check (length(token_hash) = 64),
  drive_folder_id text not null,
  model_version text not null,
  threshold real not null default 0.50 check (threshold between 0.35 and 0.65),
  active boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  drive_file_id text not null,
  name text not null,
  drive_url text not null,
  thumbnail_path text not null,
  fingerprint text not null,
  model_version text not null,
  face_count integer not null check (face_count between 0 and 300),
  updated_at timestamptz not null default now(),
  unique(event_id, drive_file_id), unique(id, event_id)
);
create table public.faces (
  id bigint generated always as identity primary key,
  photo_id uuid not null,
  event_id uuid not null references public.events(id) on delete cascade,
  embedding extensions.vector(128) not null,
  box jsonb not null,
  foreign key (photo_id, event_id) references public.photos(id, event_id) on delete cascade
);
create index faces_event_idx on public.faces(event_id);
create index photos_event_idx on public.photos(event_id);
create table public.request_limits (
  bucket text primary key,
  hits integer not null,
  expires_at timestamptz not null
);

alter table public.events enable row level security;
alter table public.photos enable row level security;
alter table public.faces enable row level security;
alter table public.request_limits enable row level security;
revoke all on public.events, public.photos, public.faces, public.request_limits from anon, authenticated;
grant all on public.events, public.photos, public.faces, public.request_limits to service_role;
grant usage, select on sequence public.faces_id_seq to service_role;

-- Bound anonymous traffic. IP hashes are salted; event-wide caps also work if IP headers are absent/spoofed.
create or replace function public.consume_budget(p_event uuid, p_client text, p_action text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  minute_id text := floor(extract(epoch from now()) / 60)::bigint::text;
  day_id text := floor(extract(epoch from now()) / 86400)::bigint::text;
  bucket_names text[];
  caps integer[];
  expiry timestamptz[];
  current_hits integer;
  i integer;
begin
  if p_action not in ('info', 'search') or length(p_client) <> 64 then return false; end if;
  bucket_names := array[
    p_event::text || ':minute:' || minute_id,
    p_event::text || ':client:' || p_client || ':' || minute_id,
    p_event::text || ':' || p_action || ':day:' || day_id
  ];
  caps := array[1000, 300, case when p_action = 'search' then 5000 else 20000 end];
  expiry := array[now() + interval '2 minutes', now() + interval '2 minutes', now() + interval '1 day'];
  delete from public.request_limits where expires_at < now();
  for i in 1..3 loop
    current_hits := null;
    insert into public.request_limits as r(bucket, hits, expires_at)
      values(bucket_names[i], 1, expiry[i])
      on conflict (bucket) do update set hits = r.hits + 1 where r.hits < caps[i]
      returning hits into current_hits;
    if current_hits is null then return false; end if;
  end loop;
  return true;
end $$;

-- A photo replacement is transactional, so failed imports cannot leave half-written face records.
create or replace function public.import_photo(p_event uuid, p_file text, p_name text,
  p_url text, p_thumbnail text, p_fingerprint text, p_model text, p_faces jsonb)
returns uuid language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare photo_uuid uuid; expected_model text;
begin
  select model_version into expected_model from public.events where id = p_event;
  if expected_model is null or expected_model <> p_model then raise exception 'Model mismatch'; end if;
  if jsonb_typeof(p_faces) <> 'array' or jsonb_array_length(p_faces) > 300 then raise exception 'Invalid faces'; end if;
  insert into public.photos(event_id, drive_file_id, name, drive_url, thumbnail_path, fingerprint, model_version, face_count)
    values(p_event, p_file, p_name, p_url, p_thumbnail, p_fingerprint, p_model, jsonb_array_length(p_faces))
    on conflict(event_id, drive_file_id) do update set name = excluded.name, drive_url = excluded.drive_url,
      thumbnail_path = excluded.thumbnail_path, fingerprint = excluded.fingerprint,
      model_version = excluded.model_version, face_count = excluded.face_count, updated_at = now()
    returning id into photo_uuid;
  delete from public.faces where photo_id = photo_uuid;
  if exists(select 1 from jsonb_array_elements(p_faces) face where jsonb_array_length(face->'descriptor') <> 128)
    then raise exception 'Invalid descriptor'; end if;
  insert into public.faces(photo_id, event_id, embedding, box)
    select photo_uuid, p_event, (face->'descriptor')::text::extensions.vector(128), face->'box'
    from jsonb_array_elements(p_faces) face;
  return photo_uuid;
end $$;

-- Exact distance search within one event. No top-k truncation of a person's complete photo set.
create or replace function public.match_photos(p_event uuid, p_descriptor extensions.vector(128), p_offset integer default 0)
returns jsonb language sql stable security definer set search_path = public, extensions, pg_temp as $$
  with matching as materialized (
    select f.photo_id, min(f.embedding <-> p_descriptor) as distance
    from public.faces f join public.events e on e.id = f.event_id
    where f.event_id = p_event and e.active and (e.expires_at is null or e.expires_at > now())
    group by f.photo_id
    having min(f.embedding <-> p_descriptor) <= max(e.threshold)
  ), page as (
    select p.id, p.name, p.drive_url, p.thumbnail_path, m.distance
    from matching m join public.photos p on p.id = m.photo_id
    order by m.distance, p.id limit 24 offset greatest(0, least(p_offset, 100000))
  )
  select jsonb_build_object('total', (select count(*) from matching),
    'photos', coalesce((select jsonb_agg(to_jsonb(page) order by distance, id) from page), '[]'::jsonb));
$$;

revoke all on function public.consume_budget(uuid,text,text) from public, anon, authenticated;
revoke all on function public.import_photo(uuid,text,text,text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.match_photos(uuid,extensions.vector,integer) from public, anon, authenticated;
grant execute on function public.consume_budget(uuid,text,text) to service_role;
grant execute on function public.import_photo(uuid,text,text,text,text,text,text,jsonb) to service_role;
grant execute on function public.match_photos(uuid,extensions.vector,integer) to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
  values('event-thumbnails', 'event-thumbnails', false, 300000, array['image/jpeg'])
  on conflict(id) do update set public = false;
-- No anonymous Storage policies. Edge Function returns short-lived signed URLs only for results.
