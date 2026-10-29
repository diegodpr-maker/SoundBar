param([string]$ToolsRoot)
$ErrorActionPreference='Stop'
$tools=if($ToolsRoot){$ToolsRoot}else{Join-Path $PSScriptRoot '../../tools/catalogo-windows'}
$script=Join-Path $tools 'Gerar-Catalogo-Harmony.ps1'
$base=Join-Path ([IO.Path]::GetTempPath()) ('harmony-catalog-'+[guid]::NewGuid())
New-Item -ItemType Directory -Path $base | Out-Null
function Assert($condition,[string]$message){if(-not $condition){throw $message}}
try {
 $source=Join-Path $base 'Entrega Bolsa de Proposicoes'
 $root=Join-Path $source 'Abertura Trabalhos'
 New-Item -ItemType Directory -Path $root -Force | Out-Null
 $filename='01-Meditação & Abertura #1.mp3'
 $file=Join-Path $root $filename
 [IO.File]::WriteAllBytes($file,[byte[]]@(1,2,3,4))
 [IO.File]::WriteAllText((Join-Path $root 'playlist.txt'),'ignored')
 [IO.File]::WriteAllBytes((Join-Path $root 'converter.wma'),[byte[]]@(5,6))
 $before=(Get-FileHash -LiteralPath $file).Hash
 $jsonPath=Join-Path $base 'catalogo.json'
 & $script -SourceFolder $source -OutputFile $jsonPath -NoPrompt
 $text=[IO.File]::ReadAllText($jsonPath)
 $result=$text | ConvertFrom-Json
 Assert ($result.format -eq 'harmony-cpanel-catalog') 'Wrong catalogue format.'
 Assert (@($result.files).Count -eq 1) 'Wrong audio count.'
 Assert ($result.files[0].filename -eq $filename) 'Original filename was changed.'
 Assert ($result.files[0].category -eq 'Abertura Trabalhos') 'Wrong category.'
 Assert ($result.files[0].file_size -eq 4) 'Wrong file size.'
 Assert ($result.files[0].path -eq 'Abertura%20Trabalhos/01-Medita%C3%A7%C3%A3o%20%26%20Abertura%20%231.mp3') 'Path segments were not correctly encoded.'
 Assert ($result.files[0].url -eq ('https://sysmacom.com.br/musicas-harmony/'+$result.files[0].path)) 'Wrong hosted URL.'
 Assert (@($result.ignored).Count -eq 1) 'WMA adjustment was not listed.'
 Assert (-not $text.Contains($base)) 'Local absolute path was exposed.'
 Assert (-not $text.Contains('base64')) 'Audio bytes must not be included.'
 Assert ((Get-FileHash -LiteralPath $file).Hash -eq $before) 'Audio contents changed.'
 Assert (@(Get-ChildItem -LiteralPath $root -File).Count -eq 3) 'Source files changed.'
 $bytes=[IO.File]::ReadAllBytes($jsonPath)
 Assert (-not ($bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191)) 'JSON must not have a BOM.'
 $failed=$false
 try { & $script -SourceFolder $source -OutputFile $jsonPath -NoPrompt } catch {$failed=$true}
 Assert $failed 'Existing output must not be overwritten.'
 Write-Host 'Local catalogue passed: exact hosted paths, UTF-8 segment encoding, categories, sizes, WMA adjustments, no local path/audio disclosure, unchanged source files and overwrite guard.'
} finally {Remove-Item -LiteralPath $base -Recurse -Force}
