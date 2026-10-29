begin;
do $$
declare item_id text:='cpanel-test-'||gen_random_uuid()::text; candidate text;
begin
 insert into public.sb_library_tracks(id,name,category,object_path,audio_url,filename,active)
 values(item_id,'Synthetic fixture','Fixture',null,'https://sysmacom.com.br/musicas-harmony/Abertura%20Trabalhos/fixture.mp3','fixture.mp3',true);
 foreach candidate in array array[
 'http://sysmacom.com.br/musicas-harmony/a.mp3',
 'https://sysmacom.com.br.attacker.test/musicas-harmony/a.mp3',
 'https://attacker.test/a.mp3',
 'https://sysmacom.com.br/wp-content/a.mp3',
 'https://sysmacom.com.br/musicas-harmony/../a.mp3',
 'https://sysmacom.com.br/musicas-harmony/%2e%2e/a.mp3',
 'https://sysmacom.com.br/musicas-harmony/a%2Fb.mp3',
 'https://sysmacom.com.br/musicas-harmony/a.mp3?redirect=1',
 'https://sysmacom.com.br/musicas-harmony/a.php',
 'https://sysmacom.com.br/musicas-harmony/a.wma',
 'https://sysmacom.com.br/musicas-harmony/a'||chr(92)||'.mp3'
 ] loop
  begin
   update public.sb_library_tracks set audio_url=candidate where id=item_id;
   raise exception 'Invalid source accepted: %',candidate;
  exception when check_violation then null;
  end;
 end loop;
 update public.sb_library_tracks set active=false where id=item_id;
 update public.sb_library_tracks set audio_url='https://legacy.example.test/retired.mp3' where id=item_id;
 begin
  update public.sb_library_tracks set active=true where id=item_id;
  raise exception 'Retired arbitrary source reactivated';
 exception when check_violation then null;
 end;
end $$;
rollback;
