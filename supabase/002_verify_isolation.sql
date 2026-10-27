-- Teste de integração opcional no SQL Editor, DEPOIS da migração.
-- Cria contas temporárias e desfaz tudo no final. Nenhum e-mail é enviado.
begin;
select set_config('test.soundbar.a',gen_random_uuid()::text,true);
select set_config('test.soundbar.b',gen_random_uuid()::text,true);
select set_config('test.soundbar.playlist',gen_random_uuid()::text,true);
select set_config('test.soundbar.sample',(select id from public.sb_library_tracks where active order by position limit 1),true);
insert into auth.users(id,email) values
(current_setting('test.soundbar.a')::uuid,current_setting('test.soundbar.a')||'@example.invalid'),
(current_setting('test.soundbar.b')::uuid,current_setting('test.soundbar.b')||'@example.invalid');
insert into public.sb_profiles(id,display_name) values
(current_setting('test.soundbar.a')::uuid,'Tenant A'),(current_setting('test.soundbar.b')::uuid,'Tenant B');
update public.sb_account_access set status='approved' where user_id in (current_setting('test.soundbar.a')::uuid,current_setting('test.soundbar.b')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.soundbar.a'),true);
insert into public.sb_playlists(id,name) values(current_setting('test.soundbar.playlist')::uuid,'Private A');
insert into public.sb_tracks(playlist_id,name,sample_id) values(current_setting('test.soundbar.playlist')::uuid,'Example',current_setting('test.soundbar.sample'));
do $$ begin
 if (select count(*) from public.sb_playlists)<>1 then raise exception 'Owner cannot read playlist';end if;
 if (select count(*) from public.sb_tracks)<>1 then raise exception 'Owner cannot read track';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.soundbar.b'),true);
do $$ declare n bigint;begin
 if (select count(*) from public.sb_playlists)<>0 then raise exception 'Tenant leak: playlists';end if;
 if (select count(*) from public.sb_tracks)<>0 then raise exception 'Tenant leak: tracks';end if;
 if (select count(*) from public.sb_profiles)<>1 then raise exception 'Tenant leak: profiles';end if;
 update public.sb_playlists set name='Hacked' where id=current_setting('test.soundbar.playlist')::uuid;
 get diagnostics n=row_count;if n<>0 then raise exception 'Cross-tenant update allowed';end if;
 begin
  insert into public.sb_tracks(playlist_id,name,sample_id) values(current_setting('test.soundbar.playlist')::uuid,'Cross tenant',current_setting('test.soundbar.sample'));
  raise exception 'Cross-tenant foreign key accepted';
 exception when foreign_key_violation then null;end;
 begin
  insert into public.sb_playlists(user_id,name) values(current_setting('test.soundbar.a')::uuid,'Impersonation');
  raise exception 'Owner injection accepted';
 exception when insufficient_privilege or raise_exception then
  if sqlerrm='Owner injection accepted' then raise;end if;
 end;
end $$;
reset role;
rollback;
-- If no exception appeared, the relational isolation checks passed.
-- Also test Storage with two real accounts: user B must not read or sign user A paths.
