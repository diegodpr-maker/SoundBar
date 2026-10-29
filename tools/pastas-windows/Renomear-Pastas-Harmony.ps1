[CmdletBinding()]
param(
    [string]$Root,
    [switch]$Apply,
    [switch]$NoPrompt,
    [string]$ReportPath
)
$ErrorActionPreference = 'Stop'
function Convert-HarmonyFolderName([string]$Name) {
    $plain = New-Object System.Text.StringBuilder
    foreach ($character in $Name.Normalize([Text.NormalizationForm]::FormD).ToCharArray()) {
        if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($character) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$plain.Append($character)
        }
    }
    $clean = $plain.ToString() -replace '^\s*\d+\s*[-\u2013\u2014]\s*', ''
    $clean = $clean -replace '[0-9]', ''
    $clean = $clean -replace '[^A-Za-z\s]', ' '
    return (($clean -replace '\s+', ' ').Trim())
}
if (-not $Root -or -not (Test-Path -LiteralPath $Root -PathType Container)) {
    if ($NoPrompt) { throw 'A pasta de musicas nao foi encontrada.' }
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = 'Selecione a pasta DESCOMPACTADA que contem as musicas e subpastas.'
    $dialog.ShowNewFolderButton = $false
    $dialog.SelectedPath = [Environment]::GetFolderPath('MyMusic')
    if ($dialog.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) { return }
    $Root = $dialog.SelectedPath
}
$rootItem = Get-Item -LiteralPath $Root -Force
if (-not $rootItem.Parent -or ($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Escolha uma pasta de musicas comum, dentro de uma unidade.' }
$Root = $rootItem.FullName.TrimEnd('\')
$directories = New-Object 'System.Collections.Generic.List[System.IO.DirectoryInfo]'
$stack = New-Object 'System.Collections.Generic.Stack[System.IO.DirectoryInfo]'
$stack.Push($rootItem)
while ($stack.Count -gt 0) {
    $current = $stack.Pop()
    $directories.Add($current)
    foreach ($child in @(Get-ChildItem -LiteralPath $current.FullName -Directory -Force)) {
        if (-not ($child.Attributes -band [IO.FileAttributes]::ReparsePoint)) { $stack.Push($child) }
    }
}
$destinations = New-Object 'System.Collections.Generic.Dictionary[string,string]' ([StringComparer]::OrdinalIgnoreCase)
$plan = New-Object 'System.Collections.Generic.List[object]'
$problems = New-Object 'System.Collections.Generic.List[string]'
foreach ($directory in $directories) {
    $name = Convert-HarmonyFolderName $directory.Name
    if (-not $name -or $name -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$') {
        $problems.Add("Nome invalido depois da limpeza: $($directory.FullName)")
        continue
    }
    $destination = Join-Path $directory.Parent.FullName $name
    if ($destinations.ContainsKey($destination)) {
        $problems.Add("Nomes repetidos: '$($destinations[$destination])' e '$($directory.FullName)' ficariam '$name'.")
    } else { $destinations.Add($destination, $directory.FullName) }
    if ($directory.Name -ceq $name) { continue }
    if ((Test-Path -LiteralPath $destination) -and -not [string]::Equals($destination, $directory.FullName, [StringComparison]::OrdinalIgnoreCase)) {
        $problems.Add("Ja existe uma pasta ou arquivo chamado '$destination'.")
    }
    $plan.Add([pscustomobject]@{OriginalPath=$directory.FullName;RenamedPath=$destination;OldName=$directory.Name;NewName=$name;Depth=($directory.FullName.Split('\').Count)})
}
Write-Host ''
Write-Host 'HARMONY - PREVIA DAS PASTAS' -ForegroundColor Cyan
$plan | Select-Object OldName,NewName | Format-Table -AutoSize | Out-Host
Write-Host "$($plan.Count) pasta(s) para renomear. As musicas nao serao alteradas."
if ($problems.Count -gt 0) { throw ("Nada foi renomeado. Corrija os nomes abaixo e execute novamente:`n" + ($problems -join "`n")) }
if ($plan.Count -eq 0) { Write-Host 'Os nomes das pastas ja estao corretos.';return }
if (-not $Apply) {
    if ($NoPrompt) { return $plan }
    $answer = Read-Host 'Digite RENOMEAR para aplicar ou pressione Enter para sair'
    if ($answer -cne 'RENOMEAR') { Write-Host 'Nada foi renomeado.';return }
}
if (-not $ReportPath) { $ReportPath = Join-Path $rootItem.Parent.FullName ('Harmony-renomeacao-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.csv') }
$ReportPath = [IO.Path]::GetFullPath($ReportPath)
if (Test-Path -LiteralPath $ReportPath) { throw 'O relatorio ja existe. Escolha outro nome; nada foi renomeado.' }
if ($ReportPath.StartsWith($Root + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Salve o relatorio fora da pasta que sera renomeada.' }
if (-not (Test-Path -LiteralPath (Split-Path -Parent $ReportPath) -PathType Container)) { throw 'A pasta do relatorio nao existe.' }
# Create the report before renaming: a report write failure must not start the job.
$stream = [IO.File]::Open($ReportPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
$stream.Dispose()
$sequence = 0
try {
    foreach ($item in @($plan | Sort-Object -Property @{Expression='Depth';Descending=$true},'OriginalPath')) {
        # Only directories are renamed. No file is read, copied, deleted or moved.
        $actual = Get-Item -LiteralPath $item.OriginalPath -Force
        if (-not $actual.PSIsContainer -or ($actual.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "A pasta mudou: $($item.OriginalPath)" }
        if (Test-Path -LiteralPath $item.RenamedPath) { throw "O destino passou a existir: $($item.RenamedPath)" }
        Rename-Item -LiteralPath $item.OriginalPath -NewName $item.NewName -ErrorAction Stop
        $sequence++
        [pscustomobject]@{Sequence=$sequence;OriginalRoot=$Root;OriginalPath=$item.OriginalPath;RenamedPath=$item.RenamedPath} | Export-Csv -LiteralPath $ReportPath -NoTypeInformation -Encoding UTF8 -Append
    }
} catch {
    Write-Host "Operacao interrompida. O relatorio registra as $sequence pasta(s) ja renomeadas: $ReportPath" -ForegroundColor Yellow
    throw
}
Write-Host ''
Write-Host "$sequence pasta(s) renomeadas. Arquivos de musica preservados." -ForegroundColor Green
Write-Host "Relatorio para restaurar os nomes: $ReportPath"
