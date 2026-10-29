begin;
create function soundbar_private.sb_library_categories_valid(items text[]) returns boolean
language sql immutable strict set search_path='' as $$
 select coalesce(pg_catalog.array_ndims(items),1)=1
 and pg_catalog.cardinality(items)<=100
 and not exists(select 1 from pg_catalog.unnest(items) x where x is null or pg_catalog.char_length(pg_catalog.btrim(x)) not between 1 and 60 or x ~ '[[:cntrl:]]')
$$;
revoke all on function soundbar_private.sb_library_categories_valid(text[]) from public,anon;
grant execute on function soundbar_private.sb_library_categories_valid(text[]) to authenticated,service_role;
alter table public.sb_library_tracks add column categories text[] not null default '{}';
alter table public.sb_library_tracks add constraint sb_library_categories_check check(soundbar_private.sb_library_categories_valid(categories));
-- Import provenance is private. One source URL can belong to only one catalogue
-- entry, including retired entries. Aliases permit safe future incremental runs.
create table soundbar_private.sb_library_sources (
 source_url text primary key check (
  source_url ~ '^https://sysmacom[.]com[.]br/musicas-harmony/' and source_url ~* '[.](mp3|wav|ogg|m4a|aac|flac|webm)$'
  and source_url !~ '[?#[:space:]]' and strpos(source_url,chr(92))=0 and source_url !~* '(%2e|%2f|%5c|/[.][.]?(/|$))'
 ),
 library_id text not null references public.sb_library_tracks(id) on delete restrict,
 category text not null check(char_length(trim(category)) between 1 and 60),
 file_size bigint not null check(file_size between 1 and 52428800),
 head_sha256 text not null check(head_sha256 ~ '^[a-f0-9]{64}$'),
 content_sha256 text check(content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now()
);
create index sb_library_sources_catalog on soundbar_private.sb_library_sources(library_id);
create index sb_library_sources_fingerprint on soundbar_private.sb_library_sources(file_size,head_sha256);
alter table soundbar_private.sb_library_sources enable row level security;
revoke all on soundbar_private.sb_library_sources from public,anon,authenticated;
grant all on soundbar_private.sb_library_sources to service_role;
create policy sb_library_sources_no_client on soundbar_private.sb_library_sources for all to anon,authenticated using(false) with check(false);
commit;
