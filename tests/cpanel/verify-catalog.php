<?php
declare(strict_types=1);
$script=$argv[1]??(__DIR__.'/../../tools/cpanel/kit/harmony-catalogo.php');
$base=sys_get_temp_dir().'/harmony-cpanel-'.bin2hex(random_bytes(8));
mkdir($base,0700,true);
function check(bool $ok,string $message): void {if(!$ok){throw new RuntimeException($message);}}
function erase(string $path): void {
 if(is_link($path)||is_file($path)){unlink($path);return;}
 foreach(scandir($path) as $name){if($name!=='.'&&$name!=='..'){erase($path.'/'.$name);}}
 rmdir($path);
}
try{
 copy($script,$base.'/harmony-catalogo.php');
 $category='Abertura Trabalhos';mkdir($base.'/'.$category);
 $filename='01-Meditação & Abertura #1.mp3';$audio=$base.'/'.$category.'/'.$filename;
 file_put_contents($audio,"\xff\xfb\x90\x00synthetic");$before=hash_file('sha256',$audio);
 file_put_contents($base.'/'.$category.'/playlist.txt','not audio');
 file_put_contents($base.'/'.$category.'/converter.wma','WMA fixture');
 mkdir($base.'/.hidden');file_put_contents($base.'/.hidden/private.mp3','hidden');
 $outside=$base.'-outside.mp3';file_put_contents($outside,'outside');
 if(function_exists('symlink')){symlink($outside,$base.'/'.$category.'/outside.mp3');}
 $output=[];$status=0;exec(escapeshellarg(PHP_BINARY).' '.escapeshellarg($base.'/harmony-catalogo.php'),$output,$status);
 check($status===0,'Script execution failed');$text=implode("\n",$output);$result=json_decode($text,true,512,JSON_THROW_ON_ERROR);
 check($result['format']==='harmony-cpanel-catalog','Wrong format');check(count($result['files'])===1,'Unexpected file count');
 check($result['files'][0]['filename']===$filename,'Filename changed');check($result['files'][0]['category']===$category,'Wrong category');
 check($result['files'][0]['path']==='Abertura%20Trabalhos/01-Medita%C3%A7%C3%A3o%20%26%20Abertura%20%231.mp3','URL encoding failed');
 check($result['files'][0]['file_size']===filesize($audio),'Wrong size');check(count($result['ignored'])===1,'WMA not reported');
 check(strpos($text,$base)===false,'Exposed filesystem path');check(strpos($text,'outside.mp3')===false,'Included a symlink outside scope');
 check(hash_file('sha256',$audio)===$before,'Audio changed');
 check(!$result['truncated'],'Wrong truncation flag');
 echo "cPanel PHP catalogue passed: exact names, encoded paths, metadata only, no symlinks/hidden folders/local-path disclosure, WMA report and unchanged source audio.\n";
}finally{if(isset($outside)&&is_file($outside)){unlink($outside);}erase($base);}
