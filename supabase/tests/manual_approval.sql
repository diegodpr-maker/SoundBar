begin;
select set_config('test.sb.admin',gen_random_uuid()::text,true);
select set_config('test.sb.a',gen_random_uuid()::text,true);
select set_config('test.sb.b',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
(current_setting('test.sb.admin')::uuid,current_setting('test.sb.admin')||'@example.invalid','{}',now()),
(current_setting('test.sb.a')::uuid,current_setting('test.sb.a')||'@example.invalid','{"is_admin":true,"role":"admin"}',now()),
(current_setting('test.sb.b')::uuid,current_setting('test.sb.b')||'@example.invalid','{}',now());
insert into public.sb_profiles(id,display_name) values(current_setting('test.sb.admin')::uuid,'Test admin'),(current_setting('test.sb.a')::uuid,'A'),(current_setting('test.sb.b')::uuid,'B');
insert into soundbar_private.sb_admins(user_id) values(current_setting('test.sb.admin')::uuid);
update public.sb_account_access set status='approved' where user_id=current_setting('test.sb.admin')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.sb.a'),true);
do $$begin
 if public.sb_account_state()->>'status'<>'pending' then raise exception 'New accounts must be pending';end if;
 if (public.sb_account_state()->>'is_admin')::boolean then raise exception 'Metadata forged admin access';end if;
 if (select count(*) from public.sb_profiles)<>0 then raise exception 'Pending account read profile';end if;
 begin insert into public.sb_playlists(name) values('Must fail');raise exception 'Pending insert succeeded';exception when insufficient_privilege then null;end;
 begin perform public.sb_review_account(auth.uid(),'approved');raise exception 'Self approval succeeded';exception when insufficient_privilege then null;end;
 begin update public.sb_account_access set status='approved' where user_id=auth.uid();raise exception 'Direct status change succeeded';exception when insufficient_privilege then null;end;
 begin perform public.sb_claim_admin(null);raise exception 'NULL bootstrap accepted';exception when insufficient_privilege then null;end;
 if (select count(*) from public.sb_account_access)<>1 then raise exception 'Pending user can inspect others';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.sb.admin'),true);
select public.sb_review_account(current_setting('test.sb.a')::uuid,'approved');
select set_config('request.jwt.claim.sub',current_setting('test.sb.a'),true);
insert into public.sb_playlists(name) values('Approved account can create');
do $$begin
 if (select count(*) from public.sb_playlists)<>1 then raise exception 'Approved account cannot access playlist';end if;
 if public.sb_account_state()->>'status'<>'approved' then raise exception 'Approval not effective';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.sb.admin'),true);
select public.sb_review_account(current_setting('test.sb.a')::uuid,'blocked');
do $$begin
 begin perform public.sb_review_account(auth.uid(),'blocked');raise exception 'Admin self lockout allowed';exception when raise_exception then if sqlerrm='Admin self lockout allowed' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.sb.a'),true);
do $$begin
 if (select count(*) from public.sb_playlists)<>0 then raise exception 'Blocked account can read playlist';end if;
 if public.sb_account_state()->>'status'<>'blocked' then raise exception 'Block not effective';end if;
 begin insert into public.sb_playlists(name) values('Must fail');raise exception 'Blocked insert succeeded';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
 if (select count(*) from soundbar_private.sb_admin_audit where actor=current_setting('test.sb.admin')::uuid)<>2 then raise exception 'Audit missing';end if;
end $$;
rollback;
