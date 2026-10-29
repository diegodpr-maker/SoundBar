begin;
do $$
declare member uuid:=gen_random_uuid();playlist uuid:=gen_random_uuid();track uuid:=gen_random_uuid();submission uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email,raw_user_meta_data) values(member,member||'@example.invalid','{}');
 insert into public.sb_profiles(id,display_name) values(member,'Audio file limit test');
 update public.sb_account_access set status='approved' where user_id=member;
 insert into soundbar_private.sb_account_plans(user_id,plan) values(member,'pro');
 perform set_config('request.jwt.claim.sub',member::text,true);execute 'set local role authenticated';
 if not soundbar_private.sb_storage_quota('{"size":31457280}') or not soundbar_private.sb_submission_storage_quota('{"size":31457280}') then raise exception '30 MiB audio rejected by quota';end if;
 if soundbar_private.sb_storage_quota('{"size":31457281}') or soundbar_private.sb_submission_storage_quota('{"size":31457281}') then raise exception 'Oversized audio accepted';end if;
 insert into public.sb_playlists(id,user_id,name) values(playlist,member,'File boundary');
 insert into storage.objects(bucket_id,name,metadata) values('soundbar-audio',member||'/'||track||'.mp3','{"size":31457280,"mimetype":"audio/mpeg"}');
 insert into public.sb_tracks(id,user_id,playlist_id,name,audio_path,mime,file_size) values(track,member,playlist,'30 MiB',member||'/'||track||'.mp3','audio/mpeg',31457280);
 begin update public.sb_tracks set file_size=31457281 where id=track;raise exception 'Track size constraint missing';exception when insufficient_privilege then null;end;
 insert into public.sb_library_submissions(id,user_id,source_track_id,name,category,author,credit,license,consent,object_path,filename,mime,file_size)
 values(submission,member,track,'30 MiB contribution','Instrumental','Owner','','Permission',true,member||'/'||submission||'.mp3','track.mp3','audio/mpeg',31457280);
 perform set_config('request.jwt.claim.sub','',true);
 if soundbar_private.sb_storage_quota(null) or soundbar_private.sb_submission_storage_quota(null) then raise exception 'Anonymous quota access allowed';end if;
 execute 'reset role';
 if exists(select 1 from storage.buckets where ((id='soundbar-audio' and file_size_limit<>52428800) or (id='soundbar-submissions' and file_size_limit<>31457280) or (id in('soundbar-audio','soundbar-submissions') and public))) then raise exception 'Private bucket limit incorrect';end if;
 if not exists(select 1 from storage.buckets where id='soundbar-library' and file_size_limit=52428800) then raise exception 'Administrative library limit changed';end if;
end$$;
rollback;
