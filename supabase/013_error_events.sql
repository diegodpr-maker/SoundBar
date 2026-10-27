begin;
create table if not exists public.sb_error_events(id bigint generated always as identity primary key,created_at timestamptz not null default now(),kind text not null,route text not null,status integer,source text,line integer,fingerprint text not null);
alter table public.sb_error_events enable row level security;
revoke all on public.sb_error_events from public,anon,authenticated;
grant all on public.sb_error_events to service_role;
grant usage,select on sequence public.sb_error_events_id_seq to service_role;
create index if not exists sb_errors_time on public.sb_error_events(created_at);
commit;
