-- Per-account private-playlist limits. Defaults preserve existing accounts.
begin;
create table soundbar_private.sb_account_limits(
 user_id uuid primary key references auth.users(id) on delete cascade,
 file_bytes bigint not null default 31457280 check(file_bytes between 1048576 and 52428800 and file_bytes%1048576=0),
 storage_bytes bigint not null default 1073741824 check(storage_bytes between 1048576 and 107374182400 and storage_bytes%1048576=0),
 updated_at timestamptz not null default now(),
 check(storage_bytes>=file_bytes)
);
create table soundbar_private.sb_account_limit_audit(
 id bigint generated always as identity primary key,
 actor uuid references auth.users(id) on delete set null,
 target uuid not null references auth.users(id) on delete cascade,
 previous_limits jsonb not null,new_limits jsonb not null,created_at timestamptz not null default now()
);
create index sb_account_limit_audit_target_idx on soundbar_private.sb_account_limit_audit(target,created_at desc);
alter table soundbar_private.sb_account_limits enable row level security;
alter table soundbar_private.sb_account_limit_audit enable row level security;
revoke all on soundbar_private.sb_account_limits,soundbar_private.sb_account_limit_audit from public,anon,authenticated;
create policy sb_account_limits_no_client_access on soundbar_private.sb_account_limits for all to anon,authenticated using(false) with check(false);
create policy sb_account_limit_audit_no_client_access on soundbar_private.sb_account_limit_audit for all to anon,authenticated using(false) with check(false);

