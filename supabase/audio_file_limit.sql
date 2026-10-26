begin;
-- Raise private audio and contribution file limits to 30 MiB.
update storage.buckets set file_size_limit=31457280 where id in('soundbar-audio','soundbar-submissions');
alter table public.sb_tracks drop constraint sb_tracks_file_size_check, add constraint sb_tracks_file_size_check check(file_size between 0 and 31457280);
alter table public.sb_library_submissions drop constraint sb_library_submissions_file_size_check, add constraint sb_library_submissions_file_size_check check(file_size between 1 and 31457280);
create or replace function soundbar_private.sb_storage_quota(candidate jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare used_bytes bigint; incoming_bytes bigint;
begin
 if auth.uid() is null then return false;end if;
 perform 1 from public.sb_profiles where id=auth.uid() for update;
 if not found then return false;end if;
 incoming_bytes=coalesce((candidate->>'size')::bigint,31457280);
 if incoming_bytes<1 or incoming_bytes>31457280 then return false;end if;
 select coalesce(sum(coalesce((metadata->>'size')::bigint,31457280)),0) into used_bytes
 from storage.objects where bucket_id='soundbar-audio' and (storage.foldername(name))[1]=auth.uid()::text;
 return used_bytes+incoming_bytes<=1073741824;
end;$$;
create or replace function soundbar_private.sb_submission_storage_quota(candidate jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare incoming bigint;used bigint;items bigint;
begin
 if auth.uid() is null or not soundbar_private.sb_is_approved() then return false;end if;
 perform 1 from public.sb_profiles where id=auth.uid() for update;if not found then return false;end if;
 incoming:=coalesce((candidate->>'size')::bigint,31457280);if incoming<1 or incoming>31457280 then return false;end if;
 select count(*),coalesce(sum(coalesce((metadata->>'size')::bigint,31457280)),0) into items,used from storage.objects where bucket_id='soundbar-submissions' and (storage.foldername(name))[1]=auth.uid()::text;
 return items<20 and used+incoming<=104857600;
end $$;
commit;
