begin;
create table public.sb_library_submissions(
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references public.sb_profiles(id) on delete cascade,
 source_track_id uuid references public.sb_tracks(id) on delete set null,
 name text not null check(char_length(trim(name)) between 1 and 120),category text not null default 'Comunidade' check(char_length(category) between 1 and 60),
 author text not null check(char_length(trim(author)) between 1 and 160),credit text not null check(char_length(credit)<=600),license text not null check(char_length(trim(license)) between 1 and 120),
 source_url text check(source_url is null or source_url ~ '^https://'),consent boolean not null check(consent),
 object_path text not null unique,filename text not null check(char_length(filename) between 1 and 220),mime text not null,file_size bigint not null check(file_size between 1 and 26214400),
 status text not null default 'pending' check(status in('pending','approved','rejected')),created_at timestamptz not null default now(),reviewed_at timestamptz,reviewed_by uuid references auth.users(id),library_id text references public.sb_library_tracks(id),
 check(object_path=user_id::text||'/'||id::text||'.'||case mime when 'audio/mpeg' then 'mp3' when 'audio/wav' then 'wav' when 'audio/ogg' then 'ogg' when 'audio/mp4' then 'm4a' when 'audio/aac' then 'aac' when 'audio/flac' then 'flac' when 'audio/webm' then 'webm' else '?' end)
);
create index sb_submissions_owner on public.sb_library_submissions(user_id,created_at desc);
create index sb_submissions_pending on public.sb_library_submissions(status,created_at);
create unique index sb_submissions_one_pending_track on public.sb_library_submissions(user_id,source_track_id) where status='pending';
alter table public.sb_library_submissions enable row level security;
revoke all on public.sb_library_submissions from public,anon,authenticated;
grant select on public.sb_library_submissions to authenticated;
grant insert(id,user_id,source_track_id,name,category,author,credit,license,source_url,consent,object_path,filename,mime,file_size) on public.sb_library_submissions to authenticated;
create policy sb_submission_read on public.sb_library_submissions for select to authenticated using((select soundbar_private.sb_is_approved()) and (user_id=(select auth.uid()) or (select soundbar_private.sb_is_admin())));
create policy sb_submission_insert on public.sb_library_submissions for insert to authenticated with check(user_id=(select auth.uid()) and (select soundbar_private.sb_is_approved()) and status='pending' and consent and reviewed_at is null and reviewed_by is null and library_id is null and exists(select 1 from public.sb_tracks t where t.id=source_track_id and t.user_id=(select auth.uid()) and t.audio_path is not null));
create function soundbar_private.sb_submission_limit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or new.user_id<>auth.uid() or not soundbar_private.sb_is_approved() then raise exception 'Conta indisponível' using errcode='42501';end if;
 perform 1 from public.sb_profiles where id=auth.uid() for update;
 if (select count(*) from public.sb_library_submissions where user_id=auth.uid() and status='pending')>=10 then raise exception 'Limite de 10 contribuições pendentes. Aguarde a revisão.';end if;
 return new;
end $$;
revoke all on function soundbar_private.sb_submission_limit() from public,anon,authenticated;
create trigger sb_submission_limit before insert on public.sb_library_submissions for each row execute function soundbar_private.sb_submission_limit();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('soundbar-submissions','soundbar-submissions',false,26214400,array['audio/mpeg','audio/wav','audio/ogg','audio/mp4','audio/aac','audio/flac','audio/webm']);
create function soundbar_private.sb_submission_storage_quota(candidate jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare incoming bigint;used bigint;
begin
 if auth.uid() is null or not soundbar_private.sb_is_approved() then return false;end if;
 perform 1 from public.sb_profiles where id=auth.uid() for update;if not found then return false;end if;
 incoming:=coalesce((candidate->>'size')::bigint,26214400);if incoming<1 or incoming>26214400 then return false;end if;
 select coalesce(sum(coalesce((metadata->>'size')::bigint,26214400)),0) into used from storage.objects where bucket_id='soundbar-submissions' and (storage.foldername(name))[1]=auth.uid()::text;
 return used+incoming<=104857600;
end $$;
revoke all on function soundbar_private.sb_submission_storage_quota(jsonb) from public,anon;
grant execute on function soundbar_private.sb_submission_storage_quota(jsonb) to authenticated;
create policy sb_submission_upload on storage.objects for insert to authenticated with check(bucket_id='soundbar-submissions' and (select soundbar_private.sb_is_approved()) and name ~ ('^'||(select auth.uid())::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp3|wav|ogg|m4a|aac|flac|webm)$') and soundbar_private.sb_submission_storage_quota(metadata));
create policy sb_submission_audio_read on storage.objects for select to authenticated using(bucket_id='soundbar-submissions' and (select soundbar_private.sb_is_approved()) and ((storage.foldername(name))[1]=(select auth.uid())::text or ((select soundbar_private.sb_is_admin()) and exists(select 1 from public.sb_library_submissions s where s.object_path=storage.objects.name and s.consent))));
create policy sb_submission_audio_cleanup on storage.objects for delete to authenticated using(bucket_id='soundbar-submissions' and (select soundbar_private.sb_is_approved()) and (((storage.foldername(name))[1]=(select auth.uid())::text and not exists(select 1 from public.sb_library_submissions s where s.object_path=storage.objects.name)) or ((select soundbar_private.sb_is_admin()) and exists(select 1 from public.sb_library_submissions s where s.object_path=storage.objects.name and s.status<>'pending'))));
create function soundbar_private.sb_review_submission(target_submission uuid,new_status text,published_id text) returns void language plpgsql security definer set search_path='' as $$
declare existing public.sb_library_submissions;
begin
 if not soundbar_private.sb_is_admin() then raise exception 'Acesso exclusivo do administrador' using errcode='42501';end if;
 if new_status not in('approved','rejected') or new_status is null then raise exception 'Situação inválida';end if;
 select * into existing from public.sb_library_submissions where id=target_submission for update;
 if not found then raise exception 'Contribuição não encontrada';end if;
 if existing.status=new_status then return;end if;
 if existing.status<>'pending' then raise exception 'Esta contribuição já foi revisada';end if;
 if new_status='approved' and (published_id is distinct from target_submission::text or not exists(select 1 from public.sb_library_tracks where id=published_id and active)) then raise exception 'Publique o áudio validado antes de aprovar';end if;
 update public.sb_library_submissions set status=new_status,reviewed_at=now(),reviewed_by=auth.uid(),library_id=case when new_status='approved' then published_id else null end where id=target_submission;
end $$;
revoke all on function soundbar_private.sb_review_submission(uuid,text,text) from public,anon;
grant execute on function soundbar_private.sb_review_submission(uuid,text,text) to authenticated;
create function public.sb_review_submission(target_submission uuid,new_status text,published_id text default null) returns void language sql security invoker set search_path='' as $$select soundbar_private.sb_review_submission(target_submission,new_status,published_id);$$;
revoke all on function public.sb_review_submission(uuid,text,text) from public,anon;
grant execute on function public.sb_review_submission(uuid,text,text) to authenticated;
commit;
