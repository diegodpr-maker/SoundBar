begin;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create table soundbar_private.sb_push_config(id boolean primary key default true check(id),public_key text,private_key text,dispatch_secret text not null default(gen_random_uuid()::text||gen_random_uuid()::text));
insert into soundbar_private.sb_push_config(id) values(true);
create table soundbar_private.sb_push_subscriptions(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,endpoint text not null unique,p256dh text not null,auth text not null,created_at timestamptz not null default now());
create index sb_push_subscriptions_user_idx on soundbar_private.sb_push_subscriptions(user_id);
create table soundbar_private.sb_push_events(id uuid primary key default gen_random_uuid(),kind text not null check(kind in('signup','test')),source_account uuid unique references public.sb_account_access(user_id) on delete cascade,target_subscription uuid references soundbar_private.sb_push_subscriptions(id) on delete cascade,created_at timestamptz not null default now(),next_attempt timestamptz not null default now(),attempts integer not null default 0,lease uuid,lease_until timestamptz,completed boolean not null default false);
create index sb_push_events_due_idx on soundbar_private.sb_push_events(next_attempt) where not completed;
create index sb_push_events_target_idx on soundbar_private.sb_push_events(target_subscription);
create table soundbar_private.sb_push_deliveries(event_id uuid not null references soundbar_private.sb_push_events(id) on delete cascade,subscription_id uuid not null references soundbar_private.sb_push_subscriptions(id) on delete cascade,delivered boolean not null,status integer not null,updated_at timestamptz not null default now(),primary key(event_id,subscription_id));
create index sb_push_deliveries_subscription_idx on soundbar_private.sb_push_deliveries(subscription_id);
alter table soundbar_private.sb_push_config enable row level security;
alter table soundbar_private.sb_push_subscriptions enable row level security;
alter table soundbar_private.sb_push_events enable row level security;
alter table soundbar_private.sb_push_deliveries enable row level security;
revoke all on soundbar_private.sb_push_config,soundbar_private.sb_push_subscriptions,soundbar_private.sb_push_events,soundbar_private.sb_push_deliveries from public,anon,authenticated;
create policy sb_push_deny on soundbar_private.sb_push_config for all to anon,authenticated using(false) with check(false);
create policy sb_push_deny on soundbar_private.sb_push_subscriptions for all to anon,authenticated using(false) with check(false);
create policy sb_push_deny on soundbar_private.sb_push_events for all to anon,authenticated using(false) with check(false);
create policy sb_push_deny on soundbar_private.sb_push_deliveries for all to anon,authenticated using(false) with check(false);

create function soundbar_private.sb_push_new_account() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status='pending' then insert into soundbar_private.sb_push_events(kind,source_account) values('signup',new.user_id) on conflict(source_account) do nothing;end if;return new;
end$$;
revoke all on function soundbar_private.sb_push_new_account() from public,anon,authenticated;
create trigger sb_push_registration after insert on public.sb_account_access for each row execute function soundbar_private.sb_push_new_account();

create function soundbar_private.sb_push_recipients(event uuid) returns table(id uuid,endpoint text,p256dh text,auth text) language sql stable security definer set search_path='' as $$
 select s.id,s.endpoint,s.p256dh,s.auth from soundbar_private.sb_push_subscriptions s
 join soundbar_private.sb_admins a on a.user_id=s.user_id
 join public.sb_account_access access on access.user_id=s.user_id and access.status='approved'
 join soundbar_private.sb_push_events e on e.id=event
 where (e.kind='signup' and s.created_at<=e.created_at or e.kind='test' and e.target_subscription=s.id)
 and not exists(select 1 from soundbar_private.sb_push_deliveries d where d.event_id=e.id and d.subscription_id=s.id and d.delivered);
$$;
revoke all on function soundbar_private.sb_push_recipients(uuid) from public,anon,authenticated;

