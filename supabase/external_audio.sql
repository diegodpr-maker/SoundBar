-- Verified cPanel media keeps existing track identifiers and shared references.
create table soundbar_private.sb_external_media_config(
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 media_key text not null check(media_key ~ '^[a-f0-9]{64}$'),
 verify_key text not null check(verify_key ~ '^[a-f0-9]{64}$'),
 activated_at timestamptz,
 cleanup_after timestamptz,
 cleanup_complete boolean not null default false
);
create table soundbar_private.sb_external_media_objects(
 object_id uuid primary key,
 bucket text not null check(bucket in('soundbar-audio','soundbar-library')),
 object_path text not null,
 owner_id uuid,
 content_sha256 text not null check(content_sha256 ~ '^[a-f0-9]{64}$'),
 file_size bigint not null check(file_size between 1 and 52428800),
 source_etag text not null,
 access_kind text not null check(access_kind in('private','public-library')),
 verified_at timestamptz not null,
 removed_at timestamptz,
 unique(bucket,object_path)
);
create index sb_external_media_owner_idx on soundbar_private.sb_external_media_objects(owner_id) where bucket='soundbar-audio';
create index sb_external_media_hash_idx on soundbar_private.sb_external_media_objects(content_sha256);
create table soundbar_private.sb_external_media_library_before(
 id text primary key,
 original_row jsonb not null,
 target_url text not null,
 migrated_at timestamptz not null default now()
);
alter table soundbar_private.sb_external_media_config enable row level security;
alter table soundbar_private.sb_external_media_objects enable row level security;
alter table soundbar_private.sb_external_media_library_before enable row level security;
revoke all on soundbar_private.sb_external_media_config,soundbar_private.sb_external_media_objects,soundbar_private.sb_external_media_library_before from public,anon,authenticated;
grant all on soundbar_private.sb_external_media_config,soundbar_private.sb_external_media_objects,soundbar_private.sb_external_media_library_before to service_role;
create policy sb_external_config_deny on soundbar_private.sb_external_media_config for all to anon,authenticated using(false) with check(false);
create policy sb_external_objects_deny on soundbar_private.sb_external_media_objects for all to anon,authenticated using(false) with check(false);
create policy sb_external_library_backup_deny on soundbar_private.sb_external_media_library_before for all to anon,authenticated using(false) with check(false);

create function soundbar_private.sb_external_audio_enabled() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and coalesce((select enabled from soundbar_private.sb_external_media_config where singleton),false);
$$;
revoke all on function soundbar_private.sb_external_audio_enabled() from public,anon;
grant execute on function soundbar_private.sb_external_audio_enabled() to authenticated;

create or replace function public.sb_account_state() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('user_id',auth.uid(),'status',coalesce((select status from public.sb_account_access where user_id=auth.uid()),case when soundbar_private.sb_account_removed() then 'deleted' else 'pending' end),
 'is_admin',soundbar_private.sb_is_admin(),'limits',soundbar_private.sb_my_limits(),'plan',soundbar_private.sb_my_plan(),'can_upload',soundbar_private.sb_can_upload(),
 'external_audio_enabled',soundbar_private.sb_external_audio_enabled());
$$;

create function soundbar_private.sb_external_audio_urls(track_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();settings soundbar_private.sb_external_media_config;expires bigint;answer jsonb;
begin
 if actor is null or not soundbar_private.sb_is_approved() or soundbar_private.sb_account_removed() then raise exception 'Sua conta precisa estar liberada.' using errcode='42501';end if;
 if track_ids is null or cardinality(track_ids)>1000 then raise exception 'Seleção de faixas inválida.' using errcode='22023';end if;
 select * into settings from soundbar_private.sb_external_media_config where singleton;
 if not coalesce(settings.enabled,false) then return '[]'::jsonb;end if;
 expires:=floor(extract(epoch from now()))::bigint+300;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'size',o.file_size,'expires_at',expires,'url',
 case when o.access_kind='public-library' then 'https://sysmacom.com.br/harmony-midia/biblioteca/'||o.content_sha256||'.mp3'
 else 'https://sysmacom.com.br/harmony-midia/audio.php?id='||o.content_sha256||'&e='||expires::text||'&s='||
 encode(extensions.hmac(convert_to('harmony-audio-v1'||E'\n'||o.content_sha256||E'\n'||expires::text,'UTF8'),decode(settings.media_key,'hex'),'sha256'),'hex') end) order by t.id),'[]'::jsonb)
 into answer from public.sb_tracks t join soundbar_private.sb_external_media_objects o on o.bucket='soundbar-audio' and o.object_path=t.audio_path
 where t.user_id=actor and t.id=any(track_ids);
 return answer;
end$$;
revoke all on function soundbar_private.sb_external_audio_urls(uuid[]) from public,anon;
grant execute on function soundbar_private.sb_external_audio_urls(uuid[]) to authenticated;
create function public.sb_external_audio_urls(track_ids uuid[]) returns jsonb
language sql stable security invoker set search_path='' as $$select soundbar_private.sb_external_audio_urls(track_ids)$$;
revoke all on function public.sb_external_audio_urls(uuid[]) from public,anon;
grant execute on function public.sb_external_audio_urls(uuid[]) to authenticated;

