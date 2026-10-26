begin;
-- Raise the per-account private audio quota to 1 GiB; keep the 25 MiB file cap.
create or replace function soundbar_private.sb_storage_quota(candidate jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare used_bytes bigint; incoming_bytes bigint;
begin
 if auth.uid() is null then return false;end if;
 perform 1 from public.sb_profiles where id=auth.uid() for update;
 if not found then return false;end if;
 incoming_bytes=coalesce((candidate->>'size')::bigint,26214400);
 if incoming_bytes<1 or incoming_bytes>26214400 then return false;end if;
 select coalesce(sum(coalesce((metadata->>'size')::bigint,26214400)),0) into used_bytes
 from storage.objects where bucket_id='soundbar-audio' and (storage.foldername(name))[1]=auth.uid()::text;
 return used_bytes+incoming_bytes<=1073741824;
end;$$;
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
 if sz>1073741824 then raise exception 'Limite de armazenamento atingido.';end if;
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
commit;
