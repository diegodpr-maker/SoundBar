[CmdletBinding()]
param([string]$SourceFolder,[string]$OutputFile,[switch]$NoPrompt)
$ErrorActionPreference = 'Stop'
$base = 'https://sysmacom.com.br/musicas-harmony/'
if (-not $SourceFolder) {
    if ($NoPrompt) { throw 'Informe a pasta de audios.' }
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = 'Selecione Entrega Bolsa de Proposicoes, que contem as subpastas de musicas.'
    $dialog.ShowNewFolderButton = $false
    $dialog.SelectedPath = [Environment]::GetFolderPath('MyMusic')
    if ($dialog.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) { return }
    $SourceFolder = $dialog.SelectedPath
}
$root = Get-Item -LiteralPath $SourceFolder -Force
if (-not $root.PSIsContainer -or -not $root.Parent -or ($root.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Escolha uma pasta de audios descompactada.' }
$prefix = $root.FullName.TrimEnd('\') + '\'
$stack = New-Object 'System.Collections.Generic.Stack[System.IO.DirectoryInfo]'
$stack.Push($root)
$files = New-Object 'System.Collections.Generic.List[object]'
$ignored = New-Object 'System.Collections.Generic.List[object]'
$mimes = @{'.mp3'='audio/mpeg';'.wav'='audio/wav';'.ogg'='audio/ogg';'.m4a'='audio/mp4';'.aac'='audio/aac';'.flac'='audio/flac';'.webm'='audio/webm'}
while ($stack.Count -gt 0) {
    $directory = $stack.Pop()
    foreach ($entry in @(Get-ChildItem -LiteralPath $directory.FullName -Force)) {
        if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $entry.Name.StartsWith('.') -or $entry.Name -eq '__MACOSX') { continue }
        if ($entry.PSIsContainer) { $stack.Push($entry);continue }
        $extension = $entry.Extension.ToLowerInvariant()
        if (-not $mimes.ContainsKey($extension) -and $extension -ne '.wma') { continue }
        $relative = $entry.FullName.Substring($prefix.Length).Replace('\','/')
        $encoded = (($relative.Split('/') | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/')
        if ($extension -eq '.wma' -or $entry.Length -lt 1 -or $entry.Length -gt 52428800) {
            $reason = if ($extension -eq '.wma') { 'Converter WMA para MP3 antes de publicar.' } else { 'Audio fora do limite de 1 byte a 50 MB.' }
            $ignored.Add([pscustomobject]@{path=$encoded;reason=$reason})
            continue
        }
        if ($files.Count -ge 5000) { throw 'Mais de 5.000 audios. Selecione uma subpasta menor.' }
        $category = ($entry.Directory.Name -replace '^\s*\d+\s*[-\u2013\u2014]\s*','').Trim()
        $files.Add([pscustomobject]@{path=$encoded;url=$base+$encoded;filename=$entry.Name;name=$entry.BaseName;category=$category;file_size=$entry.Length;mime=$mimes[$extension]})
    }
}
if ($files.Count -eq 0) { throw 'Nenhum audio compativel encontrado na pasta escolhida.' }
if (-not $OutputFile) {
    if ($NoPrompt) { throw 'Informe o destino do catalogo JSON.' }
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.SaveFileDialog
    $dialog.Title = 'Salvar listagem pequena para enviar ao Harmony'
    $dialog.Filter = 'Catalogo Harmony (*.json)|*.json'
    $dialog.FileName = 'Harmony-catalogo.json'
    $dialog.InitialDirectory = [Environment]::GetFolderPath('Desktop')
    if ($dialog.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) { return }
    $OutputFile = $dialog.FileName
}
$output = [IO.Path]::GetFullPath($OutputFile)
if (Test-Path -LiteralPath $output) { throw 'Ja existe um arquivo nesse destino. Escolha outro nome para preservar o anterior.' }
$catalog = [pscustomobject]@{format='harmony-cpanel-catalog';version=1;base_url=$base;files=@($files | Sort-Object path);ignored=@($ignored.ToArray())}
$json = $catalog | ConvertTo-Json -Depth 6
[IO.File]::WriteAllText($output,$json,(New-Object Text.UTF8Encoding($false)))
Write-Host ''
Write-Host "$($files.Count) audio(s) listados em $output" -ForegroundColor Green
Write-Host 'Envie somente esse JSON no chat. Os arquivos de musica nao foram abertos nem alterados.'
if ($ignored.Count) { Write-Host "$($ignored.Count) audio(s) precisam de ajuste; os motivos estao no JSON." -ForegroundColor Yellow }
