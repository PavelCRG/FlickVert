# Verify a FlickVert download

Download release files only from [FlickVert on GitHub](https://github.com/PavelCRG/FlickVert/releases). Each release includes SHA-256 checksums. Releases produced after build attestations are enabled also include GitHub provenance attestations for the Setup EXE, MSI, and portable ZIP.

## Check the file hash

In PowerShell, run this from the folder containing the downloaded installer and `SHA256SUMS.txt`:

~~~powershell
$file = '.\FlickVert-Windows-x64-Setup.exe'
$line = Get-Content '.\SHA256SUMS.txt' | Where-Object { $_ -match '\s+FlickVert-Windows-x64-Setup\.exe$' }
if (-not $line) { throw 'The installer is missing from SHA256SUMS.txt.' }
$expected = ($line -split '\s+')[0]
$actual = (Get-FileHash $file -Algorithm SHA256).Hash
if ($actual -ne $expected) { throw 'The installer hash does not match the release.' }
'Installer hash matches the release.'
~~~

Use the matching filename in the checksum file to verify the MSI or portable ZIP.

## Verify where the file was built

Install the [GitHub CLI](https://cli.github.com/) and verify the downloaded release artifact:

~~~powershell
gh attestation verify .\FlickVert-Windows-x64-Setup.exe --repo PavelCRG/FlickVert
~~~

Repeat for the MSI or portable ZIP. A valid attestation links the file to this public repository and its GitHub Actions release workflow. Releases published before attestations were added do not have them.

## What these checks establish

The hash detects a file that differs from the published release. The attestation verifies the repository and workflow that produced the release. Neither is an antivirus scan or a guarantee that software is harmless.

The Windows installer and app are not currently signed with an Authenticode publisher certificate. The separate updater signature protects in-app update packages and does not sign the downloaded installer for Windows SmartScreen. A valid Authenticode signature can identify the publisher, but SmartScreen may still warn until reputation builds. Do not bypass a warning if the download source or file hash cannot be verified.
