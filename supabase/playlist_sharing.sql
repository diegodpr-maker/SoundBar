begin;
create table public.sb_playlist_shares(id uuid primary key default gen_random_uuid(),playlist_id uuid not null unique,user_id uuid not null,token uuid not null unique default gen_random_uuid(),enabled boolean not null default true,created_at timestamptz not null default now(),foreign key(playlist_id,user_id) references public.sb_playlists(id,user_id) on delete cascade);
create table public.sb_playlist_share_grants(share_id uuid not null references public.sb_playlist_shares(id) on delete cascade,user_id uuid not null references public.sb_profiles(id) on delete cascade,primary key(share_id,user_id));
create table public.sb_playlist_imports(share_id uuid not null references public.sb_playlist_shares(id) on delete cascade,user_id uuid not null references public.sb_profiles(id) on delete cascade,playlist_id uuid not null references public.sb_playlists(id) on delete cascade,primary key(share_id,user_id));
alter table public.sb_playlist_shares enable row level security;
alter table public.sb_playlist_share_grants enable row level security;
alter table public.sb_playlist_imports enable row level security;
revoke all on public.sb_playlist_shares,public.sb_playlist_share_grants,public.sb_playlist_imports from public,anon,authenticated;
grant select on public.sb_playlist_shares,public.sb_playlist_imports to authenticated;
create policy sb_shares_owner on public.sb_playlist_shares for select to authenticated using(user_id=auth.uid());
create policy sb_imports_owner on public.sb_playlist_imports for select to authenticated using(user_id=auth.uid());
create function soundbar_private.sb_share_audio_access(path text) returns boolean language sql stable security definer set search_path='' as $$
 select soundbar_private.sb_is_approved() and exists(select 1 from public.sb_playlist_share_grants g join public.sb_playlist_shares s on s.id=g.share_id join public.sb_tracks t on t.playlist_id=s.playlist_id and t.user_id=s.user_id join public.sb_account_access a on a.user_id=s.user_id and a.status='approved' where g.user_id=auth.uid() and s.enabled and t.audio_path=path);
