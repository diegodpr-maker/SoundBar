begin;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();item text:=gen_random_uuid()::text;path text;modified integer;
begin
 path:='custom/'||item||'.mp3';
 insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values(a,a||'@example.invalid','{}',now()),(b,b||'@example.invalid','{}',now());
 insert into public.sb_profiles(id,display_name) values(a,'Library admin'),(b,'Regular user');
 update public.sb_account_access set status='approved' where user_id in(a,b);
 insert into soundbar_private.sb_admins(user_id) values(a);
 perform set_config('request.jwt.claim.sub',a::text,true);
 execute 'set local role authenticated';
 insert into public.sb_library_tracks(id,name,category,object_path,audio_url,filename) values(item,'Original','Original',path,'https://fcmsojjtkiehsobbkjnr.supabase.co/storage/v1/object/public/soundbar-library/'||path,'test.mp3');
 update public.sb_library_tracks set name='Edited',category='New category',credit='Credit',author='Author',license='Permission',source_url='https://example.test/source' where id=item;
 if not exists(select 1 from public.sb_library_tracks where id=item and name='Edited' and category='New category' and object_path=path) then raise exception 'Admin edit did not persist';end if;
 perform set_config('request.jwt.claim.sub',b::text,true);
 update public.sb_library_tracks set name='Unauthorized' where id=item;
 get diagnostics modified=row_count;
 if modified<>0 then raise exception 'Regular user edited catalog';end if;
 execute 'reset role';
end $$;
rollback;
