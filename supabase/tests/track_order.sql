begin;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); t1 uuid:=gen_random_uuid(); t2 uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values(a,a||'@example.invalid','{}',now()),(b,b||'@example.invalid','{}',now());
 insert into public.sb_profiles(id,display_name) values(a,'Order A'),(b,'Order B');
 update public.sb_account_access set status='approved' where user_id in(a,b);
 perform set_config('request.jwt.claim.sub',a::text,true);
 insert into public.sb_playlists(id,user_id,name) values(p,a,'Order test');
 insert into public.sb_tracks(id,user_id,playlist_id,name,audio_path) values(t1,a,p,'First',a||'/first.mp3'),(t2,a,p,'Second',a||'/second.mp3');
 perform set_config('request.jwt.claim.sub',a::text,true);
 execute 'set local role authenticated';
 perform public.sb_reorder_tracks(p,array[t2,t1]);
 if (select array_agg(id order by position) from public.sb_tracks where playlist_id=p)<>array[t2,t1] then raise exception 'Order not persisted';end if;
 if (select name from public.sb_tracks where id=t1)<>'First' then raise exception 'Name changed';end if;
 begin perform public.sb_reorder_tracks(p,array[t1,t1]);raise exception 'Duplicate accepted';exception when raise_exception then if sqlerrm='Duplicate accepted' then raise;end if;end;
 begin perform public.sb_reorder_tracks(p,array[t1]);raise exception 'Partial accepted';exception when raise_exception then if sqlerrm='Partial accepted' then raise;end if;end;
 if (select array_agg(id order by position) from public.sb_tracks where playlist_id=p)<>array[t2,t1] then raise exception 'Invalid input changed order';end if;
 perform set_config('request.jwt.claim.sub',b::text,true);
 begin perform public.sb_reorder_tracks(p,array[t1,t2]);raise exception 'Other owner accepted';exception when insufficient_privilege then null;end;
 execute 'reset role';
end $$;
rollback;
