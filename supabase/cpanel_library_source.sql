-- Preserve the existing Supabase library and retired legacy entries. New external
-- active audio may only use the owner's exact HTTPS host and music directory.
begin;
alter table public.sb_library_tracks drop constraint sb_library_tracks_check;
alter table public.sb_library_tracks add constraint sb_library_tracks_check check (
 (object_path is not null and audio_url='https://fcmsojjtkiehsobbkjnr.supabase.co/storage/v1/object/public/soundbar-library/'||object_path)
 or
 (object_path is null and (
  active=false
  or (
   audio_url ~ '^https://sysmacom[.]com[.]br/musicas-harmony/'
   and audio_url ~* '[.](mp3|wav|ogg|m4a|aac|flac|webm)$'
   and audio_url !~ '[?#[:space:]]'
   and strpos(audio_url,chr(92))=0
   and audio_url !~* '(%2e|%2f|%5c|/[.][.]?(/|$))'
  )
 ))
) not valid;
alter table public.sb_library_tracks validate constraint sb_library_tracks_check;
commit;
