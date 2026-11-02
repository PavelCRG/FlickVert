import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { syncReleaseVersion } from './sync-release-version.mjs'

test('syncs a patch tag across app metadata without changing dependency versions', async (t) => {
  const temporaryRoot = resolve(tmpdir())
  const root = await mkdtemp(join(temporaryRoot, 'flickvert-version-'))
  t.after(async () => {
    if (dirname(resolve(root)) !== temporaryRoot) throw new Error('Unexpected temporary directory')
    await rm(root, { recursive: true, force: true })
  })
  await mkdir(join(root, 'src-tauri'))
  await mkdir(join(root, 'src'))
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '0.1.0' }))
  await writeFile(join(root, 'package-lock.json'), JSON.stringify({ version: '0.1.0', packages: { '': { version: '0.1.0' }, 'node_modules/example': { version: '9.8.7' } } }))
  await writeFile(join(root, 'src-tauri/Cargo.toml'), '[package]\nname = "flickvert"\nversion = "0.1.0"\n')
  await writeFile(join(root, 'src-tauri/Cargo.lock'), '[[package]]\nname = "flickvert"\nversion = "0.1.0"\n\n[[package]]\nname = "example"\nversion = "9.8.7"\n')
  await writeFile(join(root, 'src-tauri/tauri.conf.json'), JSON.stringify({ version: '0.1.0' }))
  await writeFile(join(root, 'src/App.tsx'), '<div className="version">FlickVert <span>0.1.0</span></div>')
  await writeFile(join(root, 'README.md'), 'Current release: `0.1.0`.')
  await writeFile(join(root, 'README.ru.md'), 'Текущий релиз — `0.1.0`.')
  await writeFile(join(root, 'README.zh-CN.md'), '当前版本为 `0.1.0`。')

  await syncReleaseVersion(root, 'v0.1.1')

  assert.equal(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version, '0.1.1')
  const npmLock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'))
  assert.equal(npmLock.packages[''].version, '0.1.1')
  assert.equal(npmLock.packages['node_modules/example'].version, '9.8.7')
  assert.match(await readFile(join(root, 'src-tauri/Cargo.toml'), 'utf8'), /version = "0\.1\.1"/)
  assert.match(await readFile(join(root, 'src-tauri/Cargo.lock'), 'utf8'), /name = "flickvert"\nversion = "0\.1\.1"/)
  assert.equal(JSON.parse(await readFile(join(root, 'src-tauri/tauri.conf.json'), 'utf8')).version, '0.1.1')
  assert.equal(await readFile(join(root, 'src/App.tsx'), 'utf8'), '<div className="version">FlickVert <span>0.1.1</span></div>')
  assert.equal(await readFile(join(root, 'README.md'), 'utf8'), 'Current release: `0.1.1`.')
  assert.equal(await readFile(join(root, 'README.ru.md'), 'utf8'), 'Текущий релиз — `0.1.1`.')
  assert.equal(await readFile(join(root, 'README.zh-CN.md'), 'utf8'), '当前版本为 `0.1.1`。')
})

test('rejects tags that are not stable vMAJOR.MINOR.PATCH releases', async () => {
  await assert.rejects(() => syncReleaseVersion(process.cwd(), '0.1.1'), /Expected a stable release tag like v0\.1\.1/)
  await assert.rejects(() => syncReleaseVersion(process.cwd(), 'v0.1.1-rc.1'), /Expected a stable release tag like v0\.1\.1/)
})
