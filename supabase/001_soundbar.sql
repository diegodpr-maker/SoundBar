-- Execute uma vez no SQL Editor de um projeto Supabase.
-- Namespaced tables avoid collisions with unrelated applications.
begin;
create table public.sb_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '' check(char_length(display_name)<=80),
 workspace_name text not null default 'Meu estúdio' check(char_length(workspace_name)<=80),
 bio text not null default '' check(char_length(bio)<=300),
 accent text not null default '#b8f782' check(accent ~ '^#[0-9a-fA-F]{6}$'),
 created_at timestamptz not null default now()
);
create table public.sb_playlists (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references public.sb_profiles(id) on delete cascade,
 name text not null check(char_length(trim(name)) between 1 and 80),
 description text not null default '' check(char_length(description)<=300),
 color text not null default '#b8f782' check(color ~ '^#[0-9a-fA-F]{6}$'),
 play_mode text not null default 'mix' check(play_mode in ('mix','single')),
 loop boolean not null default false,
 retrigger text not null default 'stop' check(retrigger in ('stop','restart')),
 switch_mode text not null default 'stop' check(switch_mode in ('stop','continue')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,user_id)
);
create index sb_playlists_owner_idx on public.sb_playlists(user_id);
create table public.sb_tracks (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references public.sb_profiles(id) on delete cascade,
 playlist_id uuid not null,
 name text not null check(char_length(trim(name)) between 1 and 80),
 color text not null default '#b8f782' check(color ~ '^#[0-9a-fA-F]{6}$'),
 sample_id text check(sample_id in ('carefree','warm-loop','intro','soft-beat')),
 audio_path text unique, filename text, mime text,
 file_size bigint not null default 0 check(file_size between 0 and 26214400),
 position integer not null default 0, created_at timestamptz not null default now(),
 foreign key(playlist_id,user_id) references public.sb_playlists(id,user_id) on delete cascade,
 check((sample_id is not null and audio_path is null and file_size=0) or
       (sample_id is null and audio_path is not null and split_part(audio_path,'/',1)=user_id::text))
);
create index sb_tracks_owner_playlist_idx on public.sb_tracks(user_id,playlist_id);

alter table public.sb_profiles enable row level security;
alter table public.sb_playlists enable row level security;
alter table public.sb_tracks enable row level security;
create policy sb_profile_read on public.sb_profiles for select to authenticated using(id=(select auth.uid()));
create policy sb_profile_create on public.sb_profiles for insert to authenticated with check(id=(select auth.uid()));
create policy sb_profile_edit on public.sb_profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy sb_playlists_private on public.sb_playlists for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy sb_tracks_private on public.sb_tracks for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
revoke all on public.sb_profiles,public.sb_playlists,public.sb_tracks from anon;
grant select,insert,update on public.sb_profiles to authenticated;
grant select,insert,update,delete on public.sb_playlists,public.sb_tracks to authenticated;

create function public.sb_limit_records() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or new.user_id <> auth.uid() then raise exception 'Conta inválida.'; end if;
 perform 1 from public.sb_profiles where id=auth.uid() for update;
 if tg_table_name='sb_playlists' then
  if (select count(*) from public.sb_playlists where user_id=auth.uid())>=30 then raise exception 'Limite de 30 playlists atingido.';end if;
 else
  if (select count(*) from public.sb_tracks where user_id=auth.uid())>=1000 then raise exception 'Limite de 1000 faixas atingido.';end if;
 end if;
 return new;
end;$$;
revoke all on function public.sb_limit_records() from public,anon,authenticated;
create trigger sb_playlist_quota before insert on public.sb_playlists for each row execute function public.sb_limit_records();
create trigger sb_track_quota before insert on public.sb_tracks for each row execute function public.sb_limit_records();
create function public.sb_touch_playlist() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now();return new;end;$$;
create trigger sb_playlist_updated before update on public.sb_playlists for each row execute function public.sb_touch_playlist();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('soundbar-audio','soundbar-audio',false,26214400,array['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/ogg','application/ogg','audio/mp4','audio/x-m4a','audio/aac','audio/flac','audio/x-flac','audio/webm'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- The Storage service supplies the actual byte count in metadata.
create function public.sb_storage_quota(candidate jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare used_bytes bigint; incoming_bytes bigint;
begin
 if auth.uid() is null then return false;end if;
 perform 1 from public.sb_profiles where id=auth.uid() for update;
 if not found then return false;end if;
 incoming_bytes=coalesce((candidate->>'size')::bigint,26214400);
 if incoming_bytes<1 or incoming_bytes>26214400 then return false;end if;
 select coalesce(sum(coalesce((metadata->>'size')::bigint,26214400)),0) into used_bytes
 from storage.objects where bucket_id='soundbar-audio' and (storage.foldername(name))[1]=auth.uid()::text;
 return used_bytes+incoming_bytes<=209715200;
end;$$;
revoke all on function public.sb_storage_quota(jsonb) from public,anon;
grant execute on function public.sb_storage_quota(jsonb) to authenticated;
create policy sb_audio_read on storage.objects for select to authenticated using(bucket_id='soundbar-audio' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy sb_audio_upload on storage.objects for insert to authenticated with check(
 bucket_id='soundbar-audio' and (storage.foldername(name))[1]=(select auth.uid())::text and public.sb_storage_quota(metadata)
);
create policy sb_audio_delete on storage.objects for delete to authenticated using(bucket_id='soundbar-audio' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- No UPDATE policy: existing objects cannot be overwritten or moved between owners.
commit;