create function soundbar_private.sb_effective_limits(target_user uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('file',coalesce((select file_bytes from soundbar_private.sb_account_limits where user_id=target_user),31457280),
 'storage',coalesce((select storage_bytes from soundbar_private.sb_account_limits where user_id=target_user),1073741824));
$$;
revoke all on function soundbar_private.sb_effective_limits(uuid) from public,anon,authenticated;
create function soundbar_private.sb_my_limits()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sessão necessária.' using errcode='42501';end if;
 return soundbar_private.sb_effective_limits(auth.uid());
end $$;
revoke all on function soundbar_private.sb_my_limits() from public,anon;
grant execute on function soundbar_private.sb_my_limits() to authenticated;
create or replace function public.sb_account_state() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('user_id',auth.uid(),'status',coalesce((select status from public.sb_account_access where user_id=auth.uid()),case when soundbar_private.sb_account_removed() then 'deleted' else 'pending' end),
 'is_admin',soundbar_private.sb_is_admin(),'limits',soundbar_private.sb_my_limits());
$$;

create function soundbar_private.sb_admin_set_account_limits(target_user uuid,max_file_bytes bigint,max_storage_bytes bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous jsonb;current_limits jsonb;
begin
 if not soundbar_private.sb_is_admin() then raise exception 'Acesso exclusivo do administrador.' using errcode='42501';end if;
 if max_file_bytes is null or max_storage_bytes is null or max_file_bytes<1048576 or max_file_bytes>52428800 or max_file_bytes%1048576<>0
 or max_storage_bytes<max_file_bytes or max_storage_bytes>107374182400 or max_storage_bytes%1048576<>0 then
  raise exception 'Limites inválidos. Defina de 1 a 50 MB por áudio e espaço total de até 100 GB, suficiente para um áudio.';
 end if;
 -- Serialize limit changes with uploads/imports, without changing existing files.
 perform 1 from public.sb_profiles where id=target_user for update;
 perform 1 from public.sb_account_access where user_id=target_user for update;
 if not found then raise exception 'Conta não encontrada.';end if;
 if exists(select 1 from soundbar_private.sb_account_deletions where user_id=target_user) then raise exception 'A conta está em exclusão.';end if;
 previous:=soundbar_private.sb_effective_limits(target_user);
 current_limits:=jsonb_build_object('file',max_file_bytes,'storage',max_storage_bytes);
 if previous=current_limits then return current_limits;end if;
 insert into soundbar_private.sb_account_limits(user_id,file_bytes,storage_bytes) values(target_user,max_file_bytes,max_storage_bytes)
 on conflict(user_id) do update set file_bytes=excluded.file_bytes,storage_bytes=excluded.storage_bytes,updated_at=now();
 insert into soundbar_private.sb_account_limit_audit(actor,target,previous_limits,new_limits) values(auth.uid(),target_user,previous,current_limits);
 return current_limits;
end $$;
revoke all on function soundbar_private.sb_admin_set_account_limits(uuid,bigint,bigint) from public,anon;
grant execute on function soundbar_private.sb_admin_set_account_limits(uuid,bigint,bigint) to authenticated;
create function public.sb_admin_set_account_limits(target_user uuid,max_file_bytes bigint,max_storage_bytes bigint)
returns jsonb language sql security invoker set search_path='' as $$select soundbar_private.sb_admin_set_account_limits(target_user,max_file_bytes,max_storage_bytes)$$;
revoke all on function public.sb_admin_set_account_limits(uuid,bigint,bigint) from public,anon;
grant execute on function public.sb_admin_set_account_limits(uuid,bigint,bigint) to authenticated;

create function soundbar_private.sb_admin_accounts_with_limits() returns jsonb language plpgsql security definer set search_path='' as $$
declare accounts jsonb;answer jsonb;
begin
 if not soundbar_private.sb_is_admin() then raise exception 'Acesso exclusivo do administrador.' using errcode='42501';end if;
 accounts:=soundbar_private.sb_admin_accounts();
 with items as(select value as entry,ordinality as n from jsonb_array_elements(accounts) with ordinality),
 used as(select split_part(name,'/',1) as owner,coalesce(sum(coalesce((metadata->>'size')::bigint,52428800)),0) as bytes
 from storage.objects where bucket_id='soundbar-audio' and split_part(name,'/',1) in(select entry->>'user_id' from items) group by 1)
 select coalesce(jsonb_agg(items.entry||jsonb_build_object('limits',soundbar_private.sb_effective_limits((items.entry->>'user_id')::uuid),'storage_bytes',coalesce(used.bytes,0)) order by items.n),'[]'::jsonb)
 into answer from items left join used on used.owner=items.entry->>'user_id';
 return answer;
end $$;
revoke all on function soundbar_private.sb_admin_accounts_with_limits() from public,anon;
grant execute on function soundbar_private.sb_admin_accounts_with_limits() to authenticated;
create or replace function public.sb_admin_accounts() returns jsonb language sql security invoker set search_path='' as $$select soundbar_private.sb_admin_accounts_with_limits()$$;

update storage.buckets set file_size_limit=52428800 where id='soundbar-audio';
alter table public.sb_tracks drop constraint sb_tracks_file_size_check,add constraint sb_tracks_file_size_check check(file_size between 0 and 52428800);
create or replace function soundbar_private.sb_storage_quota(candidate jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare used_bytes bigint;incoming_bytes bigint;limits jsonb;file_limit bigint;storage_limit bigint;
begin
 if auth.uid() is null or not soundbar_private.sb_is_approved() then return false;end if;
 perform 1 from public.sb_profiles where id=auth.uid() for update;if not found then return false;end if;
 limits:=soundbar_private.sb_effective_limits(auth.uid());file_limit:=(limits->>'file')::bigint;storage_limit:=(limits->>'storage')::bigint;
 -- Storage preauthorization may omit size: keep a conservative reservation.
 incoming_bytes:=coalesce((candidate->>'size')::bigint,file_limit);
 if incoming_bytes<1 or incoming_bytes>file_limit then return false;end if;
 select coalesce(sum(coalesce((metadata->>'size')::bigint,52428800)),0) into used_bytes from storage.objects
 where bucket_id='soundbar-audio' and (storage.foldername(name))[1]=auth.uid()::text;
 return used_bytes+incoming_bytes<=storage_limit;
end $$;
create function soundbar_private.sb_check_track_file_limit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or new.user_id is distinct from auth.uid() then raise exception 'Conta inválida.' using errcode='42501';end if;
 if new.audio_path is not null and new.file_size>(soundbar_private.sb_effective_limits(new.user_id)->>'file')::bigint then
  raise exception 'Este áudio ultrapassa o limite por arquivo da sua conta.' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function soundbar_private.sb_check_track_file_limit() from public,anon,authenticated;
create trigger sb_track_file_limit before insert or update of audio_path,file_size,user_id on public.sb_tracks
for each row execute function soundbar_private.sb_check_track_file_limit();

create or replace function soundbar_private.sb_import_shared_playlist(share_token uuid,revision text,target uuid,mapping jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare doc jsonb; s uuid; existing uuid; item jsonb; dest jsonb; p jsonb; dest_id uuid; path text; sz bigint; seq integer:=0;
begin
 if not soundbar_private.sb_is_approved() then raise exception 'Sua conta precisa estar liberada.';end if;
 perform 1 from public.sb_profiles where id=auth.uid() for update;
 doc:=soundbar_private.sb_get_shared_playlist(share_token);s:=(doc->>'share_id')::uuid;
 select playlist_id into existing from public.sb_playlist_imports where share_id=s and user_id=auth.uid();if found then return existing;end if;
 if doc->>'revision'<>revision then raise exception 'A playlist mudou. Abra o link novamente.';end if;
 if mapping is null or jsonb_typeof(mapping)<>'array' or jsonb_array_length(mapping)<>jsonb_array_length(doc->'tracks') or (select count(distinct x->>'source_id') from jsonb_array_elements(mapping) x)<>jsonb_array_length(mapping) or (select count(distinct x->>'dest_id') from jsonb_array_elements(mapping) x)<>jsonb_array_length(mapping) then raise exception 'Importação incompleta.';end if;
 select coalesce(sum(coalesce((metadata->>'size')::bigint,0)),0) into sz from storage.objects where bucket_id='soundbar-audio' and split_part(name,'/',1)=auth.uid()::text;
 if sz>(soundbar_private.sb_effective_limits(auth.uid())->>'storage')::bigint then raise exception 'Limite de armazenamento atingido.';end if;
 p:=doc->'playlist';
 insert into public.sb_playlists(id,user_id,name,description,color,play_mode,loop,retrigger,switch_mode,event_fade_enabled,event_fade_duration) values(target,auth.uid(),p->>'name',p->>'description',p->>'color',p->>'play_mode',(p->>'loop')::boolean,p->>'retrigger',p->>'switch_mode',coalesce((p->>'event_fade_enabled')::boolean,true),coalesce((p->>'event_fade_duration')::integer,2000));
 for item in select value from jsonb_array_elements(doc->'tracks') loop
 select value into dest from jsonb_array_elements(mapping) where value->>'source_id'=item->>'id';if not found then raise exception 'Importação incompleta.';end if;
 dest_id:=(dest->>'dest_id')::uuid;path:=null;
 if item->>'audio_path' is not null then
 path:=auth.uid()::text||'/'||dest_id::text||'.'||substring(item->>'audio_path' from '[^.]+$');
 if not exists(select 1 from storage.objects where bucket_id='soundbar-audio' and name=path and (metadata->>'size')::bigint=(item->>'file_size')::bigint) then raise exception 'Não foi possível confirmar um áudio copiado.';end if;
 end if;
 insert into public.sb_tracks(id,user_id,playlist_id,name,color,sample_id,audio_path,filename,mime,file_size,position) values(dest_id,auth.uid(),target,item->>'name',item->>'color',item->>'sample_id',path,item->>'filename',item->>'mime',(item->>'file_size')::bigint,seq);seq:=seq+1;
 end loop;
 insert into public.sb_playlist_imports values(s,auth.uid(),target);return target;
end $$;

notify pgrst, 'reload schema';
commit;
