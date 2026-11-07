-- These tables are internal. Existing RPCs and Edge Functions retain their
-- existing server-side authorization; browsers receive no direct table access.
begin;
create policy sb_error_events_no_direct_client_access
on public.sb_error_events as restrictive for all to anon, authenticated
using (false) with check (false);
create policy sb_playlist_share_grants_no_direct_client_access
on public.sb_playlist_share_grants as restrictive for all to anon, authenticated
using (false) with check (false);
comment on policy sb_error_events_no_direct_client_access on public.sb_error_events is
'Internal telemetry: direct client access denied; existing server grants unchanged.';
comment on policy sb_playlist_share_grants_no_direct_client_access on public.sb_playlist_share_grants is
'Internal sharing grants: direct client access denied; authorized RPCs retain ownership checks.';
commit;
