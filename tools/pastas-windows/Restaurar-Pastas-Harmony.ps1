[CmdletBinding()]
param([string]$ReportPath,[switch]$Apply,[switch]$NoPrompt)
$ErrorActionPreference = 'Stop'
if (-not $ReportPath) {
    if ($NoPrompt) { throw 'Informe o relatorio CSV.' }
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title = 'Selecione o relatorio Harmony-renomeacao'
    $dialog.Filter = 'Relatorio Harmony (*.csv)|*.csv'
    if ($dialog.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) { return }
    $ReportPath = $dialog.FileName
}
$rows = @(Import-Csv -LiteralPath $ReportPath)
if (-not $rows.Count) { throw 'O relatorio nao tem pastas para restaurar.' }
$root = [IO.Path]::GetFullPath($rows[0].OriginalRoot).TrimEnd('\')
if (-not [IO.Directory]::GetParent($root)) { throw 'Relatorio invalido.' }
$seen = New-Object 'System.Collections.Generic.HashSet[int]'
foreach ($row in $rows) {
    $old = [IO.Path]::GetFullPath($row.OriginalPath)
    $new = [IO.Path]::GetFullPath($row.RenamedPath)
    if ($row.OriginalRoot -ne $root -or -not $seen.Add([int]$row.Sequence) -or [int]$row.Sequence -lt 1 -or
        (-not [string]::Equals($old,$root,[StringComparison]::OrdinalIgnoreCase) -and -not $old.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)) -or
        -not [string]::Equals((Split-Path -Parent $old),(Split-Path -Parent $new),[StringComparison]::OrdinalIgnoreCase)) { throw 'Relatorio invalido. Nenhuma pasta foi restaurada.' }
}
Write-Host "$($rows.Count) pasta(s) voltarao aos nomes originais. As musicas nao serao alteradas."
if (-not $Apply) {
    if ($NoPrompt) { return $rows }
    if ((Read-Host 'Digite RESTAURAR para continuar ou Enter para sair') -cne 'RESTAURAR') { return }
}
foreach ($row in @($rows | Sort-Object {[int]$_.Sequence} -Descending)) {
    $item = Get-Item -LiteralPath $row.RenamedPath -Force
    if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'O relatorio nao corresponde a uma pasta comum.' }
    if (Test-Path -LiteralPath $row.OriginalPath) { throw "Ja existe um item no destino: $($row.OriginalPath)" }
    Rename-Item -LiteralPath $row.RenamedPath -NewName (Split-Path -Leaf $row.OriginalPath) -ErrorAction Stop
}
Write-Host 'Nomes originais restaurados.' -ForegroundColor Green
