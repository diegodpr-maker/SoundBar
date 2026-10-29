begin;
select set_config('test.rename.admin',gen_random_uuid()::text,true);
select set_config('test.rename.member',gen_random_uuid()::text,true);
select set_config('test.rename.item',gen_random_uuid()::text,true);
select set_config('test.rename.retired',gen_random_uuid()::text,true);
select set_config('test.rename.old','Rename Old '||substr(gen_random_uuid()::text,1,12),true);
select set_config('test.rename.new','Rename New '||substr(gen_random_uuid()::text,1,12),true);
select set_config('test.rename.next','Rename Next '||substr(gen_random_uuid()::text,1,12),true);
select set_config('test.rename.other','Rename Other '||substr(gen_random_uuid()::text,1,12),true);
select set_config('test.rename.playlist',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
(current_setting('test.rename.admin')::uuid,current_setting('test.rename.admin')||'@example.invalid','{}',now()),
(current_setting('test.rename.member')::uuid,current_setting('test.rename.member')||'@example.invalid','{"is_admin":true}',now());
insert into public.sb_profiles(id,display_name) values(current_setting('test.rename.admin')::uuid,'Fixture admin'),(current_setting('test.rename.member')::uuid,'Fixture member');
update public.sb_account_access set status='approved' where user_id in(current_setting('test.rename.admin')::uuid,current_setting('test.rename.member')::uuid);
insert into soundbar_private.sb_admins(user_id) values(current_setting('test.rename.admin')::uuid);
insert into public.sb_library_tracks(id,name,category,categories,object_path,audio_url,filename,active) values
(current_setting('test.rename.item'),'Fixture active',current_setting('test.rename.old'),array[current_setting('test.rename.old'),current_setting('test.rename.other')],null,'https://sysmacom.com.br/musicas-harmony/Fixture/'||current_setting('test.rename.item')||'.mp3','fixture.mp3',true),
(current_setting('test.rename.retired'),'Fixture retired',current_setting('test.rename.other'),array[current_setting('test.rename.other'),current_setting('test.rename.old')],null,'https://sysmacom.com.br/musicas-harmony/Fixture/'||current_setting('test.rename.retired')||'.mp3','retired.mp3',false);
insert into soundbar_private.sb_library_sources(source_url,library_id,category,file_size,head_sha256)
values('https://sysmacom.com.br/musicas-harmony/Fixture/'||current_setting('test.rename.item')||'.mp3',current_setting('test.rename.item'),current_setting('test.rename.old'),100,repeat('a',64));
set local role anon;
do $$begin
 begin perform public.sb_admin_rename_library_category(current_setting('test.rename.old'),current_setting('test.rename.new'));raise exception 'Anonymous renamed category';exception when insufficient_privilege then null;end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.rename.member'),true);
insert into public.sb_playlists(id,name) values(current_setting('test.rename.playlist')::uuid,'Fixture playlist');
insert into public.sb_tracks(playlist_id,name,sample_id) values(current_setting('test.rename.playlist')::uuid,'Fixture track',current_setting('test.rename.item'));
do $$begin
 begin perform public.sb_admin_rename_library_category(current_setting('test.rename.old'),current_setting('test.rename.new'));raise exception 'Member metadata authorized rename';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.rename.admin'),true);
do $$declare result jsonb;begin
 begin perform public.sb_admin_rename_library_category(current_setting('test.rename.old'),current_setting('test.rename.other'));raise exception 'Existing target merged';exception when unique_violation then null;end;
 begin perform public.sb_admin_rename_library_category(current_setting('test.rename.old'),repeat('x',61));raise exception 'Oversize target accepted';exception when invalid_parameter_value then null;end;
 begin perform public.sb_admin_rename_library_category(current_setting('test.rename.old'),E'bad\nname');raise exception 'Control characters accepted';exception when invalid_parameter_value then null;end;
 begin perform public.sb_admin_rename_library_category(current_setting('test.rename.old'),current_setting('test.rename.old'));raise exception 'No-op rename accepted';exception when invalid_parameter_value then null;end;
 begin perform public.sb_admin_rename_library_category('missing-'||gen_random_uuid()::text,current_setting('test.rename.new'));raise exception 'Missing source accepted';exception when no_data_found then null;end;
 result:=public.sb_admin_rename_library_category(current_setting('test.rename.old'),current_setting('test.rename.new'));
 if (result->>'affected')::integer<>2 or (result->>'active_affected')::integer<>1 then raise exception 'Wrong affected counts';end if;
 if not exists(select 1 from public.sb_library_tracks where id=current_setting('test.rename.item') and category=current_setting('test.rename.new') and categories=array[current_setting('test.rename.new'),current_setting('test.rename.other')] and audio_url='https://sysmacom.com.br/musicas-harmony/Fixture/'||current_setting('test.rename.item')||'.mp3') then raise exception 'Primary category rename changed unrelated metadata';end if;
 if not exists(select 1 from public.sb_library_tracks where id=current_setting('test.rename.retired') and not active and category=current_setting('test.rename.other') and categories=array[current_setting('test.rename.other'),current_setting('test.rename.new')]) then raise exception 'Secondary categories or retirement state changed';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.rename.member'),true);
do $$begin
 if not exists(select 1 from public.sb_tracks where playlist_id=current_setting('test.rename.playlist')::uuid and sample_id=current_setting('test.rename.item')) then raise exception 'Playlist reference changed';end if;
end $$;
reset role;
do $$begin
 if not exists(select 1 from soundbar_private.sb_library_category_names where source_name=current_setting('test.rename.old') and display_name=current_setting('test.rename.new')) then raise exception 'Folder alias not saved';end if;
 if not exists(select 1 from soundbar_private.sb_library_sources where library_id=current_setting('test.rename.item') and category=current_setting('test.rename.new')) then raise exception 'Import source category not updated';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.rename.admin'),true);
select public.sb_admin_rename_library_category(current_setting('test.rename.new'),current_setting('test.rename.next'));
select public.sb_admin_rename_library_category(current_setting('test.rename.next'),current_setting('test.rename.old'));
reset role;
do $$begin
 if exists(select 1 from soundbar_private.sb_library_category_names where source_name in(current_setting('test.rename.old'),current_setting('test.rename.new'),current_setting('test.rename.next')) and display_name<>current_setting('test.rename.old')) then raise exception 'Rename chain/undo lost folder aliases';end if;
end $$;
update public.sb_account_access set status='pending' where user_id=current_setting('test.rename.admin')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.rename.admin'),true);
do $$begin
 begin perform public.sb_admin_rename_library_category(current_setting('test.rename.old'),current_setting('test.rename.new'));raise exception 'Pending admin renamed category';exception when insufficient_privilege then null;end;
 begin perform count(*) from soundbar_private.sb_library_category_names;raise exception 'Client directly read aliases';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
