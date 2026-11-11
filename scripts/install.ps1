$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') {
  throw 'The FlickVert installer command supports Windows only.'
}

$headers = @{
  Accept = 'application/vnd.github+json'
  'User-Agent' = 'FlickVert-Installer'
}
$release = Invoke-RestMethod -UseBasicParsing -Headers $headers -TimeoutSec 30 -Uri 'https://api.github.com/repos/PavelCRG/FlickVert/releases/latest'
if ($release.draft -or $release.prerelease -or $release.tag_name -notmatch '^v\d+\.\d+\.\d+$') {
  throw 'GitHub did not return a stable FlickVert release.'
}

$assets = @($release.assets | ForEach-Object { $_.name })
if (@($assets | Where-Object { $_ -eq 'FlickVert-Windows-x64-Setup.exe' }).Count -ne 1 -or @($assets | Where-Object { $_ -eq 'SHA256SUMS.txt' }).Count -ne 1) {
  throw 'The latest FlickVert release is missing its installer or checksum file.'
}

$temporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) ('FlickVert-Install-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null
$installerPath = Join-Path $temporaryDirectory 'FlickVert-Windows-x64-Setup.exe'

try {
  $releaseUrl = 'https://github.com/PavelCRG/FlickVert/releases/download/' + $release.tag_name
  Invoke-WebRequest -UseBasicParsing -TimeoutSec 120 -Uri ($releaseUrl + '/FlickVert-Windows-x64-Setup.exe') -OutFile $installerPath
  $checksumResponse = Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 -Uri ($releaseUrl + '/SHA256SUMS.txt')
  $checksums = if ($checksumResponse.Content -is [byte[]]) {
    [Text.Encoding]::UTF8.GetString($checksumResponse.Content)
  } else {
    [string]$checksumResponse.Content
  }
  $match = [regex]::Match($checksums, '(?m)^([0-9a-fA-F]{64})\s+\*?FlickVert-Windows-x64-Setup\.exe\s*$')
  if (-not $match.Success) { throw 'The release checksum file does not contain the Setup checksum.' }

  $actualHash = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash
  if ($actualHash -ne $match.Groups[1].Value) { throw 'Setup SHA-256 verification failed; the installer will not be opened.' }

  $process = Start-Process -FilePath $installerPath -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "The FlickVert installer exited with code $($process.ExitCode)." }
}
finally {
  if (Test-Path -LiteralPath $installerPath) { Remove-Item -LiteralPath $installerPath -Force }
  Remove-Item -LiteralPath $temporaryDirectory -Force -ErrorAction SilentlyContinue
}
