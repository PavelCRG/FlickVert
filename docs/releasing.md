# Releasing FlickVert

The Desktop builds workflow tests every push and pull request. Pushing a version tag builds the Windows installer, MSI, and portable ZIP, creates checksums, and publishes a GitHub Release.

## Prepare a release

1. Make sure the release changes are on main and npm run check passes.
2. Add a version section to the top of CHANGELOG.md and run the version sync command with the next stable tag:

   ~~~sh
   npm run version:sync -- v0.1.11
   ~~~

   Replace the example with the actual next version. The script updates the versions in package.json, the npm lockfile, Cargo files, Tauri config, and the app's About screens.

3. Run npm run check again, commit the version and changelog update, and push main.
4. Create and push an annotated tag on that commit:

   ~~~sh
   git tag -a v0.1.11 -m "Release v0.1.11"
   git push origin v0.1.11
   ~~~

5. Watch the **Desktop builds** workflow. It runs the checks, builds Windows packages, verifies install/upgrade behavior (including a custom install directory), and publishes the release with SHA-256 checksums and GitHub build attestations. The installer update artifacts are signed; see [release signing](release-signing.md).

Do not reuse or move an existing release tag. If a tag build needs to be retried, use **Actions → Desktop builds → Run workflow**, select the existing tag in the branch picker, and enter the same tag; the workflow checks that both values match before it rebuilds and republishes. For a new version, create a new tag after the fix has reached main.

## Before publishing

- Confirm the changelog and app version match the tag.
- Confirm the **Desktop builds** workflow completed successfully.
- Confirm the release page contains the EXE, MSI, portable ZIP, update signatures, and SHA-256SUMS.txt.
- Keep release signing credentials in GitHub Actions Secrets; never add them to the repository or an issue.
