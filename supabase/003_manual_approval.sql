begin;
create table public.sb_account_access (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text not null, display_name text not null default '',
 status text not null default 'pending' check(status in ('pending','approved','blocked')),
 requested_at timestamptz not null default now(),
 reviewed_at timestamptz, reviewed_by uuid references auth.users(id)
);
create index sb_account_status_requested_idx on public.sb_account_access(status,requested_at desc);
alter table public.sb_account_access enable row level security;
revoke all on public.sb_account_access from public,anon,authenticated;
grant select on public.sb_account_access to authenticated;
create table soundbar_private.sb_admins(user_id uuid primary key references auth.users(id) on delete cascade,created_at timestamptz not null default now());
create table soundbar_private.sb_admin_bootstrap(id boolean primary key default true check(id),email text not null,token_hash text not null,expires_at timestamptz not null,used_at timestamptz,used_by uuid references auth.users(id));
create table soundbar_private.sb_admin_audit(id bigint generated always as identity primary key,actor uuid not null references auth.users(id),target uuid not null references auth.users(id),previous_status text not null,new_status text not null,created_at timestamptz not null default now());
create table soundbar_private.sb_registration_limits(key text primary key,window_start timestamptz not null,attempts integer not null);
alter table soundbar_private.sb_admins enable row level security;
alter table soundbar_private.sb_admin_bootstrap enable row level security;
alter table soundbar_private.sb_admin_audit enable row level security;
alter table soundbar_private.sb_registration_limits enable row level security;
revoke all on soundbar_private.sb_admins,soundbar_private.sb_admin_bootstrap,soundbar_private.sb_admin_audit,soundbar_private.sb_registration_limits from public,anon,authenticated;
grant usage on schema soundbar_private to service_role;
grant all on soundbar_private.sb_registration_limits to service_role;

create function soundbar_private.sb_is_approved() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.sb_account_access where user_id=auth.uid() and status='approved');
$$;
create function soundbar_private.sb_is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from soundbar_private.sb_admins a join public.sb_account_access s on s.user_id=a.user_id where a.user_id=auth.uid() and s.status='approved');
$$;
revoke all on function soundbar_private.sb_is_approved(),soundbar_private.sb_is_admin() from public,anon;
grant execute on function soundbar_private.sb_is_approved(),soundbar_private.sb_is_admin() to authenticated;
create policy sb_account_own_or_admin on public.sb_account_access for select to authenticated using(user_id=(select auth.uid()) or (select soundbar_private.sb_is_admin()));
create policy sb_profiles_approved on public.sb_profiles as restrictive for all to authenticated using((select soundbar_private.sb_is_approved())) with check((select soundbar_private.sb_is_approved()));
create policy sb_playlists_approved on public.sb_playlists as restrictive for all to authenticated using((select soundbar_private.sb_is_approved())) with check((select soundbar_private.sb_is_approved()));
create policy sb_tracks_approved on public.sb_tracks as restrictive for all to authenticated using((select soundbar_private.sb_is_approved())) with check((select soundbar_private.sb_is_approved()));
create policy sb_audio_approved on storage.objects as restrictive for all to authenticated using(bucket_id<>'soundbar-audio' or (select soundbar_private.sb_is_approved())) with check(bucket_id<>'soundbar-audio' or (select soundbar_private.sb_is_approved()));

create function soundbar_private.sb_new_account() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.sb_account_access(user_id,email,display_name) values(new.id,lower(coalesce(new.email,'')),left(coalesce(new.raw_user_meta_data->>'display_name',''),80));
 return new;
end;$$;
revoke all on function soundbar_private.sb_new_account() from public,anon,authenticated;
create trigger sb_account_registered after insert on auth.users for each row execute function soundbar_private.sb_new_account();
insert into public.sb_account_access(user_id,email,display_name) select id,lower(coalesce(email,'')),left(coalesce(raw_user_meta_data->>'display_name',''),80) from auth.users on conflict(user_id) do nothing;

create function public.sb_account_state() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('user_id',auth.uid(),'status',coalesce((select status from public.sb_account_access where user_id=auth.uid()),'pending'),'is_admin',soundbar_private.sb_is_admin());
$$;
revoke all on function public.sb_account_state() from public,anon;
grant execute on function public.sb_account_state() to authenticated;

