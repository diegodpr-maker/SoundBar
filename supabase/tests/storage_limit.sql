begin;
do $$
declare member uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email,raw_user_meta_data) values(member,member||'@example.invalid','{}');
 insert into public.sb_profiles(id,display_name) values(member,'Storage limit test');
 update public.sb_account_access set status='approved' where user_id=member;
 perform set_config('request.jwt.claim.sub',member::text,true);execute 'set local role authenticated';
 if not soundbar_private.sb_storage_quota(null) then raise exception 'Empty account cannot reserve an upload';end if;
 if not soundbar_private.sb_storage_quota('{"size":26214400}') then raise exception '25 MiB file rejected';end if;
 if soundbar_private.sb_storage_quota('{"size":26214401}') or soundbar_private.sb_storage_quota('{"size":0}') or soundbar_private.sb_storage_quota('{"size":-1}') then raise exception 'Per-file size cap lost';end if;
 perform set_config('request.jwt.claim.sub','',true);
 if soundbar_private.sb_storage_quota(null) then raise exception 'Anonymous quota access allowed';end if;
 execute 'reset role';
end$$;
rollback;
