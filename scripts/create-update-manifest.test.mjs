import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createUpdateManifest } from './create-update-manifest.mjs'

test('update manifest uses the matching release tag and signed platform artifacts', async (t) => {
  const temporaryRoot = resolve(tmpdir())
  const directory = await mkdtemp(join(temporaryRoot, 'flickvert-update-'))
  t.after(async () => {
    if (dirname(resolve(directory)) !== temporaryRoot) throw new Error('Unexpected temporary directory')
    await rm(directory, { recursive: true, force: true })
  })
  await mkdir(join(directory, 'src-tauri'))
  await mkdir(join(directory, 'release-assets'))
  await writeFile(join(directory, 'src-tauri', 'tauri.conf.json'), JSON.stringify({ version: '1.2.3' }))
  for (const name of ['FlickVert-Windows-x64-Setup.exe', 'FlickVert-Windows-x64-Setup.msi', 'FlickVert-macOS-Intel.app.tar.gz', 'FlickVert-macOS-Apple-Silicon.app.tar.gz']) {
    await writeFile(join(directory, 'release-assets', `${name}.sig`), `signature-${name}`)
  }
  await createUpdateManifest(directory, 'v1.2.3')
  const manifest = JSON.parse(await readFile(join(directory, 'release-assets', 'latest.json'), 'utf8'))
  assert.equal(manifest.version, '1.2.3')
  assert.equal(manifest.platforms['windows-x86_64-nsis'].signature, 'signature-FlickVert-Windows-x64-Setup.exe')
  assert.equal(manifest.platforms['windows-x86_64-msi'].signature, 'signature-FlickVert-Windows-x64-Setup.msi')
  assert.match(manifest.platforms['darwin-aarch64'].url, /\/v1\.2\.3\/FlickVert-macOS-Apple-Silicon\.app\.tar\.gz$/)
  await assert.rejects(() => createUpdateManifest(directory, 'v1.2.4'), /must match the Tauri app version/)
})
