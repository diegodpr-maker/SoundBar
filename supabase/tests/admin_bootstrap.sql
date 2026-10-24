begin;
do $$begin if exists(select 1 from soundbar_private.sb_admins) then raise exception 'Run bootstrap test only before the real admin is activated';end if;end $$;
select set_config('test.sb.owner',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at) values(current_setting('test.sb.owner')::uuid,current_setting('test.sb.owner')||'@example.invalid',now());
update soundbar_private.sb_admin_bootstrap set token_hash=encode(sha256(convert_to(repeat('b',36),'UTF8')),'hex'),email='wrong@example.invalid',expires_at=now()+interval '1 hour';
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.sb.owner'),true);
do $$begin
 begin perform public.sb_claim_admin(repeat('b',36));raise exception 'Wrong email accepted';exception when insufficient_privilege then null;end;
 begin perform public.sb_claim_admin(repeat('a',36));raise exception 'Wrong code accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
update soundbar_private.sb_admin_bootstrap set email=current_setting('test.sb.owner')||'@example.invalid';
set local role authenticated;
select public.sb_claim_admin(repeat('b',36));
do $$begin
 if not (public.sb_account_state()->>'is_admin')::boolean then raise exception 'Bootstrap did not grant admin';end if;
 if public.sb_account_state()->>'status'<>'approved' then raise exception 'Bootstrap did not approve owner';end if;
 begin perform public.sb_claim_admin(repeat('b',36));raise exception 'Code replay allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
