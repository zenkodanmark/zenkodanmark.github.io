-- LIVA-indbakke til testsiden /send-test/
-- Projekt: https://jauggqxhemjnbxoxkpeh.supabase.co  (samme som Zenko Plads)
--
-- Kør hele filen i Supabase → SQL Editor. Den er kun additiv:
--   * opretter funktionen public.liva_indleveringer_paths_ok
--   * opretter tabellen public.liva_indleveringer, hvis den ikke findes
--   * opretter den private bucket liva-indbakke
--   * giver anon kun INSERT, ingen select/list/update/delete
-- Den sletter ingen rækker, rører ikke bucket "plads" og ændrer ingen andre tabeller.
-- De to DROP POLICY gælder kun policies med disse navne, som filen selv opretter.
-- Kør den ikke, hvis du ikke selv har læst den. Der er ikke kørt noget mod databasen herfra.
--
-- LIVA læser bagefter med service role-nøglen (secret), aldrig med nøglen i websiden.
-- Dashboard → Project Settings → API → service_role / secret key (sb_secret_…).
-- Læg den kun på LIVAs server.
--
-- Nye rækker siden et tidspunkt:
--   curl -fsS \
--     -H "apikey: $LIVA_SUPABASE_SERVICE_ROLE_KEY" \
--     -H "Authorization: Bearer $LIVA_SUPABASE_SERVICE_ROLE_KEY" \
--     "https://jauggqxhemjnbxoxkpeh.supabase.co/rest/v1/liva_indleveringer?select=id,sender,note,file_paths,created_at&created_at=gt.2026-10-27T00:00:00Z&order=created_at.asc"
--
-- Hent én fil. file_paths er stier i bucketten, fx <uuid>/<uuid>.jpg
--   curl -fL \
--     -H "apikey: $LIVA_SUPABASE_SERVICE_ROLE_KEY" \
--     -H "Authorization: Bearer $LIVA_SUPABASE_SERVICE_ROLE_KEY" \
--     -o fil.jpg \
--     "https://jauggqxhemjnbxoxkpeh.supabase.co/storage/v1/object/liva-indbakke/STI-FRA-file_paths"
--
-- Den offentlige nøgle kan ikke læse eller liste. Uden select-policy giver
-- både REST og Storage tomt eller 401/403.

create or replace function public.liva_indleveringer_paths_ok(paths text[])
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when paths is null or cardinality(paths) < 1 or cardinality(paths) > 8 then false
    else
      not exists (
        select 1
        from unnest(paths) as p
        where p !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf|heic|heif)$'
      )
      and (
        select count(distinct split_part(p, '/', 1))
        from unnest(paths) as p
      ) = 1
  end
$$;

revoke all on function public.liva_indleveringer_paths_ok(text[]) from public;
grant execute on function public.liva_indleveringer_paths_ok(text[]) to anon, service_role;

create table if not exists public.liva_indleveringer (
  id uuid primary key default gen_random_uuid(),
  sender text,
  note text,
  file_paths text[] not null,
  created_at timestamptz not null default now(),
  constraint liva_indleveringer_sender_len check (sender is null or char_length(sender) <= 120),
  constraint liva_indleveringer_note_len check (note is null or char_length(note) <= 2000),
  constraint liva_indleveringer_paths_ok check (public.liva_indleveringer_paths_ok(file_paths))
);

comment on table public.liva_indleveringer is
  'Indleveringer fra send-test til LIVA LIND. anon må kun indsætte. LIVA læser med service_role.';

alter table public.liva_indleveringer enable row level security;

revoke all on table public.liva_indleveringer from public;
revoke all on table public.liva_indleveringer from anon;
revoke all on table public.liva_indleveringer from authenticated;
grant insert on table public.liva_indleveringer to anon;
grant select, insert, update, delete on table public.liva_indleveringer to service_role;

drop policy if exists liva_indleveringer_anon_insert on public.liva_indleveringer;
create policy liva_indleveringer_anon_insert
on public.liva_indleveringer
for insert
to anon
with check (
  public.liva_indleveringer_paths_ok(file_paths)
  and (sender is null or char_length(sender) <= 120)
  and (note is null or char_length(note) <= 2000)
);

insert into storage.buckets as bucket (id, name, public, file_size_limit, allowed_mime_types)
values (
  'liva-indbakke',
  'liva-indbakke',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types
where bucket.id = 'liva-indbakke';

drop policy if exists liva_indbakke_anon_insert on storage.objects;
create policy liva_indbakke_anon_insert
on storage.objects
for insert
to anon
with check (
  bucket_id = 'liva-indbakke'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf|heic|heif)$'
);

notify pgrst, 'reload schema';

-- Kontrol. public skal være false, og der må kun være insert-policies med disse navne.
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'liva-indbakke';

select schemaname, tablename, policyname, cmd, roles::text
from pg_policies
where (schemaname = 'public' and tablename = 'liva_indleveringer')
   or (schemaname = 'storage' and tablename = 'objects' and policyname = 'liva_indbakke_anon_insert');
