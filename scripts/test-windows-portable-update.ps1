param([Parameter(Mandatory)][string]$Updater)
$ErrorActionPreference = 'Stop'
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
$directory = Join-Path $tempRoot "FlickVert-portable-update-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $directory | Out-Null
try {
  $oldSource = Join-Path $directory 'old.rs'
  $newSource = Join-Path $directory 'new.rs'
  [IO.File]::WriteAllText($oldSource, 'fn main() { std::fs::write("launched.txt", "old").unwrap(); }')
  [IO.File]::WriteAllText($newSource, 'fn main() { std::fs::write("launched.txt", "new").unwrap(); }')
  rustc $oldSource -o (Join-Path $directory 'FlickVert.exe')
  if ($LASTEXITCODE -ne 0) { throw 'Could not build the old portable test app.' }
  $pidValue = [uint32]4294967295
  $staged = Join-Path $directory "FlickVert-$pidValue-$([guid]::NewGuid().ToString('N')).update.exe"
  rustc $newSource -o $staged
  if ($LASTEXITCODE -ne 0) { throw 'Could not build the updated portable test app.' }
  Copy-Item -LiteralPath $Updater -Destination (Join-Path $directory 'FlickVertUpdater.exe')
  Set-Content -LiteralPath (Join-Path $directory 'keep.txt') -Value 'preserve' -NoNewline
  $arguments = "$pidValue `"$directory`" `"$staged`""
  $process = Start-Process -FilePath (Join-Path $directory 'FlickVertUpdater.exe') -ArgumentList $arguments -PassThru -NoNewWindow -Wait
  if ($process.ExitCode -ne 0) { throw "Portable updater failed with exit code $($process.ExitCode)." }
  if ((Get-Content -LiteralPath (Join-Path $directory 'launched.txt') -Raw) -ne 'new') { throw 'Updated app did not launch.' }
  if ((Get-Content -LiteralPath (Join-Path $directory 'keep.txt') -Raw) -ne 'preserve') { throw 'Unrelated files changed during update.' }
  if (Test-Path -LiteralPath $staged) { throw 'Staged executable was not consumed.' }
}
finally {
  $resolved = [IO.Path]::GetFullPath($directory)
  if ([IO.Path]::GetDirectoryName($resolved).TrimEnd('\') -ne $tempRoot) { throw 'Refusing to remove a test folder outside the temporary directory.' }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
