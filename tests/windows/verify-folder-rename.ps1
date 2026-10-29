param([string]$ToolsRoot)
$ErrorActionPreference = 'Stop'
$tools = if ($ToolsRoot) { $ToolsRoot } else { Join-Path $PSScriptRoot '../../tools/pastas-windows' }
$rename = Join-Path $tools 'Renomear-Pastas-Harmony.ps1'
$restore = Join-Path $tools 'Restaurar-Pastas-Harmony.ps1'
$base = Join-Path ([IO.Path]::GetTempPath()) ('harmony-folders-' + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $base | Out-Null
function Assert($condition,[string]$message) { if (-not $condition) { throw $message } }
function New-Folder([string]$path) { New-Item -ItemType Directory -Path $path -Force | Out-Null }
try {
    $root = Join-Path $base '010-Entrega Bolsa de Proposiçoes'
    $deep = Join-Path $root '013-Ordem do Dia/002-Meditação & Reflexão!'
    New-Folder $deep
    New-Folder (Join-Path $root 'Pastas Certas')
    [IO.File]::WriteAllBytes((Join-Path $deep '03-Música! [original].mp3'),[byte[]]@(1,2,3,4,255))
    [IO.File]::WriteAllText((Join-Path $root '001-original.txt'),'do not rename files')
    $beforeHash = (Get-FileHash -LiteralPath (Join-Path $deep '03-Música! [original].mp3')).Hash
    $plan = @(& $rename -Root $root -NoPrompt)
    Assert ($plan.Count -eq 3) 'Expected root and two nested folders in the plan.'
    Assert (Test-Path -LiteralPath $root) 'Preview must not rename the root.'
    Assert (@(Get-ChildItem -LiteralPath $base -Filter '*.csv').Count -eq 0) 'Preview must not create reports.'
    $report = Join-Path $base 'rename.csv'
    & $rename -Root $root -Apply -NoPrompt -ReportPath $report
    $newRoot = Join-Path $base 'Entrega Bolsa de Proposicoes'
    $newDeep = Join-Path $newRoot 'Ordem do Dia/Meditacao Reflexao'
    Assert (Test-Path -LiteralPath $newDeep -PathType Container) 'Nested names were not normalized.'
    Assert ((Get-FileHash -LiteralPath (Join-Path $newDeep '03-Música! [original].mp3')).Hash -eq $beforeHash) 'Audio bytes changed.'
    Assert (Test-Path -LiteralPath (Join-Path $newRoot '001-original.txt')) 'File names must remain unchanged.'
    Assert (@(Get-ChildItem -LiteralPath $newRoot -Recurse -File).Count -eq 2) 'Files were created or deleted.'
    $rows = @(Import-Csv -LiteralPath $report)
    Assert ($rows.Count -eq 3) 'Report must list all completed renames.'
    $again = @(& $rename -Root $newRoot -NoPrompt)
    Assert ($again.Count -eq 0) 'Normalization must be idempotent.'
    & $restore -ReportPath $report -Apply -NoPrompt
    Assert (Test-Path -LiteralPath $deep) 'Undo did not restore the original nested paths.'
    Assert ((Get-FileHash -LiteralPath (Join-Path $deep '03-Música! [original].mp3')).Hash -eq $beforeHash) 'Undo changed audio bytes.'
    $collision = Join-Path $base 'colisoes'
    New-Folder (Join-Path $collision '001-Ação')
    New-Folder (Join-Path $collision '002-Acao')
    $failed = $false
    try { & $rename -Root $collision -Apply -NoPrompt -ReportPath (Join-Path $base 'collision.csv') } catch { $failed = $true }
    Assert $failed 'Ambiguous names must fail before applying.'
    Assert (Test-Path -LiteralPath (Join-Path $collision '001-Ação')) 'Collision changed the first folder.'
    Assert (Test-Path -LiteralPath (Join-Path $collision '002-Acao')) 'Collision changed the second folder.'
    Assert (-not (Test-Path -LiteralPath (Join-Path $base 'collision.csv'))) 'Collision must not start the job.'
    $numeric = Join-Path $base 'only-numeric'
    New-Folder (Join-Path $numeric '123-!!!')
    $failed = $false
    try { & $rename -Root $numeric -Apply -NoPrompt } catch { $failed = $true }
    Assert $failed 'Empty names must fail before applying.'
    $fileCollision = Join-Path $base 'file-collision'
    New-Folder (Join-Path $fileCollision '001-Alvo')
    [IO.File]::WriteAllText((Join-Path $fileCollision 'Alvo'),'must preserve')
    $failed = $false
    try { & $rename -Root $fileCollision -Apply -NoPrompt } catch { $failed = $true }
    Assert $failed 'An existing file must never be overwritten.'
    Assert ((Get-Content -LiteralPath (Join-Path $fileCollision 'Alvo') -Raw) -eq 'must preserve') 'An existing file was altered.'
    $notDirectory = Join-Path $base 'wrong.zip'
    [IO.File]::WriteAllText($notDirectory,'zip placeholder')
    $failed = $false
    try { & $rename -Root $notDirectory -NoPrompt } catch { $failed = $true }
    Assert $failed 'A ZIP cannot be used instead of a directory.'
    Write-Host 'Windows folder tools passed: preview, accents/numbers/punctuation, nested root renames, byte-identical files, CSV, undo, idempotence, duplicate/empty names, file collision and ZIP guards.'
} finally {
    Remove-Item -LiteralPath $base -Recurse -Force
}
