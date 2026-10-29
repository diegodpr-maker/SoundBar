-- Transactional fixtures only: no real files, emails or accounts survive.
begin;
do $$
declare a uuid:=gen_random_uuid();p uuid:=gen_random_uuid();f uuid:=gen_random_uuid();stranger uuid:=gen_random_uuid();pending_user uuid:=gen_random_uuid();
 list_one uuid:=gen_random_uuid();list_two uuid:=gen_random_uuid();source_track uuid:=gen_random_uuid();target uuid:=gen_random_uuid();target_two uuid:=gen_random_uuid();
 path text;doc jsonb;mapping jsonb;token uuid;value jsonb;lease uuid:=gen_random_uuid();files jsonb;sample text;count_before bigint;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(a,a||'@example.invalid','{}'),(p,p||'@example.invalid','{}'),(f,f||'@example.invalid','{"is_admin":true,"plan":"pro"}'),(stranger,stranger||'@example.invalid','{}'),(pending_user,pending_user||'@example.invalid','{}');
 insert into public.sb_profiles(id,display_name) values(a,'Plan admin'),(p,'Pro source'),(f,'Free importer'),(stranger,'Stranger'),(pending_user,'Pending');
 update public.sb_account_access set status='approved' where user_id in(a,p,f,stranger);
 insert into soundbar_private.sb_admins(user_id) values(a);
 perform set_config('request.jwt.claim.sub',f::text,true);execute 'set local role authenticated';
 value:=public.sb_account_state();if value->>'plan'<>'free' or (value->>'can_upload')::boolean then raise exception 'Free defaults or forged metadata bypass';end if;
 begin perform public.sb_admin_set_account_plan(f,'pro');raise exception 'Member promoted self';exception when insufficient_privilege then null;end;
 begin update soundbar_private.sb_account_plans set plan='pro' where user_id=f;raise exception 'Direct plan access';exception when insufficient_privilege then null;end;
 begin insert into storage.objects(bucket_id,name,metadata) values('soundbar-audio',f||'/'||gen_random_uuid()||'.mp3','{"size":100,"mimetype":"audio/mpeg"}');raise exception 'Free private upload';exception when insufficient_privilege then null;end;
 begin insert into storage.objects(bucket_id,name,metadata) values('soundbar-submissions',f||'/'||gen_random_uuid()||'.mp3','{"size":100,"mimetype":"audio/mpeg"}');raise exception 'Free contribution upload';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform public.sb_admin_set_account_plan(p,'pro');
 begin perform public.sb_admin_set_account_plan(p,'premium');raise exception 'Invalid plan accepted';exception when invalid_parameter_value then null;end;
 if not (public.sb_account_state()->>'can_upload')::boolean then raise exception 'Admin lost upload';end if;
 value:=public.sb_admin_accounts();if not exists(select 1 from jsonb_array_elements(value)x where (x->>'user_id')::uuid=p and x->>'plan'='pro') then raise exception 'Plan missing from admin';end if;
 perform set_config('request.jwt.claim.sub',p::text,true);
 value:=public.sb_account_state();if value->>'plan'<>'pro' or not (value->>'can_upload')::boolean or (value->'limits'->>'storage')::bigint<>1073741824 then raise exception 'Pro entitlement or default quota';end if;
 if not soundbar_private.sb_storage_quota('{"size":100}') or soundbar_private.sb_storage_quota('{"size":31457281}') then raise exception 'Pro quota bypass';end if;
 path:=p||'/'||source_track||'.mp3';
 insert into storage.objects(bucket_id,name,owner_id,owner,metadata) values('soundbar-audio',path,p::text,p,'{"size":100,"mimetype":"audio/mpeg"}');
 insert into public.sb_playlists(id,name) values(list_one,'Shared source'),(list_two,'Another source playlist');
 insert into public.sb_tracks(id,playlist_id,name,audio_path,file_size,filename,mime) values(source_track,list_one,'Source',path,100,'source.mp3','audio/mpeg');
 insert into public.sb_tracks(playlist_id,name,audio_path,file_size,filename,mime) values(list_two,'Same physical source',path,100,'source.mp3','audio/mpeg');
 if soundbar_private.sb_audio_can_delete(path) then raise exception 'Referenced owner file deletable';end if;
 begin update public.sb_tracks set audio_path=p||'/'||gen_random_uuid()||'.mp3' where id=source_track;raise exception 'Source mutation allowed';exception when insufficient_privilege then null;end;
 token:=(public.sb_set_playlist_share(list_one,true,true)->>'token')::uuid;
 perform set_config('request.jwt.claim.sub',f::text,true);
 doc:=public.sb_get_shared_playlist(token);select jsonb_agg(jsonb_build_object('source_id',x->>'id','dest_id',gen_random_uuid())) into mapping from jsonb_array_elements(doc->'tracks')x;
 if public.sb_import_shared_playlist(token,doc->>'revision',target,mapping)<>target then raise exception 'Wrong import target';end if;
 if public.sb_import_shared_playlist(token,'retry',target_two,'[]')<>target then raise exception 'Import retry duplicated';end if;
 if not exists(select 1 from public.sb_tracks where playlist_id=target and audio_path=path and file_size=100) then raise exception 'Import copied instead of referenced';end if;
 if not exists(select 1 from storage.objects where bucket_id='soundbar-audio' and name=path) then raise exception 'Authorized source unreadable';end if;
 if exists(select 1 from storage.objects where bucket_id='soundbar-audio' and split_part(name,'/',1)=f::text) then raise exception 'Import created physical copy';end if;
 if soundbar_private.sb_audio_can_delete(path) then raise exception 'Importer can delete owner file';end if;
 perform set_config('request.jwt.claim.sub',stranger::text,true);
 if exists(select 1 from storage.objects where bucket_id='soundbar-audio' and name=path) then raise exception 'Unrelated member reads private asset';end if;
 insert into public.sb_playlists(id,name) values(target_two,'Stranger private');
 begin insert into public.sb_tracks(playlist_id,name,audio_path,file_size) values(target_two,'Unauthorized',path,100);raise exception 'Arbitrary path attached';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',p::text,true);perform public.sb_set_playlist_share(list_one,false,false);
 delete from public.sb_tracks where audio_path=path;
 if soundbar_private.sb_audio_can_delete(path) then raise exception 'Owner deletion ignores importer reference';end if;
 perform set_config('request.jwt.claim.sub',f::text,true);
 if not soundbar_private.sb_audio_reference_read(path) or not exists(select 1 from storage.objects where name=path and bucket_id='soundbar-audio') then raise exception 'Revoking share broke imported playlist';end if;
 -- Downgrading preserves all existing tracks and playback.
 perform set_config('request.jwt.claim.sub',a::text,true);perform public.sb_admin_set_account_plan(p,'free');
 perform set_config('request.jwt.claim.sub',p::text,true);
 if (public.sb_account_state()->>'can_upload')::boolean or soundbar_private.sb_storage_quota('{"size":1}') then raise exception 'Downgrade upload bypass';end if;
 perform set_config('request.jwt.claim.sub',a::text,true);perform public.sb_admin_set_account_plan(pending_user,'pro');
 perform set_config('request.jwt.claim.sub',pending_user::text,true);if (public.sb_account_state()->>'can_upload')::boolean then raise exception 'Pending Pro got access';end if;
 execute 'reset role';
 -- The existing service-only deletion worker retains shared bytes, clears Auth
 -- ownership only for retained objects, and can finish deleting the source account.
 insert into soundbar_private.sb_account_deletions(user_id,requested_by,status,lease,lease_until) values(p,a,'working',lease,now()+interval '5 minutes');
 files:=soundbar_private.sb_account_deletion_service('files',p,lease,'{}');
 if jsonb_array_length(files)<>0 then raise exception 'Deletion worker queued shared physical file';end if;
 if exists(select 1 from storage.objects where bucket_id='soundbar-audio' and name=path and (owner_id is not null or owner is not null)) then raise exception 'Retained object still owns deleted Auth account';end if;
 delete from auth.users where id=p;
 perform soundbar_private.sb_account_deletion_service('finish',p,lease,'{"status":"completed","phase":"auth","http_status":200}');
 perform set_config('request.jwt.claim.sub',f::text,true);execute 'set local role authenticated';
 if not exists(select 1 from public.sb_tracks where playlist_id=target and audio_path=path) or not exists(select 1 from storage.objects where name=path and bucket_id='soundbar-audio') then raise exception 'Account removal broke imported track';end if;
 delete from public.sb_tracks where playlist_id=target and audio_path=path;
 if not soundbar_private.sb_audio_can_delete(path) then raise exception 'Last importer cannot clean orphan after source account removal';end if;
 begin select count(*) into count_before from soundbar_private.sb_audio_reference_grants;raise exception 'Reference grants exposed';exception when insufficient_privilege then null;end;
 -- Free library tracks remain usable with zero uploaded bytes.
 select id into sample from public.sb_library_tracks where active limit 1;
 insert into public.sb_tracks(playlist_id,name,sample_id) values(target,'Library',sample);
 perform set_config('request.jwt.claim.sub','',true);execute 'reset role';execute 'set local role anon';
 begin perform public.sb_admin_set_account_plan(f,'pro');raise exception 'Anonymous plan change';exception when insufficient_privilege then null;end;
 execute 'reset role';
end $$;
rollback;
