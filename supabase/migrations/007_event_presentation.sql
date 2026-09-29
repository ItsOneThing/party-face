-- Per-event public presentation. Run after 001–006, before deploying updated Edge Functions.
alter table public.events add column if not exists photo_credit text;
alter table public.events add column if not exists photo_credit_it text;
alter table public.events add column if not exists contact_name text;

do $$ begin
  if not exists(select 1 from pg_constraint where conname = 'events_photo_credit_length') then
    alter table public.events add constraint events_photo_credit_length check (photo_credit is null or length(photo_credit) <= 120);
  end if;
  if not exists(select 1 from pg_constraint where conname = 'events_photo_credit_it_length') then
    alter table public.events add constraint events_photo_credit_it_length check (photo_credit_it is null or length(photo_credit_it) <= 120);
  end if;
  if not exists(select 1 from pg_constraint where conname = 'events_contact_name_length') then
    alter table public.events add constraint events_contact_name_length check (contact_name is null or length(contact_name) <= 80);
  end if;
end $$;

-- Keep the current event's attribution while removing it from reusable page templates.
update public.events set
  title = 'PLP 迎新会',
  title_it = 'Festa di benvenuto PLP',
  photo_credit = 'PLP 摄影社',
  photo_credit_it = 'PLP Photography Club',
  contact_name = 'OneThing'
where slug = 'welcome-2026';
