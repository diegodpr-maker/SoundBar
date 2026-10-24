begin;
-- Explicit denial for client roles; only server helpers/owners manage these tables.
create policy sb_deny_client on soundbar_private.sb_admins for all to anon,authenticated using(false) with check(false);
create policy sb_deny_client on soundbar_private.sb_admin_bootstrap for all to anon,authenticated using(false) with check(false);
create policy sb_deny_client on soundbar_private.sb_admin_audit for all to anon,authenticated using(false) with check(false);
create policy sb_deny_client on soundbar_private.sb_registration_limits for all to anon,authenticated using(false) with check(false);
commit;
