-- Free/Pro entitlements and shared private-audio references. Public wrappers are invokers.
create table soundbar_private.sb_account_plans(
 user_id uuid primary key references auth.users(id) on delete cascade,
 plan text not null check(plan in ('free','pro')),
 updated_at timestamptz not null default now()
);
create table soundbar_private.sb_plan_audit(
 id bigint generated always as identity primary key,
 actor uuid references auth.users(id) on delete set null,
 target uuid not null references auth.users(id) on delete cascade,
 previous_plan text not null,new_plan text not null,
 created_at timestamptz not null default now()
);
create index sb_plan_audit_target_idx on soundbar_private.sb_plan_audit(target,created_at desc);
create index sb_plan_audit_actor_idx on soundbar_private.sb_plan_audit(actor);
create table soundbar_private.sb_audio_reference_grants(
 user_id uuid not null references auth.users(id) on delete cascade,
 audio_path text not null,
 created_at timestamptz not null default now(),
 primary key(user_id,audio_path),
 check(audio_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp3|wav|ogg|m4a|aac|flac|webm)$')
);
create index sb_audio_reference_path_idx on soundbar_private.sb_audio_reference_grants(audio_path);
alter table soundbar_private.sb_account_plans enable row level security;
alter table soundbar_private.sb_plan_audit enable row level security;
alter table soundbar_private.sb_audio_reference_grants enable row level security;
revoke all on soundbar_private.sb_account_plans,soundbar_private.sb_plan_audit,soundbar_private.sb_audio_reference_grants from public,anon,authenticated;
grant all on soundbar_private.sb_account_plans,soundbar_private.sb_plan_audit,soundbar_private.sb_audio_reference_grants to service_role;
create policy sb_account_plans_deny on soundbar_private.sb_account_plans for all to anon,authenticated using(false) with check(false);
create policy sb_plan_audit_deny on soundbar_private.sb_plan_audit for all to anon,authenticated using(false) with check(false);
create policy sb_audio_reference_grants_deny on soundbar_private.sb_audio_reference_grants for all to anon,authenticated using(false) with check(false);

create function soundbar_private.sb_effective_plan(target_user uuid) returns text
language sql stable security definer set search_path='' as $$
 select coalesce((select plan from soundbar_private.sb_account_plans where user_id=target_user),'free');
$$;
revoke all on function soundbar_private.sb_effective_plan(uuid) from public,anon,authenticated;
create function soundbar_private.sb_my_plan() returns text language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sessão necessária.' using errcode='42501';end if;
 return soundbar_private.sb_effective_plan(auth.uid());
end $$;
revoke all on function soundbar_private.sb_my_plan() from public,anon;
grant execute on function soundbar_private.sb_my_plan() to authenticated;
create function soundbar_private.sb_can_upload() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and soundbar_private.sb_is_approved()
 and (soundbar_private.sb_is_admin() or soundbar_private.sb_effective_plan(auth.uid())='pro');
$$;
revoke all on function soundbar_private.sb_can_upload() from public,anon;
grant execute on function soundbar_private.sb_can_upload() to authenticated;
create or replace function public.sb_account_state() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('user_id',auth.uid(),'status',coalesce((select status from public.sb_account_access where user_id=auth.uid()),case when soundbar_private.sb_account_removed() then 'deleted' else 'pending' end),
 'is_admin',soundbar_private.sb_is_admin(),'limits',soundbar_private.sb_my_limits(),'plan',soundbar_private.sb_my_plan(),'can_upload',soundbar_private.sb_can_upload());
$$;

