begin;
create table soundbar_private.sb_account_deletions(
 user_id uuid primary key,requested_by uuid not null references auth.users(id),
 email text,display_name text,status text not null check(status in('working','queued','failed','completed')),
 lease uuid,lease_until timestamptz,phase text not null default 'files',last_status integer,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index sb_account_deletions_actor_idx on soundbar_private.sb_account_deletions(requested_by);
alter table soundbar_private.sb_account_deletions enable row level security;
revoke all on soundbar_private.sb_account_deletions from public,anon,authenticated;
create policy sb_account_deletions_deny on soundbar_private.sb_account_deletions for all to anon,authenticated using(false) with check(false);
-- Historical moderation keeps the target UUID after the account has been erased.
alter table soundbar_private.sb_admin_audit drop constraint sb_admin_audit_target_fkey;

create function soundbar_private.sb_account_protected(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select target=auth.uid() or exists(select 1 from soundbar_private.sb_admins where user_id=target)
 or exists(select 1 from soundbar_private.sb_admin_audit where actor=target)
 or exists(select 1 from public.sb_account_access where reviewed_by=target)
 or exists(select 1 from public.sb_library_submissions where reviewed_by=target)
 or exists(select 1 from soundbar_private.sb_account_deletions where requested_by=target);
$$;
revoke all on function soundbar_private.sb_account_protected(uuid) from public,anon,authenticated;

create function soundbar_private.sb_admin_accounts() returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not soundbar_private.sb_is_admin() then raise exception 'Acesso exclusivo do administrador.' using errcode='42501';end if;
 return coalesce((select jsonb_agg(to_jsonb(r) order by r.requested_at desc) from (
  select a.user_id,a.email,a.display_name,a.status,a.requested_at,a.reviewed_at,a.reviewed_by,
   exists(select 1 from soundbar_private.sb_admins where user_id=a.user_id) as is_admin,
   not soundbar_private.sb_account_protected(a.user_id) as can_delete,d.status as deletion_status
  from public.sb_account_access a left join soundbar_private.sb_account_deletions d on d.user_id=a.user_id
  union all
  select d.user_id,coalesce(d.email,''),coalesce(d.display_name,''),'blocked',d.created_at,null::timestamptz,null::uuid,false,true,d.status
  from soundbar_private.sb_account_deletions d where d.status<>'completed' and not exists(select 1 from public.sb_account_access a where a.user_id=d.user_id)
  order by requested_at desc limit 200
 ) r),'[]'::jsonb);
end$$;
revoke all on function soundbar_private.sb_admin_accounts() from public,anon;
grant execute on function soundbar_private.sb_admin_accounts() to authenticated;
create function public.sb_admin_accounts() returns jsonb language sql security invoker set search_path='' as $$select soundbar_private.sb_admin_accounts()$$;
revoke all on function public.sb_admin_accounts() from public,anon;
grant execute on function public.sb_admin_accounts() to authenticated;

create function soundbar_private.sb_prepare_account_deletion(target uuid,confirmation_email text) returns jsonb language plpgsql security definer set search_path='' as $$
declare account public.sb_account_access;job soundbar_private.sb_account_deletions;token uuid:=gen_random_uuid();
begin
 if not soundbar_private.sb_is_admin() then raise exception 'Acesso exclusivo do administrador.' using errcode='42501';end if;
 if target is null or soundbar_private.sb_account_protected(target) then raise exception 'Contas administradoras não podem ser excluídas por este painel.' using errcode='42501';end if;
 perform 1 from public.sb_profiles where id=target for update;
 select * into account from public.sb_account_access where user_id=target for update;
 select * into job from soundbar_private.sb_account_deletions where user_id=target for update;
 if job.status='completed' then return jsonb_build_object('status','completed','user_id',target);end if;
 if account.user_id is null and job.user_id is null then raise exception 'Conta não encontrada.' using errcode='P0002';end if;
 if confirmation_email is null or lower(trim(confirmation_email)) is distinct from lower(coalesce(job.email,account.email)) then raise exception 'Digite o e-mail da conta para confirmar.' using errcode='22023';end if;
 if job.status='working' and job.lease_until>now() then raise exception 'A exclusão está em andamento. Aguarde e atualize o painel.' using errcode='55P03';end if;
 update public.sb_account_access set status='blocked',reviewed_at=now(),reviewed_by=auth.uid() where user_id=target;
 insert into soundbar_private.sb_account_deletions(user_id,requested_by,email,display_name,status,lease,lease_until)
 values(target,auth.uid(),account.email,account.display_name,'working',token,now()+interval '3 minutes')
 on conflict(user_id) do update set status='working',lease=token,lease_until=now()+interval '3 minutes',updated_at=now();
 return jsonb_build_object('user_id',target,'lease',token,'status','working');
end$$;
revoke all on function soundbar_private.sb_prepare_account_deletion(uuid,text) from public,anon;
grant execute on function soundbar_private.sb_prepare_account_deletion(uuid,text) to authenticated;
create function public.sb_prepare_account_deletion(target uuid,confirmation_email text) returns jsonb language sql security invoker set search_path='' as $$select soundbar_private.sb_prepare_account_deletion(target,confirmation_email)$$;
revoke all on function public.sb_prepare_account_deletion(uuid,text) from public,anon;
grant execute on function public.sb_prepare_account_deletion(uuid,text) to authenticated;

create function soundbar_private.sb_account_deletion_service(action text,target uuid,token uuid,details jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare job soundbar_private.sb_account_deletions;next_status text:=details->>'status';
begin
 select * into job from soundbar_private.sb_account_deletions where user_id=target and lease=token and status='working' and lease_until>now() for update;
 if not found then raise exception 'Deletion lease unavailable' using errcode='55P03';end if;
 if action='files' then
 return coalesce((select jsonb_agg(to_jsonb(f)) from (select bucket_id as bucket,name as path from storage.objects where bucket_id in('soundbar-audio','soundbar-submissions') and split_part(name,'/',1)=target::text order by bucket_id,name limit 200) f),'[]'::jsonb);
 elsif action='finish' then
 if next_status not in('queued','failed','completed') or next_status is null then raise exception 'Invalid deletion state';end if;
 if next_status='completed' and (exists(select 1 from auth.users where id=target) or exists(select 1 from storage.objects where bucket_id in('soundbar-audio','soundbar-submissions') and split_part(name,'/',1)=target::text)) then raise exception 'Account deletion incomplete';end if;
 update soundbar_private.sb_account_deletions set status=next_status,lease=null,lease_until=null,updated_at=now(),phase=case when next_status='completed' then 'done' else case when details->>'phase'='auth' then 'auth' else 'files' end end,last_status=case when (details->>'http_status')::integer between 0 and 599 then (details->>'http_status')::integer else 0 end,email=case when next_status='completed' then null else email end,display_name=case when next_status='completed' then null else display_name end where user_id=target;
 return '{"ok":true}'::jsonb;
 end if;
 raise exception 'Invalid deletion action';
end$$;
revoke all on function soundbar_private.sb_account_deletion_service(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function soundbar_private.sb_account_deletion_service(text,uuid,uuid,jsonb) to service_role;
create function public.sb_account_deletion_service(action text,target uuid,token uuid,details jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select soundbar_private.sb_account_deletion_service(action,target,token,details)$$;
revoke all on function public.sb_account_deletion_service(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.sb_account_deletion_service(text,uuid,uuid,jsonb) to service_role;

create or replace function soundbar_private.sb_review_account(target_user uuid,new_status text) returns void language plpgsql security definer set search_path='' as $$
declare previous_status text;
begin
 if not soundbar_private.sb_is_admin() then raise exception 'Acesso exclusivo do administrador.' using errcode='42501';end if;
 if new_status not in('approved','blocked','pending') or new_status is null then raise exception 'Situação inválida.';end if;
 if exists(select 1 from soundbar_private.sb_admins where user_id=target_user) then raise exception 'A conta administradora não pode ser bloqueada ou alterada neste painel.';end if;
 select status into previous_status from public.sb_account_access where user_id=target_user for update;
 if not found then raise exception 'Conta não encontrada.';end if;
 if exists(select 1 from soundbar_private.sb_account_deletions where user_id=target_user and status<>'completed') then raise exception 'A exclusão desta conta está em andamento.';end if;
 update public.sb_account_access set status=new_status,reviewed_at=now(),reviewed_by=auth.uid() where user_id=target_user;
 insert into soundbar_private.sb_admin_audit(actor,target,previous_status,new_status) values(auth.uid(),target_user,previous_status,new_status);
end$$;
create function soundbar_private.sb_account_removed() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from soundbar_private.sb_account_deletions where user_id=(select auth.uid()));
$$;
revoke all on function soundbar_private.sb_account_removed() from public,anon;
grant execute on function soundbar_private.sb_account_removed() to authenticated;
create or replace function public.sb_account_state() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('user_id',auth.uid(),'status',coalesce((select status from public.sb_account_access where user_id=auth.uid()),case when soundbar_private.sb_account_removed() then 'deleted' else 'pending' end),'is_admin',soundbar_private.sb_is_admin());
$$;
commit;
