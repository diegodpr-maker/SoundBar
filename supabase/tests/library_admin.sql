begin;
select set_config('test.lib.admin',gen_random_uuid()::text,true);
select set_config('test.lib.user',gen_random_uuid()::text,true);
select set_config('test.lib.item',gen_random_uuid()::text,true);
select set_config('test.lib.playlist',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at) values(current_setting('test.lib.admin')::uuid,current_setting('test.lib.admin')||'@example.invalid',now()),(current_setting('test.lib.user')::uuid,current_setting('test.lib.user')||'@example.invalid',now());
insert into public.sb_profiles(id,display_name) values(current_setting('test.lib.admin')::uuid,'Library admin'),(current_setting('test.lib.user')::uuid,'Regular user');
update public.sb_account_access set status='approved' where user_id in (current_setting('test.lib.admin')::uuid,current_setting('test.lib.user')::uuid);
insert into soundbar_private.sb_admins(user_id) values(current_setting('test.lib.admin')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.lib.user'),true);
do $$ declare changed integer;begin
 begin insert into public.sb_library_tracks(id,name,object_path,audio_url,filename) values(current_setting('test.lib.item'),'Unauthorized','custom/'||current_setting('test.lib.item')||'.mp3','https://fcmsojjtkiehsobbkjnr.supabase.co/storage/v1/object/public/soundbar-library/custom/'||current_setting('test.lib.item')||'.mp3','test.mp3');raise exception 'Nonadmin inserted a catalog item';exception when insufficient_privilege then null;end;
 update public.sb_library_tracks set active=false;get diagnostics changed=row_count;if changed<>0 then raise exception 'Nonadmin retired a catalog item';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.lib.admin'),true);
insert into public.sb_library_tracks(id,name,object_path,audio_url,filename) values(current_setting('test.lib.item'),'Admin upload','custom/'||current_setting('test.lib.item')||'.mp3','https://fcmsojjtkiehsobbkjnr.supabase.co/storage/v1/object/public/soundbar-library/custom/'||current_setting('test.lib.item')||'.mp3','test.mp3');
select set_config('request.jwt.claim.sub',current_setting('test.lib.user'),true);
insert into public.sb_playlists(id,name) values(current_setting('test.lib.playlist')::uuid,'Test playlist');
insert into public.sb_tracks(playlist_id,name,sample_id) values(current_setting('test.lib.playlist')::uuid,'Keep this existing button',current_setting('test.lib.item'));
select set_config('request.jwt.claim.sub',current_setting('test.lib.admin'),true);
update public.sb_library_tracks set active=false where id=current_setting('test.lib.item');
select set_config('request.jwt.claim.sub',current_setting('test.lib.user'),true);
do $$begin
 if (select count(*) from public.sb_tracks where playlist_id=current_setting('test.lib.playlist')::uuid)<>1 then raise exception 'Retiring a catalog item removed an existing button';end if;
 begin insert into public.sb_tracks(playlist_id,name,sample_id) values(current_setting('test.lib.playlist')::uuid,'Must not add retired item',current_setting('test.lib.item'));raise exception 'Retired sample accepted';exception when raise_exception then if sqlerrm='Retired sample accepted' then raise;end if;end;
end $$;
reset role;
rollback;