create function soundbar_private.sb_admin_set_account_plan(target_user uuid,new_plan text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old_plan text;
begin
 if auth.uid() is null or not soundbar_private.sb_is_admin() then raise exception 'Acesso exclusivo do administrador.' using errcode='42501';end if;
 if new_plan is null or new_plan not in ('free','pro') then raise exception 'Escolha Free ou Pro.' using errcode='22023';end if;
 perform 1 from public.sb_profiles where id=target_user for update;
 perform 1 from public.sb_account_access where user_id=target_user for update;
 if not found then raise exception 'Conta não encontrada.' using errcode='P0002';end if;
 if exists(select 1 from soundbar_private.sb_account_deletions where user_id=target_user) then raise exception 'A conta está em exclusão.';end if;
 old_plan:=soundbar_private.sb_effective_plan(target_user);
 if old_plan<>new_plan then
  insert into soundbar_private.sb_account_plans(user_id,plan) values(target_user,new_plan)
  on conflict(user_id) do update set plan=excluded.plan,updated_at=now();
  insert into soundbar_private.sb_plan_audit(actor,target,previous_plan,new_plan) values(auth.uid(),target_user,old_plan,new_plan);
 end if;
 return jsonb_build_object('plan',new_plan,'limits',soundbar_private.sb_effective_limits(target_user));
end $$;
revoke all on function soundbar_private.sb_admin_set_account_plan(uuid,text) from public,anon;
grant execute on function soundbar_private.sb_admin_set_account_plan(uuid,text) to authenticated;
create function public.sb_admin_set_account_plan(target_user uuid,new_plan text) returns jsonb
language sql security invoker set search_path='' as $$select soundbar_private.sb_admin_set_account_plan(target_user,new_plan)$$;
revoke all on function public.sb_admin_set_account_plan(uuid,text) from public,anon;
grant execute on function public.sb_admin_set_account_plan(uuid,text) to authenticated;

-- Restrictive policies also stop old installed clients and forged REST requests.
create policy sb_audio_plan_insert on storage.objects as restrictive for insert to authenticated
 with check(bucket_id not in ('soundbar-audio','soundbar-submissions') or (select soundbar_private.sb_can_upload()));
create policy sb_audio_plan_update on storage.objects as restrictive for update to authenticated
 using(bucket_id not in ('soundbar-audio','soundbar-submissions') or (select soundbar_private.sb_can_upload()))
 with check(bucket_id not in ('soundbar-audio','soundbar-submissions') or (select soundbar_private.sb_can_upload()));
create policy sb_submission_plan_insert on public.sb_library_submissions as restrictive for insert to authenticated
 with check((select soundbar_private.sb_can_upload()));

CREATE OR REPLACE FUNCTION soundbar_private.sb_storage_quota(candidate jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare used_bytes bigint;incoming_bytes bigint;limits jsonb;file_limit bigint;storage_limit bigint;
begin
 if auth.uid() is null or not soundbar_private.sb_can_upload() then return false;end if;
 perform 1 from public.sb_profiles where id=auth.uid() for update;if not found then return false;end if;
 limits:=soundbar_private.sb_effective_limits(auth.uid());file_limit:=(limits->>'file')::bigint;storage_limit:=(limits->>'storage')::bigint;
 -- Storage preauthorization may omit size: keep a conservative reservation.
 incoming_bytes:=coalesce((candidate->>'size')::bigint,file_limit);
 if incoming_bytes<1 or incoming_bytes>file_limit then return false;end if;
 select coalesce(sum(coalesce((metadata->>'size')::bigint,52428800)),0) into used_bytes from storage.objects
 where bucket_id='soundbar-audio' and (storage.foldername(name))[1]=auth.uid()::text;
 return used_bytes+incoming_bytes<=storage_limit;
end $function$
;

CREATE OR REPLACE FUNCTION soundbar_private.sb_admin_accounts_with_limits()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare accounts jsonb;answer jsonb;
begin
 if not soundbar_private.sb_is_admin() then raise exception 'Acesso exclusivo do administrador.' using errcode='42501';end if;
 accounts:=soundbar_private.sb_admin_accounts();
 with items as(select value as entry,ordinality as n from jsonb_array_elements(accounts) with ordinality),
 used as(select split_part(name,'/',1) as owner,coalesce(sum(coalesce((metadata->>'size')::bigint,52428800)),0) as bytes
 from storage.objects where bucket_id='soundbar-audio' and split_part(name,'/',1) in(select entry->>'user_id' from items) group by 1)
 select coalesce(jsonb_agg(items.entry||jsonb_build_object('plan',soundbar_private.sb_effective_plan((items.entry->>'user_id')::uuid),'limits',soundbar_private.sb_effective_limits((items.entry->>'user_id')::uuid),'storage_bytes',coalesce(used.bytes,0)) order by items.n),'[]'::jsonb)
 into answer from items left join used on used.owner=items.entry->>'user_id';
 return answer;
end $function$
;

-- A track is a reference; library items already use sample_id.
alter table public.sb_tracks drop constraint sb_tracks_audio_path_key;
alter table public.sb_tracks drop constraint sb_tracks_check;
alter table public.sb_tracks add constraint sb_tracks_check check(
 (sample_id is not null and audio_path is null and file_size=0)
 or (sample_id is null and audio_path is not null and audio_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp3|wav|ogg|m4a|aac|flac|webm)$')
);
create index sb_tracks_audio_path_idx on public.sb_tracks(audio_path) where audio_path is not null;
create or replace function soundbar_private.sb_check_track_file_limit() returns trigger
language plpgsql security definer set search_path='' as $$
declare object_size bigint;own_path boolean;already_used boolean;
begin
 if auth.uid() is null or new.user_id is distinct from auth.uid() then raise exception 'Conta inválida.' using errcode='42501';end if;
 if tg_op='UPDATE' and (new.audio_path is distinct from old.audio_path or new.file_size is distinct from old.file_size or new.user_id is distinct from old.user_id or new.sample_id is distinct from old.sample_id) then
  raise exception 'O arquivo desta faixa não pode ser substituído.' using errcode='42501';
 end if;
 if new.audio_path is not null then
  perform pg_advisory_xact_lock(hashtextextended('harmony-audio:'||new.audio_path,0));
  own_path:=split_part(new.audio_path,'/',1)=auth.uid()::text;
  select exists(select 1 from public.sb_tracks where user_id=auth.uid() and audio_path=new.audio_path) into already_used;
  if own_path then
   if not already_used and not soundbar_private.sb_can_upload() then raise exception 'Envio de áudios disponível no plano Pro.' using errcode='42501';end if;
   if not already_used and new.file_size>(soundbar_private.sb_effective_limits(new.user_id)->>'file')::bigint then
    raise exception 'Este áudio ultrapassa o limite por arquivo da sua conta.' using errcode='23514';
   end if;
  elsif not exists(select 1 from soundbar_private.sb_audio_reference_grants where user_id=auth.uid() and audio_path=new.audio_path) then
   raise exception 'Este áudio não foi compartilhado com sua conta.' using errcode='42501';
  end if;
  select (metadata->>'size')::bigint into object_size from storage.objects where bucket_id='soundbar-audio' and name=new.audio_path for share;
  if object_size is null or object_size<>new.file_size then raise exception 'Não foi possível confirmar o arquivo de áudio.' using errcode='23514';end if;
 end if;
 return new;
end $$;
drop trigger sb_track_file_limit on public.sb_tracks;
create trigger sb_track_file_limit before insert or update of audio_path,file_size,user_id,sample_id on public.sb_tracks
 for each row execute function soundbar_private.sb_check_track_file_limit();

create function soundbar_private.sb_audio_reference_read(path text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and soundbar_private.sb_is_approved()
 and (exists(select 1 from public.sb_tracks where user_id=auth.uid() and audio_path=path)
 or (exists(select 1 from soundbar_private.sb_audio_reference_grants where user_id=auth.uid() and audio_path=path)
 and not exists(select 1 from auth.users where id::text=split_part(path,'/',1))));
$$;
revoke all on function soundbar_private.sb_audio_reference_read(text) from public,anon;
grant execute on function soundbar_private.sb_audio_reference_read(text) to authenticated;
create policy sb_audio_reference_read on storage.objects for select to authenticated
 using(bucket_id='soundbar-audio' and soundbar_private.sb_audio_reference_read(name));
create function soundbar_private.sb_audio_can_delete(path text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
begin
 if auth.uid() is null or not soundbar_private.sb_is_approved() then return false;end if;
 if split_part(path,'/',1)<>auth.uid()::text and not (
  exists(select 1 from soundbar_private.sb_audio_reference_grants where user_id=auth.uid() and audio_path=path)
  and not exists(select 1 from auth.users where id::text=split_part(path,'/',1))
 ) then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended('harmony-audio:'||path,0));
 return not exists(select 1 from public.sb_tracks where audio_path=path);
end $$;
revoke all on function soundbar_private.sb_audio_can_delete(text) from public,anon;
grant execute on function soundbar_private.sb_audio_can_delete(text) to authenticated;
drop policy sb_audio_delete on storage.objects;
create policy sb_audio_delete on storage.objects for delete to authenticated
 using(bucket_id='soundbar-audio' and soundbar_private.sb_audio_can_delete(name));
-- Guard any future permissive delete policy as well.
create policy sb_audio_reference_delete on storage.objects as restrictive for delete to authenticated
 using(bucket_id<>'soundbar-audio' or soundbar_private.sb_audio_can_delete(name));

create or replace function soundbar_private.sb_import_shared_playlist(share_token uuid,revision text,target uuid,mapping jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare doc jsonb;s uuid;existing uuid;item jsonb;dest jsonb;p jsonb;dest_id uuid;path text;seq integer:=0;source_owner uuid;
begin
 if auth.uid() is null or not soundbar_private.sb_is_approved() then raise exception 'Sua conta precisa estar liberada.' using errcode='42501';end if;
 select user_id into source_owner from public.sb_playlist_shares where token=share_token;
 perform 1 from public.sb_profiles where id in(auth.uid(),source_owner) order by id for update;
 doc:=soundbar_private.sb_get_shared_playlist(share_token);s:=(doc->>'share_id')::uuid;
 select playlist_id into existing from public.sb_playlist_imports where share_id=s and user_id=auth.uid();if found then return existing;end if;
 if doc->>'revision' is distinct from revision then raise exception 'A playlist mudou. Abra novamente.';end if;
 if target is null or mapping is null or jsonb_typeof(mapping)<>'array' or jsonb_array_length(mapping)<>jsonb_array_length(doc->'tracks')
 or (select count(distinct x->>'source_id') from jsonb_array_elements(mapping)x)<>jsonb_array_length(mapping)
 or (select count(distinct x->>'dest_id') from jsonb_array_elements(mapping)x)<>jsonb_array_length(mapping) then raise exception 'Importação incompleta.';end if;
 p:=doc->'playlist';
 insert into public.sb_playlists(id,user_id,name,description,color,play_mode,loop,retrigger,switch_mode,event_fade_enabled,event_fade_duration)
 values(target,auth.uid(),p->>'name',p->>'description',p->>'color',p->>'play_mode',(p->>'loop')::boolean,p->>'retrigger',p->>'switch_mode',coalesce((p->>'event_fade_enabled')::boolean,true),coalesce((p->>'event_fade_duration')::integer,2000));
 for item in select value from jsonb_array_elements(doc->'tracks') loop
  select value into dest from jsonb_array_elements(mapping) where value->>'source_id'=item->>'id';if not found then raise exception 'Importação incompleta.';end if;
  dest_id:=(dest->>'dest_id')::uuid;if dest_id is null then raise exception 'Importação incompleta.';end if;path:=item->>'audio_path';
  if path is not null then
   -- Only this checked, consensual snapshot issues grants. No arbitrary caller paths.
   perform 1 from storage.objects where bucket_id='soundbar-audio' and name=path and (metadata->>'size')::bigint=(item->>'file_size')::bigint for share;
   if not found then raise exception 'Um áudio desta playlist está indisponível.';end if;
   insert into soundbar_private.sb_audio_reference_grants(user_id,audio_path) values(auth.uid(),path) on conflict do nothing;
  end if;
  insert into public.sb_tracks(id,user_id,playlist_id,name,color,sample_id,audio_path,filename,mime,file_size,position)
  values(dest_id,auth.uid(),target,item->>'name',item->>'color',item->>'sample_id',path,item->>'filename',item->>'mime',(item->>'file_size')::bigint,seq);seq:=seq+1;
 end loop;
 insert into public.sb_playlist_imports values(s,auth.uid(),target);return target;
end $$;

CREATE OR REPLACE FUNCTION soundbar_private.sb_account_deletion_service(action text, target uuid, token uuid, details jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare job soundbar_private.sb_account_deletions;next_status text:=details->>'status';
begin
 select * into job from soundbar_private.sb_account_deletions where user_id=target and lease=token and status='working' and lease_until>now() for update;
 if not found then raise exception 'Deletion lease unavailable' using errcode='55P03';end if;
 if action='files' then
 -- Retain shared physical objects and detach only their Auth ownership metadata.
 -- Bytes remain untouched; RLS continues to authorize through playlist references.
 update storage.objects o set owner=null,owner_id=null where o.bucket_id='soundbar-audio' and split_part(o.name,'/',1)=target::text
 and exists(select 1 from public.sb_tracks t where t.audio_path=o.name and t.user_id<>target);
 return coalesce((select jsonb_agg(to_jsonb(f)) from (select bucket_id as bucket,name as path from storage.objects where bucket_id in('soundbar-audio','soundbar-submissions') and split_part(name,'/',1)=target::text and (bucket_id<>'soundbar-audio' or not exists(select 1 from public.sb_tracks t where t.audio_path=storage.objects.name and t.user_id<>target)) order by bucket_id,name limit 200) f),'[]'::jsonb);
 elsif action='finish' then
 if next_status not in('queued','failed','completed') or next_status is null then raise exception 'Invalid deletion state';end if;
 if next_status='completed' and (exists(select 1 from auth.users where id=target) or exists(select 1 from storage.objects where bucket_id in('soundbar-audio','soundbar-submissions') and split_part(name,'/',1)=target::text and (bucket_id<>'soundbar-audio' or not exists(select 1 from public.sb_tracks t where t.audio_path=storage.objects.name and t.user_id<>target)))) then raise exception 'Account deletion incomplete';end if;
 update soundbar_private.sb_account_deletions set status=next_status,lease=null,lease_until=null,updated_at=now(),phase=case when next_status='completed' then 'done' else case when details->>'phase'='auth' then 'auth' else 'files' end end,last_status=case when (details->>'http_status')::integer between 0 and 599 then (details->>'http_status')::integer else 0 end,email=case when next_status='completed' then null else email end,display_name=case when next_status='completed' then null else display_name end where user_id=target;
 return '{"ok":true}'::jsonb;
 end if;
 raise exception 'Invalid deletion action';
end$function$
;

notify pgrst,'reload schema';
