begin;
create table public.sb_library_tracks (
 id text primary key check(id ~ '^[a-z0-9-]{1,80}$'),
 name text not null check(char_length(trim(name)) between 1 and 120),
 category text not null default 'Personalizados' check(char_length(category)<=60),
 author text not null default 'Biblioteca SoundBar' check(char_length(author)<=160),
 credit text not null default '' check(char_length(credit)<=600),
 license text not null default 'Condições não informadas' check(char_length(license)<=120),
 source_url text check(source_url is null or source_url ~ '^https://'),
 object_path text unique,
 audio_url text not null check(audio_url ~ '^https://'),
 filename text not null check(char_length(filename)<=220),
 mime text not null default 'audio/mpeg',
 file_size bigint not null default 0 check(file_size between 0 and 52428800),
 duration_seconds numeric check(duration_seconds is null or duration_seconds between 0 and 86400),
 active boolean not null default true,
 position integer not null default 0,
 created_at timestamptz not null default now(),
 check((object_path is not null and audio_url='https://fcmsojjtkiehsobbkjnr.supabase.co/storage/v1/object/public/soundbar-library/'||object_path) or (object_path is null and active=false))
);
create index sb_library_active_position on public.sb_library_tracks(active,position);
alter table public.sb_library_tracks enable row level security;
revoke all on public.sb_library_tracks from public,anon,authenticated;
grant select on public.sb_library_tracks to anon,authenticated;
grant insert,update on public.sb_library_tracks to authenticated;
create policy sb_library_public_read on public.sb_library_tracks for select to anon,authenticated using(true);
create policy sb_library_admin_insert on public.sb_library_tracks for insert to authenticated with check((select soundbar_private.sb_is_admin()));
create policy sb_library_admin_update on public.sb_library_tracks for update to authenticated using((select soundbar_private.sb_is_admin())) with check((select soundbar_private.sb_is_admin()));
insert into public.sb_library_tracks(id,name,audio_url,filename,active) values
('carefree','Carefree','https://incompetech.com/music/royalty-free/mp3-royaltyfree/Carefree.mp3','carefree.mp3',false),
('intro','Primeiro sinal','https://diegodpr-maker.github.io/SoundBar/audio/intro.mp3','primeiro-sinal.mp3',false),
('warm-loop','Warm room','https://diegodpr-maker.github.io/SoundBar/audio/warm-loop.mp3','warm-room.mp3',false),
('soft-beat','Soft pulse','https://diegodpr-maker.github.io/SoundBar/audio/soft-beat.mp3','soft-pulse.mp3',false);
alter table public.sb_tracks drop constraint sb_tracks_sample_id_check;
alter table public.sb_tracks add constraint sb_tracks_library_fkey foreign key(sample_id) references public.sb_library_tracks(id);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('soundbar-library','soundbar-library',true,52428800,array['audio/mpeg','audio/mp3','audio/wav','audio/ogg','audio/mp4','audio/aac','audio/flac','audio/webm']);
create policy sb_library_audio_insert on storage.objects for insert to authenticated with check(bucket_id='soundbar-library' and (select soundbar_private.sb_is_admin()));
create policy sb_library_audio_read on storage.objects for select to authenticated using(bucket_id='soundbar-library');
create policy sb_library_orphan_audio_delete on storage.objects for delete to authenticated using(bucket_id='soundbar-library' and (select soundbar_private.sb_is_admin()) and not exists(select 1 from public.sb_library_tracks l where l.object_path=storage.objects.name));
create table public.sb_library_imports (id integer primary key,source_url text not null,object_path text not null,status text not null default 'pending',file_size bigint,duration_seconds numeric,error text,updated_at timestamptz not null default now());
alter table public.sb_library_imports enable row level security;
revoke all on public.sb_library_imports from public,anon,authenticated;
grant all on public.sb_library_imports to service_role;
create policy sb_library_import_no_client on public.sb_library_imports for all to anon,authenticated using(false) with check(false);
commit;
