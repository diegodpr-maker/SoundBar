begin;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();p uuid:=gen_random_uuid();obj text;bad text;payload text:='x''; drop table public.sb_playlists; --';n integer;
begin
 insert into auth.users(id,email) values(a,a||'@example.invalid'),(b,b||'@example.invalid');
 insert into public.sb_profiles(id,display_name) values(a,'Security A'),(b,'Security B');
 update public.sb_account_access set status='approved' where user_id in(a,b);
 perform set_config('request.jwt.claim.sub',a::text,true);execute 'set local role authenticated';
 insert into public.sb_playlists(id,name) values(p,payload);
 if (select name from public.sb_playlists where id=p)<>payload then raise exception 'SQL payload was not stored as literal data';end if;
 obj:=a||'/'||gen_random_uuid()||'.mp3';
 insert into storage.objects(bucket_id,name,metadata) values('soundbar-audio',obj,'{"size":128,"mimetype":"audio/mpeg"}');
 begin insert into storage.objects(bucket_id,name,metadata) values('soundbar-audio',a||'/'||gen_random_uuid()||'.html','{"size":128,"mimetype":"audio/mpeg"}');raise exception 'HTML path accepted';exception when insufficient_privilege then null;end;
 begin insert into storage.objects(bucket_id,name,metadata) values('soundbar-audio',a||'/../evil.mp3','{"size":128,"mimetype":"audio/mpeg"}');raise exception 'Traversal accepted';exception when insufficient_privilege then null;end;
 begin insert into storage.objects(bucket_id,name,metadata) values('soundbar-library','custom/'||gen_random_uuid()||'.mp3','{"size":128,"mimetype":"audio/mpeg"}');raise exception 'Nonadmin library write accepted';exception when insufficient_privilege then null;end;
 begin perform public.sb_review_account(a,'approved');raise exception 'Self approval accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',b::text,true);
 if exists(select 1 from storage.objects where bucket_id='soundbar-audio' and name=obj) then raise exception 'Other user can read object';end if;
 if exists(select 1 from public.sb_playlists where id=p) then raise exception 'Other user can read playlist';end if;
 update public.sb_playlists set name='Changed' where id=p;get diagnostics n=row_count;if n<>0 then raise exception 'Cross tenant write';end if;
 execute 'reset role';
 if exists(select 1 from storage.buckets where id in('soundbar-audio','soundbar-library') and ('text/html'=any(allowed_mime_types) or file_size_limit>52428800)) then raise exception 'Unsafe bucket configuration';end if;
end $$;
rollback;
