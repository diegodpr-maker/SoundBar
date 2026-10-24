begin;
create index sb_submissions_source_idx on public.sb_library_submissions(source_track_id) where source_track_id is not null;
create index sb_submissions_library_idx on public.sb_library_submissions(library_id) where library_id is not null;
create or replace function soundbar_private.sb_submission_storage_quota(candidate jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare incoming bigint;used bigint;items bigint;
begin
 if auth.uid() is null or not soundbar_private.sb_is_approved() then return false;end if;
 perform 1 from public.sb_profiles where id=auth.uid() for update;if not found then return false;end if;
 incoming:=coalesce((candidate->>'size')::bigint,26214400);if incoming<1 or incoming>26214400 then return false;end if;
 select count(*),coalesce(sum(coalesce((metadata->>'size')::bigint,26214400)),0) into items,used from storage.objects where bucket_id='soundbar-submissions' and (storage.foldername(name))[1]=auth.uid()::text;
 return items<20 and used+incoming<=104857600;
end $$;
commit;
