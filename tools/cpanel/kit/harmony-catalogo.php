<?php
// Read-only catalogue. No upload, deletion, execution or arbitrary-path endpoint.
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: https://harmony.sysmacom.com.br');
header('Vary: Origin');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'HEAD'], true)) {
    http_response_code(405);
    header('Allow: GET, HEAD');
    echo json_encode(['error' => 'Metodo nao permitido.']);
    exit;
}
function category_key(string $value): string {
    $value = strtr($value, ['á'=>'a','à'=>'a','ã'=>'a','â'=>'a','ä'=>'a','Á'=>'a','À'=>'a','Ã'=>'a','Â'=>'a','Ä'=>'a','é'=>'e','è'=>'e','ê'=>'e','ë'=>'e','É'=>'e','È'=>'e','Ê'=>'e','Ë'=>'e','í'=>'i','ì'=>'i','î'=>'i','ï'=>'i','Í'=>'i','Ì'=>'i','Î'=>'i','Ï'=>'i','ó'=>'o','ò'=>'o','õ'=>'o','ô'=>'o','ö'=>'o','Ó'=>'o','Ò'=>'o','Õ'=>'o','Ô'=>'o','Ö'=>'o','ú'=>'u','ù'=>'u','û'=>'u','ü'=>'u','Ú'=>'u','Ù'=>'u','Û'=>'u','Ü'=>'u','ç'=>'c','Ç'=>'c']);
    return strtolower((string)preg_replace('/[^a-z]/i', '', $value));
}
$filter = $_GET['categoria'] ?? '';
if (!is_string($filter) || strlen($filter) > 180) {
    http_response_code(400);
    echo json_encode(['error'=>'Categoria invalida.']);
    exit;
}
$root = realpath(__DIR__);
$files = [];
$ignored = [];
$truncated = false;
$mimes = ['mp3'=>'audio/mpeg','wav'=>'audio/wav','ogg'=>'audio/ogg','m4a'=>'audio/mp4','aac'=>'audio/aac','flac'=>'audio/flac','webm'=>'audio/webm'];
try {
    $directory = new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS);
    $filtered = new RecursiveCallbackFilterIterator($directory, static function ($entry): bool {
        $name = $entry->getFilename();
        return !$entry->isLink() && substr($name, 0, 1) !== '.' && $name !== '__MACOSX';
    });
    $iterator = new RecursiveIteratorIterator($filtered, RecursiveIteratorIterator::LEAVES_ONLY);
    $iterator->setMaxDepth(12);
    foreach ($iterator as $entry) {
        if (!$entry->isFile() || $entry->isLink()) { continue; }
        $extension = strtolower($entry->getExtension());
        if (!isset($mimes[$extension]) && $extension !== 'wma') { continue; }
        $actual = $entry->getRealPath();
        if ($actual === false || strpos($actual, $root . DIRECTORY_SEPARATOR) !== 0) { continue; }
        $relative = str_replace(DIRECTORY_SEPARATOR, '/', substr($actual, strlen($root) + 1));
        $parent = dirname($relative);
        $category = $parent === '.' ? 'Geral' : basename($parent);
        $category = trim((string)preg_replace('/^\s*\d+\s*[-\x{2013}\x{2014}]\s*/u', '', $category));
        if ($filter !== '' && category_key($category) !== category_key($filter)) { continue; }
        $path = implode('/', array_map('rawurlencode', explode('/', $relative)));
        $size = $entry->getSize();
        if ($extension === 'wma' || $size < 1 || $size > 52428800) {
            if (count($ignored) < 300) { $ignored[] = ['path'=>$path,'reason'=>$extension === 'wma'?'Converta WMA para MP3 antes de publicar.':'O audio deve ter entre 1 byte e 50 MB.']; }
            continue;
        }
        if (count($files) >= 5000) { $truncated = true; break; }
        $files[] = ['path'=>$path,'filename'=>$entry->getFilename(),'category'=>$category,'name'=>pathinfo($entry->getFilename(),PATHINFO_FILENAME),'file_size'=>$size,'mime'=>$mimes[$extension]];
    }
    usort($files, static function ($a,$b): int { return strnatcasecmp($a['path'],$b['path']); });
    $result = ['format'=>'harmony-cpanel-catalog','version'=>1,'base_url'=>'https://sysmacom.com.br/musicas-harmony/','files'=>$files,'ignored'=>$ignored,'truncated'=>$truncated];
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['error'=>'Nao foi possivel ler as pastas de audio. Confira as permissoes da pasta.']);
}