create function soundbar_private.sb_review_account(target_user uuid,new_status text) returns void language plpgsql security definer set search_path='' as $$
declare previous_status text;
begin
 if not soundbar_private.sb_is_admin() then raise exception 'Acesso exclusivo do administrador.' using errcode='42501';end if;
 if new_status not in ('approved','blocked','pending') or new_status is null then raise exception 'Situação inválida.';end if;
 if exists(select 1 from soundbar_private.sb_admins where user_id=target_user) then raise exception 'A conta administradora não pode ser bloqueada ou alterada neste painel.';end if;
 select status into previous_status from public.sb_account_access where user_id=target_user for update;
 if not found then raise exception 'Conta não encontrada.';end if;
 update public.sb_account_access set status=new_status,reviewed_at=now(),reviewed_by=auth.uid() where user_id=target_user;
 insert into soundbar_private.sb_admin_audit(actor,target,previous_status,new_status) values(auth.uid(),target_user,previous_status,new_status);
end;$$;
revoke all on function soundbar_private.sb_review_account(uuid,text) from public,anon;
grant execute on function soundbar_private.sb_review_account(uuid,text) to authenticated;
create function public.sb_review_account(target_user uuid,new_status text) returns void language sql security invoker set search_path='' as $$select soundbar_private.sb_review_account(target_user,new_status);$$;
revoke all on function public.sb_review_account(uuid,text) from public,anon;
grant execute on function public.sb_review_account(uuid,text) to authenticated;

create function soundbar_private.sb_claim_admin(activation_code text) returns void language plpgsql security definer set search_path='' as $$
declare config soundbar_private.sb_admin_bootstrap;account_email text;
begin
 if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode='42501';end if;
 select * into config from soundbar_private.sb_admin_bootstrap where id=true for update;
 if activation_code is null or not found or config.used_at is not null or config.expires_at<now() or length(activation_code)<>36 or config.token_hash<>encode(sha256(convert_to(activation_code,'UTF8')),'hex') then raise exception 'Código inválido, expirado ou já utilizado.' using errcode='42501';end if;
 select lower(email) into account_email from auth.users where id=auth.uid();
 if account_email is distinct from config.email then raise exception 'Use o e-mail definido para o administrador.' using errcode='42501';end if;
 if exists(select 1 from soundbar_private.sb_admins) then raise exception 'O administrador já foi ativado.' using errcode='42501';end if;
 insert into soundbar_private.sb_admins(user_id) values(auth.uid());
 update public.sb_account_access set status='approved',reviewed_at=now(),reviewed_by=auth.uid() where user_id=auth.uid();
 update soundbar_private.sb_admin_bootstrap set used_at=now(),used_by=auth.uid() where id=true;
end;$$;
revoke all on function soundbar_private.sb_claim_admin(text) from public,anon;
grant execute on function soundbar_private.sb_claim_admin(text) to authenticated;
create function public.sb_claim_admin(activation_code text) returns void language sql security invoker set search_path='' as $$select soundbar_private.sb_claim_admin(activation_code);$$;
revoke all on function public.sb_claim_admin(text) from public,anon;
grant execute on function public.sb_claim_admin(text) to authenticated;

-- Registration quota: only the server's service_role may reserve attempts.
create function public.sb_allow_registration(email_hash text,ip_hash text) returns boolean language plpgsql security invoker set search_path='' as $$
declare subject text;attempt integer;quota integer;i integer;
begin
 if email_hash is null or ip_hash is null or email_hash !~ '^[a-f0-9]{64}$' or ip_hash !~ '^[a-f0-9]{64}$' then return false;end if;
 for i in 1..3 loop
  subject=case i when 1 then 'global' when 2 then 'email:'||email_hash else 'ip:'||ip_hash end;
  quota=case i when 1 then 60 when 2 then 5 else 15 end;
  insert into soundbar_private.sb_registration_limits(key,window_start,attempts) values(subject,date_trunc('hour',now()),1)
  on conflict(key) do update set window_start=excluded.window_start,attempts=case when sb_registration_limits.window_start=excluded.window_start then sb_registration_limits.attempts+1 else 1 end
  returning attempts into attempt;
  if attempt>quota then return false;end if;
 end loop;
 return true;
end;$$;
revoke all on function public.sb_allow_registration(text,text) from public,anon,authenticated;
grant execute on function public.sb_allow_registration(text,text) to service_role;
commit;
