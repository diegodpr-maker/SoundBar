begin;
alter table public.sb_playlists add column auto_next boolean not null default false;
CREATE OR REPLACE FUNCTION soundbar_private.sb_get_shared_playlist(share_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.sb_playlist_shares; doc jsonb;
begin
 if not soundbar_private.sb_is_approved() then raise exception 'Sua conta precisa estar liberada.';end if;
 select sh.* into s from public.sb_playlist_shares sh join public.sb_account_access a on a.user_id=sh.user_id and a.status='approved' where sh.token=share_token and sh.enabled for share of sh;
 if not found then raise exception 'Este compartilhamento não está disponível.';end if;
 insert into public.sb_playlist_share_grants values(s.id,auth.uid()) on conflict do nothing;
 select jsonb_build_object('share_id',s.id,'owner',pr.display_name,'playlist',jsonb_build_object('name',p.name,'description',p.description,'color',p.color,'play_mode',p.play_mode,'loop',p.loop,'auto_next',p.auto_next,'retrigger',p.retrigger,'switch_mode',p.switch_mode,'event_fade_enabled',p.event_fade_enabled,'event_fade_duration',p.event_fade_duration),'tracks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'color',t.color,'sample_id',t.sample_id,'audio_path',t.audio_path,'filename',t.filename,'mime',t.mime,'file_size',t.file_size,'position',t.position) order by t.position,t.created_at,t.id) from public.sb_tracks t where t.playlist_id=p.id and t.user_id=s.user_id),'[]'::jsonb)) into doc from public.sb_playlists p join public.sb_profiles pr on pr.id=p.user_id where p.id=s.playlist_id;
 return doc||jsonb_build_object('revision',md5(doc::text));
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
 insert into public.sb_playlists(id,user_id,name,description,color,play_mode,loop,retrigger,switch_mode,event_fade_enabled,event_fade_duration,auto_next)
 values(target,auth.uid(),p->>'name',p->>'description',p->>'color',p->>'play_mode',(p->>'loop')::boolean,p->>'retrigger',p->>'switch_mode',coalesce((p->>'event_fade_enabled')::boolean,true),coalesce((p->>'event_fade_duration')::integer,2000),coalesce((p->>'auto_next')::boolean,false));
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
notify pgrst,'reload schema';
commit;