$$;
revoke all on function soundbar_private.sb_share_audio_access(text) from public,anon;
grant execute on function soundbar_private.sb_share_audio_access(text) to authenticated;
create policy sb_audio_shared_read on storage.objects for select to authenticated using(bucket_id='soundbar-audio' and soundbar_private.sb_share_audio_access(name));
create function soundbar_private.sb_set_playlist_share(target uuid,enable boolean,consent boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.sb_playlist_shares;
begin
 if not soundbar_private.sb_is_approved() or not exists(select 1 from public.sb_playlists where id=target and user_id=auth.uid()) then raise exception 'Playlist indisponível.';end if;
 perform 1 from public.sb_playlists where id=target and user_id=auth.uid() for update;
 if enable and consent is distinct from true then raise exception 'Confirme o compartilhamento dos áudios.';end if;
 if enable then
 insert into public.sb_playlist_shares(playlist_id,user_id) values(target,auth.uid()) on conflict(playlist_id) do update set enabled=true,token=case when sb_playlist_shares.enabled then sb_playlist_shares.token else gen_random_uuid() end returning * into s;
 else
 update public.sb_playlist_shares set enabled=false where playlist_id=target and user_id=auth.uid() returning * into s;
 delete from public.sb_playlist_share_grants where share_id=s.id;
 end if;
 return to_jsonb(s);
end $$;
create function soundbar_private.sb_get_shared_playlist(share_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.sb_playlist_shares; doc jsonb;
begin
 if not soundbar_private.sb_is_approved() then raise exception 'Sua conta precisa estar liberada.';end if;
 select sh.* into s from public.sb_playlist_shares sh join public.sb_account_access a on a.user_id=sh.user_id and a.status='approved' where sh.token=share_token and sh.enabled for share of sh;
 if not found then raise exception 'Este compartilhamento não está disponível.';end if;
 insert into public.sb_playlist_share_grants values(s.id,auth.uid()) on conflict do nothing;
 select jsonb_build_object('share_id',s.id,'owner',pr.display_name,'playlist',jsonb_build_object('name',p.name,'description',p.description,'color',p.color,'play_mode',p.play_mode,'loop',p.loop,'retrigger',p.retrigger,'switch_mode',p.switch_mode),'tracks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'color',t.color,'sample_id',t.sample_id,'audio_path',t.audio_path,'filename',t.filename,'mime',t.mime,'file_size',t.file_size,'position',t.position) order by t.position,t.created_at,t.id) from public.sb_tracks t where t.playlist_id=p.id and t.user_id=s.user_id),'[]'::jsonb)) into doc from public.sb_playlists p join public.sb_profiles pr on pr.id=p.user_id where p.id=s.playlist_id;
 return doc||jsonb_build_object('revision',md5(doc::text));
end $$;
create function soundbar_private.sb_import_shared_playlist(share_token uuid,revision text,target uuid,mapping jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare doc jsonb; s uuid; existing uuid; item jsonb; dest jsonb; p jsonb; dest_id uuid; path text; sz bigint; seq integer:=0;
begin
 if not soundbar_private.sb_is_approved() then raise exception 'Sua conta precisa estar liberada.';end if;
 perform 1 from public.sb_profiles where id=auth.uid() for update;
 doc:=soundbar_private.sb_get_shared_playlist(share_token);s:=(doc->>'share_id')::uuid;
 select playlist_id into existing from public.sb_playlist_imports where share_id=s and user_id=auth.uid();if found then return existing;end if;
 if doc->>'revision'<>revision then raise exception 'A playlist mudou. Abra o link novamente.';end if;
 if mapping is null or jsonb_typeof(mapping)<>'array' or jsonb_array_length(mapping)<>jsonb_array_length(doc->'tracks') or (select count(distinct x->>'source_id') from jsonb_array_elements(mapping) x)<>jsonb_array_length(mapping) or (select count(distinct x->>'dest_id') from jsonb_array_elements(mapping) x)<>jsonb_array_length(mapping) then raise exception 'Importação incompleta.';end if;
 select coalesce(sum(coalesce((metadata->>'size')::bigint,0)),0) into sz from storage.objects where bucket_id='soundbar-audio' and split_part(name,'/',1)=auth.uid()::text;
 if sz>209715200 then raise exception 'Limite de armazenamento atingido.';end if;
 p:=doc->'playlist';
 insert into public.sb_playlists(id,user_id,name,description,color,play_mode,loop,retrigger,switch_mode) values(target,auth.uid(),p->>'name',p->>'description',p->>'color',p->>'play_mode',(p->>'loop')::boolean,p->>'retrigger',p->>'switch_mode');
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
revoke all on function soundbar_private.sb_set_playlist_share(uuid,boolean,boolean),soundbar_private.sb_get_shared_playlist(uuid),soundbar_private.sb_import_shared_playlist(uuid,text,uuid,jsonb) from public,anon;
grant execute on function soundbar_private.sb_set_playlist_share(uuid,boolean,boolean),soundbar_private.sb_get_shared_playlist(uuid),soundbar_private.sb_import_shared_playlist(uuid,text,uuid,jsonb) to authenticated;
create function public.sb_set_playlist_share(target uuid,enable boolean,consent boolean default false) returns jsonb language sql security invoker set search_path='' as $$select soundbar_private.sb_set_playlist_share(target,enable,consent)$$;
create function public.sb_get_shared_playlist(share_token uuid) returns jsonb language sql security invoker set search_path='' as $$select soundbar_private.sb_get_shared_playlist(share_token)$$;
create function public.sb_import_shared_playlist(share_token uuid,revision text,target uuid,mapping jsonb) returns uuid language sql security invoker set search_path='' as $$select soundbar_private.sb_import_shared_playlist(share_token,revision,target,mapping)$$;
revoke all on function public.sb_set_playlist_share(uuid,boolean,boolean),public.sb_get_shared_playlist(uuid),public.sb_import_shared_playlist(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.sb_set_playlist_share(uuid,boolean,boolean),public.sb_get_shared_playlist(uuid),public.sb_import_shared_playlist(uuid,text,uuid,jsonb) to authenticated;
commit;

create function soundbar_private.sb_browse_playlists() returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not soundbar_private.sb_is_approved() then raise exception 'Sua conta precisa estar liberada.';end if;
 return coalesce((select jsonb_agg(row order by row->>'name') from (select jsonb_build_object('token',s.token,'name',p.name,'description',p.description,'color',p.color,'owner',pr.display_name,'own',s.user_id=auth.uid(),'tracks_count',(select count(*) from public.sb_tracks t where t.playlist_id=p.id)) as row from public.sb_playlist_shares s join public.sb_playlists p on p.id=s.playlist_id join public.sb_profiles pr on pr.id=s.user_id join public.sb_account_access a on a.user_id=s.user_id and a.status='approved' where s.enabled) q),'[]'::jsonb);
end $$;
revoke all on function soundbar_private.sb_browse_playlists() from public,anon;
grant execute on function soundbar_private.sb_browse_playlists() to authenticated;
create function public.sb_browse_playlists() returns jsonb language sql security invoker set search_path='' as $$select soundbar_private.sb_browse_playlists()$$;
revoke all on function public.sb_browse_playlists() from public,anon;
grant execute on function public.sb_browse_playlists() to authenticated;

create index sb_share_grants_user_idx on public.sb_playlist_share_grants(user_id);
create index sb_share_imports_playlist_idx on public.sb_playlist_imports(playlist_id);
create index sb_share_imports_user_idx on public.sb_playlist_imports(user_id);
create index sb_shares_user_idx on public.sb_playlist_shares(user_id);
