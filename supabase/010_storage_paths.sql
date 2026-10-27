begin;
-- Additional restrictive INSERT guard. Existing audio and service-role imports remain readable.
create policy sb_safe_audio_paths on storage.objects as restrictive for insert to authenticated
with check (
 bucket_id not in ('soundbar-audio','soundbar-library')
 or (bucket_id='soundbar-audio' and name ~ ('^'||(select auth.uid())::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp3|wav|ogg|m4a|aac|flac|webm)$'))
 or (bucket_id='soundbar-library' and name ~ '^custom/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp3|wav|ogg|m4a|aac|flac|webm)$')
);
revoke execute on function public.sb_touch_playlist() from public,anon,authenticated;
commit;
