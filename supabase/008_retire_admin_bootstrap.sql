begin;
do $$begin if not exists(select 1 from soundbar_private.sb_admins) then raise exception 'Administrador ainda não configurado';end if;end $$;
drop function public.sb_claim_admin(text);
drop function soundbar_private.sb_claim_admin(text);
drop table soundbar_private.sb_admin_bootstrap;
commit;
