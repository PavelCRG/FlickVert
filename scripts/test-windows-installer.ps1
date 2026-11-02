param([Parameter(Mandatory)][string]$Installer, [string]$PreviousInstaller)
$ErrorActionPreference = 'Stop'
$uninstallRoot = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
$findApp = {
  Get-ChildItem $uninstallRoot -ErrorAction SilentlyContinue |
    ForEach-Object { Get-ItemProperty $_.PSPath } |
    Where-Object DisplayName -EQ 'FlickVert'
}
$getUninstaller = {
  param($entry)
  $match = [regex]::Match($entry.UninstallString, '^\s*"([^"]+)"')
  if (-not $match.Success) { throw "Uninstaller path is not safely quoted: $($entry.UninstallString)" }
  $match.Groups[1].Value
}
if (& $findApp) { throw 'The Windows installer test expects a clean runner.' }
$appData = Join-Path $env:APPDATA 'app.flickvert.desktop.v2'
$userFile = Join-Path $appData 'installer-test-sentinel'
$selectedFile = Join-Path $env:TEMP 'flickvert-installer-selected-file.txt'
if (Test-Path -LiteralPath $appData) { throw 'The installer test refuses to touch existing FlickVert user data.' }
if (Test-Path -LiteralPath $selectedFile) { throw 'The installer test refuses to overwrite an existing selected-file fixture.' }
try {
  New-Item -ItemType Directory -Path $appData -Force | Out-Null
  Set-Content -LiteralPath $userFile -Value 'keep'
  Set-Content -LiteralPath $selectedFile -Value 'keep'
  $installers = if ($PreviousInstaller) { @($PreviousInstaller, $Installer, $Installer) } else { @($Installer, $Installer) }
  foreach ($attempt in 0..($installers.Count - 1)) {
    $process = Start-Process -FilePath $installers[$attempt] -ArgumentList '/S' -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Silent install attempt $attempt failed with exit code $($process.ExitCode)." }
    $entries = @(& $findApp)
    if ($entries.Count -ne 1) { throw "Expected one FlickVert install entry after attempt $attempt; found $($entries.Count)." }
    $uninstaller = & $getUninstaller $entries[0]
    if ($attempt -eq 0) { $firstUninstaller = $uninstaller }
    elseif ($uninstaller -ne $firstUninstaller) { throw 'Update or reinstall registered a second installation path.' }
  }
  $installed = @(& $findApp)
  if ($installed.Count -ne 1) { throw "Expected one FlickVert install entry after reinstall; found $($installed.Count)." }
  $uninstaller = & $getUninstaller $installed[0]
  if (-not (Test-Path -LiteralPath $uninstaller)) { throw 'The installer did not register a valid uninstaller.' }
  $process = Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "Silent uninstall failed with exit code $($process.ExitCode)." }
  if (& $findApp) { throw 'FlickVert remained registered after uninstall.' }
  if (-not (Test-Path -LiteralPath $userFile) -or -not (Test-Path -LiteralPath $selectedFile)) {
    throw 'Uninstall removed user data or a selected document.'
  }
  if ((Get-Content -Raw -LiteralPath $userFile).Trim() -ne 'keep' -or (Get-Content -Raw -LiteralPath $selectedFile).Trim() -ne 'keep') {
    throw 'Uninstall changed user data or a selected document.'
  }
}
finally {
  Remove-Item -LiteralPath $userFile -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $appData -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $selectedFile -Force -ErrorAction SilentlyContinue
}