create function soundbar_private.sb_admin_notifications(action text,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare sub soundbar_private.sb_push_subscriptions;v_endpoint text:=data->>'endpoint';key text;
begin
 if not soundbar_private.sb_is_admin() then raise exception 'Acesso exclusivo do administrador.' using errcode='42501';end if;
 perform 1 from public.sb_account_access where user_id=auth.uid() for update;
 if action='config' then
 select public_key into key from soundbar_private.sb_push_config where id=true;
 return jsonb_build_object('publicKey',key,'enabled',exists(select 1 from soundbar_private.sb_push_subscriptions s where s.endpoint=v_endpoint and s.user_id=auth.uid()));
 elsif action='subscribe' then
 if v_endpoint is null or char_length(v_endpoint)>4096 or v_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[^[:space:]#]+$'
 or data->>'p256dh' is null or data->>'p256dh' !~ '^[A-Za-z0-9_-]{87}$' or data->>'auth' is null or data->>'auth' !~ '^[A-Za-z0-9_-]{22}$' then raise exception 'Não foi possível ativar neste navegador.';end if;
 if not exists(select 1 from soundbar_private.sb_push_config where id=true and public_key is not null) then raise exception 'Tente ativar novamente em instantes.';end if;
 select * into sub from soundbar_private.sb_push_subscriptions s where s.endpoint=v_endpoint;
 if found and sub.user_id<>auth.uid() then raise exception 'Desative as notificações da outra conta neste aparelho.';end if;
 if sub.id is null and (select count(*) from soundbar_private.sb_push_subscriptions where user_id=auth.uid())>=5 then raise exception 'Desative as notificações em outro aparelho antes de adicionar este.';end if;
 insert into soundbar_private.sb_push_subscriptions(user_id,endpoint,p256dh,auth) values(auth.uid(),v_endpoint,data->>'p256dh',data->>'auth') on conflict(endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth where sb_push_subscriptions.user_id=auth.uid();
 if not found then raise exception 'Desative as notificações da outra conta neste aparelho.';end if;
 return '{"enabled":true}'::jsonb;
 elsif action='unsubscribe' then
 delete from soundbar_private.sb_push_subscriptions s where s.endpoint=v_endpoint and s.user_id=auth.uid();return '{"enabled":false}'::jsonb;
 elsif action='test' then
 select * into sub from soundbar_private.sb_push_subscriptions s where s.endpoint=v_endpoint and s.user_id=auth.uid();
 if not found then raise exception 'Ative as notificações neste aparelho primeiro.';end if;
 if exists(select 1 from soundbar_private.sb_push_events where target_subscription=sub.id and created_at>now()-interval '1 minute') then raise exception 'Aguarde um minuto antes de testar novamente.';end if;
 insert into soundbar_private.sb_push_events(kind,target_subscription) values('test',sub.id);perform soundbar_private.sb_push_wake();return '{"queued":true}'::jsonb;
 end if;
 raise exception 'Opção inválida.';
end$$;
revoke all on function soundbar_private.sb_admin_notifications(text,jsonb) from public,anon;
grant execute on function soundbar_private.sb_admin_notifications(text,jsonb) to authenticated;
create function public.sb_admin_notifications(action text,data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select soundbar_private.sb_admin_notifications(action,data)$$;
revoke all on function public.sb_admin_notifications(text,jsonb) from public,anon;
grant execute on function public.sb_admin_notifications(text,jsonb) to authenticated;

create function soundbar_private.sb_push_wake() returns bigint language sql security definer set search_path='' as $$
 select net.http_post(url:='https://fcmsojjtkiehsobbkjnr.supabase.co/functions/v1/soundbar-admin-push',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||dispatch_secret),body:='{}'::jsonb,timeout_milliseconds:=55000) from soundbar_private.sb_push_config where id=true;
$$;
revoke all on function soundbar_private.sb_push_wake() from public,anon,authenticated;

create function soundbar_private.sb_webpush_server(action text,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare e soundbar_private.sb_push_events;out jsonb:='[]';subs jsonb;status integer;sid uuid;token uuid;
begin
 if action='config' then return (select jsonb_build_object('publicKey',public_key,'privateKey',private_key,'dispatchSecret',dispatch_secret) from soundbar_private.sb_push_config where id=true);
 elsif action='init' then
 if data->>'publicKey' !~ '^[A-Za-z0-9_-]{87}$' or data->>'privateKey' !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'Invalid server key';end if;
 update soundbar_private.sb_push_config set public_key=data->>'publicKey',private_key=data->>'privateKey' where id=true and public_key is null;
 return soundbar_private.sb_webpush_server('config','{}');
 elsif action='wake' then perform soundbar_private.sb_push_wake();return '{"ok":true}'::jsonb;
 elsif action='claim' then
 delete from soundbar_private.sb_push_events where created_at<now()-interval '30 days';
 update soundbar_private.sb_push_events set completed=true where not completed and (created_at<now()-interval '1 day' or attempts>=10 or kind='signup' and not exists(select 1 from public.sb_account_access a where a.user_id=source_account and a.status='pending'));
 for e in select * from soundbar_private.sb_push_events where not completed and next_attempt<=now() and (lease_until is null or lease_until<now()) order by created_at limit 3 for update skip locked loop
  select coalesce(jsonb_agg(to_jsonb(r)),'[]') into subs from (select * from soundbar_private.sb_push_recipients(e.id) limit 10) r;
  if jsonb_array_length(subs)=0 then update soundbar_private.sb_push_events set completed=true where id=e.id;continue;end if;
  token:=gen_random_uuid();update soundbar_private.sb_push_events set lease=token,lease_until=now()+interval '90 seconds',attempts=attempts+1 where id=e.id;
  out:=out||jsonb_build_array(jsonb_build_object('id',e.id,'lease',token,'kind',e.kind,'subscriptions',subs));
 end loop;return out;
 elsif action in('record','finish') then
 select * into e from soundbar_private.sb_push_events where id=(data->>'event')::uuid and lease=(data->>'lease')::uuid and not completed for update;
 if not found then return '{"ok":false}'::jsonb;end if;
 if action='record' then
  sid:=(data->>'subscription')::uuid;status:=(data->>'status')::integer;
  if status in(404,410) then delete from soundbar_private.sb_push_subscriptions where id=sid;
  elsif exists(select 1 from soundbar_private.sb_push_subscriptions where id=sid) then
   insert into soundbar_private.sb_push_deliveries(event_id,subscription_id,delivered,status) values(e.id,sid,status between 200 and 299,status)
   on conflict(event_id,subscription_id) do update set delivered=excluded.delivered,status=excluded.status,updated_at=now();
  end if;
 else
  update soundbar_private.sb_push_events set completed=not exists(select 1 from soundbar_private.sb_push_recipients(e.id)),lease=null,lease_until=null,next_attempt=now()+interval '1 minute' where id=e.id;
 end if;return '{"ok":true}'::jsonb;
 end if;
 raise exception 'Invalid server action';
end$$;
revoke all on function soundbar_private.sb_webpush_server(text,jsonb) from public,anon,authenticated;
grant execute on function soundbar_private.sb_webpush_server(text,jsonb) to service_role;
create function public.sb_webpush_server(action text,data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select soundbar_private.sb_webpush_server(action,data)$$;
revoke all on function public.sb_webpush_server(text,jsonb) from public,anon,authenticated;
grant execute on function public.sb_webpush_server(text,jsonb) to service_role;
commit;