-- Count each historical source path once, and do not count its overlap twice during rollout.
create function soundbar_private.sb_owned_audio_bytes(actor uuid) returns bigint
language sql stable security definer set search_path='' as $$
 select coalesce((select sum(coalesce((metadata->>'size')::bigint,52428800)) from storage.objects where bucket_id='soundbar-audio' and split_part(name,'/',1)=actor::text),0)
 + coalesce((select sum(o.file_size) from soundbar_private.sb_external_media_objects o
 where o.bucket='soundbar-audio' and o.owner_id=actor
 and exists(select 1 from soundbar_private.sb_external_media_config where singleton and enabled)
 and exists(select 1 from public.sb_tracks t where t.audio_path=o.object_path)
 and not exists(select 1 from storage.objects s where s.bucket_id='soundbar-audio' and s.name=o.object_path)),0);
$$;
revoke all on function soundbar_private.sb_owned_audio_bytes(uuid) from public,anon,authenticated;
create function soundbar_private.sb_my_audio_usage() returns bigint
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not soundbar_private.sb_is_approved() or soundbar_private.sb_account_removed() then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 return soundbar_private.sb_owned_audio_bytes(auth.uid());
end$$;
revoke all on function soundbar_private.sb_my_audio_usage() from public,anon;
grant execute on function soundbar_private.sb_my_audio_usage() to authenticated;
create function public.sb_my_audio_usage() returns bigint
language sql stable security invoker set search_path='' as $$select soundbar_private.sb_my_audio_usage()$$;
revoke all on function public.sb_my_audio_usage() from public,anon;
grant execute on function public.sb_my_audio_usage() to authenticated;

-- Migrated paths remain immutable even after their former Storage objects are removed.
create function soundbar_private.sb_external_upload_allowed(target_bucket text,target_path text) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if target_bucket not in('soundbar-audio','soundbar-library') then return true;end if;
 if auth.uid() is null then return false;end if;
 if target_bucket='soundbar-audio' and split_part(target_path,'/',1)<>auth.uid()::text then return false;end if;
 if target_bucket='soundbar-library' and not soundbar_private.sb_is_admin() then return false;end if;
 return not exists(select 1 from soundbar_private.sb_external_media_objects where bucket=target_bucket and object_path=target_path);
end$$;
revoke all on function soundbar_private.sb_external_upload_allowed(text,text) from public,anon;
grant execute on function soundbar_private.sb_external_upload_allowed(text,text) to authenticated;
create policy sb_external_audio_insert_guard on storage.objects as restrictive for insert to authenticated
 with check(soundbar_private.sb_external_upload_allowed(bucket_id,name));
create policy sb_external_audio_update_guard on storage.objects as restrictive for update to authenticated
 using(soundbar_private.sb_external_upload_allowed(bucket_id,name)) with check(soundbar_private.sb_external_upload_allowed(bucket_id,name));

alter table public.sb_library_tracks drop constraint sb_library_tracks_check;
alter table public.sb_library_tracks add constraint sb_library_tracks_check check(
 (object_path is not null and audio_url='https://xrwvszghwijgagarfcnf.supabase.co/storage/v1/object/public/soundbar-library/'||object_path)
 or (object_path is null and (active=false or (
 audio_url ~ '^https://sysmacom[.]com[.]br/(musicas-harmony/|harmony-midia/biblioteca/)'
 and audio_url ~* '[.](mp3|wav|ogg|m4a|aac|flac|webm)$'
 and audio_url !~ '[?#[:space:]]' and strpos(audio_url,chr(92))=0
 and audio_url !~* '(%2e|%2f|%5c|/[.][.]?(/|$))')))
);
notify pgrst,'reload schema';


-- Preserve sharing, limits and existing immutable source checks after offload.
CREATE OR REPLACE FUNCTION soundbar_private.sb_check_track_file_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if object_size is null and exists(select 1 from soundbar_private.sb_external_media_config where singleton and enabled) then select file_size into object_size from soundbar_private.sb_external_media_objects where bucket='soundbar-audio' and object_path=new.audio_path for share;end if;
  if object_size is null or object_size<>new.file_size then raise exception 'Não foi possível confirmar o arquivo de áudio.' using errcode='23514';end if;
 end if;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION soundbar_private.sb_import_shared_playlist(share_token uuid, revision text, target uuid, mapping jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   if not found then perform 1 from soundbar_private.sb_external_media_objects o where o.bucket='soundbar-audio' and o.object_path=path and o.file_size=(item->>'file_size')::bigint and exists(select 1 from soundbar_private.sb_external_media_config where singleton and enabled) for share; if not found then raise exception 'Um áudio desta playlist está indisponível.';end if;end if;
   insert into soundbar_private.sb_audio_reference_grants(user_id,audio_path) values(auth.uid(),path) on conflict do nothing;
  end if;
  insert into public.sb_tracks(id,user_id,playlist_id,name,color,sample_id,audio_path,filename,mime,file_size,position)
  values(dest_id,auth.uid(),target,item->>'name',item->>'color',item->>'sample_id',path,item->>'filename',item->>'mime',(item->>'file_size')::bigint,seq);seq:=seq+1;
 end loop;
 insert into public.sb_playlist_imports values(s,auth.uid(),target);return target;
end $function$
;
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
 select soundbar_private.sb_owned_audio_bytes(auth.uid()) into used_bytes;
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
 used as(select entry->>'user_id' as owner,soundbar_private.sb_owned_audio_bytes((entry->>'user_id')::uuid) as bytes from items)
 select coalesce(jsonb_agg(items.entry||jsonb_build_object('plan',soundbar_private.sb_effective_plan((items.entry->>'user_id')::uuid),'limits',soundbar_private.sb_effective_limits((items.entry->>'user_id')::uuid),'storage_bytes',coalesce(used.bytes,0)) order by items.n),'[]'::jsonb)
 into answer from items left join used on used.owner=items.entry->>'user_id';
 return answer;
end $function$
;
notify pgrst,'reload schema';
