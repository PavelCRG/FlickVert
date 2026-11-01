$ErrorActionPreference = 'Stop'
$repo = 'PavelCRG/FlickVert'
$tag = 'v0.1.0'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $root
try {
  if ((git branch --show-current) -ne 'main') { throw 'Switch to the main branch before publishing.' }
  if ((git remote get-url origin) -ne "https://github.com/$repo.git") { throw 'The origin remote is not PavelCRG/FlickVert.' }
  git diff --cached --quiet
  if ($LASTEXITCODE -ne 0) { throw 'Unstage existing changes before publishing.' }
  foreach ($path in @('.signing/flickvert.key', '.signing/password.txt')) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required signing file is missing: $path" }
  }

  $authErrorPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    gh auth status
    if ($LASTEXITCODE -ne 0) {
      gh auth refresh --hostname github.com --scopes repo,workflow
      if ($LASTEXITCODE -ne 0) { gh auth login --hostname github.com --git-protocol https --web }
      if ($LASTEXITCODE -ne 0) { throw 'GitHub sign-in did not complete.' }
    }
    $account = gh api user --jq '.login'
    if ($LASTEXITCODE -ne 0 -or $account -ne 'PavelCRG') { throw 'Sign in to GitHub as PavelCRG.' }
  }
  finally { $ErrorActionPreference = $authErrorPreference }

  $remoteTag = git ls-remote --tags origin "refs/tags/$tag"
  if ($LASTEXITCODE -ne 0) { throw 'Could not check whether the release tag already exists on GitHub.' }
  if ($remoteTag) { throw "$tag already exists on GitHub; refusing to overwrite the release." }
  if (git tag --list $tag) {
    git tag -d $tag
    if ($LASTEXITCODE -ne 0) { throw "Could not remove the stale local $tag tag." }
  }

  Write-Host 'Checking the app before publishing...'
  npm test
  if ($LASTEXITCODE -ne 0) { throw 'Frontend tests failed.' }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
  cargo test --locked --manifest-path src-tauri/Cargo.toml
  if ($LASTEXITCODE -ne 0) { throw 'Rust tests failed.' }

  $config = Get-Content -Raw -LiteralPath 'src-tauri/tauri.conf.json' | ConvertFrom-Json
  $localKey = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String((Get-Content -Raw -LiteralPath '.signing/flickvert.key.pub').Trim())).Trim()
  $configuredKey = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($config.plugins.updater.pubkey)).Trim()
  if ($localKey -ne $configuredKey) { throw 'The updater key pair does not match tauri.conf.json.' }
  $checkDirectory = Join-Path $env:TEMP ('flickvert-signature-check-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $checkDirectory | Out-Null
  $checkFile = Join-Path $checkDirectory 'signature-check.bin'
  $previousKeyPath = $env:TAURI_SIGNING_PRIVATE_KEY_PATH
  $previousPassword = $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
  try {
    [System.IO.File]::WriteAllBytes($checkFile, [byte[]](1, 2, 3, 4))
    $env:TAURI_SIGNING_PRIVATE_KEY_PATH = (Resolve-Path '.signing/flickvert.key').Path
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = [System.IO.File]::ReadAllText((Resolve-Path '.signing/password.txt').Path).TrimEnd([char]13, [char]10)
    $version = $tag.Substring(1)
    npm run tauri -- signer sign $checkFile --app-version $version 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'The updater private key could not sign a test file.' }
    $signature = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([System.IO.File]::ReadAllText($checkFile + '.sig').Trim()))
    if (-not $signature.Contains('trusted comment:') -or -not $signature.Contains("version:$version")) { throw 'The updater signature does not bind the release version.' }
  }
  finally {
    $env:TAURI_SIGNING_PRIVATE_KEY_PATH = $previousKeyPath
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $previousPassword
    Remove-Item -LiteralPath $checkFile -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath ($checkFile + '.sig') -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $checkDirectory -Force -ErrorAction SilentlyContinue
  }

  Write-Host 'Configuring signed automatic updates...'
  foreach ($secret in @(
    @{ Name = 'TAURI_SIGNING_PRIVATE_KEY'; File = '.signing/flickvert.key' },
    @{ Name = 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD'; File = '.signing/password.txt' }
  )) {
    $start = [System.Diagnostics.ProcessStartInfo]::new()
    $start.FileName = (Get-Command gh).Source
    $start.Arguments = "secret set $($secret.Name) --repo $repo"
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = [System.Diagnostics.Process]::Start($start)
    $bytes = [System.IO.File]::ReadAllBytes((Join-Path $root $secret.File))
    $length = $bytes.Length
    while ($length -gt 0 -and ($bytes[$length - 1] -eq 10 -or $bytes[$length - 1] -eq 13)) { $length-- }
    $process.StandardInput.BaseStream.Write($bytes, 0, $length)
    $process.StandardInput.Close()
    $output = $process.StandardOutput.ReadToEnd()
    $errorText = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw "Could not set $($secret.Name). $output $errorText" }
    Write-Host $output.Trim()
  }

  $releaseFiles = @(
    '.github/workflows/desktop-build.yml', 'README.md', 'README.ru.md', 'README.zh-CN.md',
    'package.json', 'package-lock.json',
    'scripts/create-update-manifest.mjs', 'scripts/create-update-manifest.test.mjs',
    'scripts/sync-release-version.mjs', 'scripts/sync-release-version.test.mjs', 'scripts/publish-v0.1.0.ps1',
    'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'src-tauri/tauri.conf.json',
    'src-tauri/src/files.rs', 'src-tauri/src/input.rs', 'src-tauri/src/main.rs', 'src-tauri/src/operations.rs',
    'src/App.tsx', 'src/i18n.ts', 'src/i18n.test.ts', 'src/main.tsx',
    'src/quick-menu/QuickMenu.tsx', 'src/quick-menu/quick-menu.css',
    'src/settings.test.ts', 'src/settings.ts', 'src/style.css'
  )
  $unexpected = @(git diff --name-only | Where-Object { $_ -notin $releaseFiles })
  if ($unexpected.Count) { throw "Review these changed files before publishing: $($unexpected -join ', ')" }
  git add -- $releaseFiles
  if ($LASTEXITCODE -ne 0) { throw 'Could not stage the release files.' }
  git diff --cached --check
  if ($LASTEXITCODE -ne 0) { throw 'The staged release contains whitespace errors.' }
  git commit -m 'Release FlickVert v0.1.0'
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the release commit.' }
  git tag -a $tag -m 'FlickVert v0.1.0'
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the release tag.' }

  Write-Host 'Pushing source and starting Windows/macOS release builds...'
  git push origin main
  if ($LASTEXITCODE -ne 0) { throw 'Could not push main.' }
  git push origin $tag
  if ($LASTEXITCODE -ne 0) { throw 'Could not push the release tag.' }

  $runId = ''
  for ($attempt = 0; $attempt -lt 24 -and -not $runId; $attempt++) {
    $runId = gh run list --repo $repo --workflow desktop-build.yml --branch $tag --limit 1 --json databaseId --jq '.[0].databaseId // empty'
    if ($LASTEXITCODE -ne 0) { throw 'Could not find the GitHub Actions release run.' }
    if (-not $runId) { Start-Sleep -Seconds 5 }
  }
  if (-not $runId) { throw "Release workflow did not start. Check https://github.com/$repo/actions." }
  gh run watch $runId --repo $repo --exit-status
  if ($LASTEXITCODE -ne 0) { throw "Release build failed. Check https://github.com/$repo/actions/runs/$runId." }

  $assetNames = @(gh release view $tag --repo $repo --json assets --jq '.assets[].name')
  if ($LASTEXITCODE -ne 0) { throw 'The release was not published.' }
  $requiredAssets = @(
    'FlickVert-Windows-x64-Setup.exe', 'FlickVert-Windows-x64-Setup.msi', 'FlickVert-Windows-x64-Portable.zip',
    'FlickVert-macOS-Intel.dmg', 'FlickVert-macOS-Apple-Silicon.dmg', 'latest.json', 'SHA256SUMS.txt'
  )
  $missing = @($requiredAssets | Where-Object { $_ -notin $assetNames })
  if ($missing.Count) { throw "Release is missing: $($missing -join ', ')" }
  Write-Host "Release is ready: https://github.com/$repo/releases/tag/$tag"
  Write-Host "Download for Windows: https://github.com/$repo/releases/latest/download/FlickVert-Windows-x64-Setup.exe"
  Write-Host "Download for macOS: https://github.com/$repo/releases/latest/download/FlickVert-macOS-Apple-Silicon.dmg"
}
finally {
  Pop-Location
}
