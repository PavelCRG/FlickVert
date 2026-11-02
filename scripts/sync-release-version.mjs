import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const stableTag = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export async function syncReleaseVersion(root, tag) {
  const match = stableTag.exec(tag ?? '')
  if (!match) throw new Error('Expected a stable release tag like v0.1.1')
  const version = match.slice(1).join('.')
  const read = (path) => readFile(join(root, path), 'utf8')
  const write = (path, value) => writeFile(join(root, path), value)

  const packageJson = JSON.parse(await read('package.json'))
  const packageLock = JSON.parse(await read('package-lock.json'))
  const tauriConfig = JSON.parse(await read('src-tauri/tauri.conf.json'))
  const cargoToml = await read('src-tauri/Cargo.toml')
  const cargoLock = await read('src-tauri/Cargo.lock')
  const app = await read('src/App.tsx')
  const readmePaths = ['README.md', 'README.ru.md', 'README.zh-CN.md']
  const readmes = await Promise.all(readmePaths.map(read))
  const cargoPackage = /(\[package\][\s\S]*?\r?\nname = "flickvert"\r?\nversion = ")[^"]+(\")/
  const cargoLockPackage = /(\[\[package\]\]\r?\nname = "flickvert"\r?\nversion = ")[^"]+(\")/
  const appVersion = /(<div className="version">FlickVert <span>)[^<]+(<\/span><\/div>)/
  const readmeVersions = [/Current release: `[^`]+`\./, /Текущий релиз — `[^`]+`\./, /当前版本为 `[^`]+`。/]
  if (!packageLock.packages?.[''] || !cargoPackage.test(cargoToml) || !cargoLockPackage.test(cargoLock) || !appVersion.test(app) || readmes.some((readme, index) => !readmeVersions[index].test(readme))) {
    throw new Error('Could not find every FlickVert version field')
  }

  packageJson.version = version
  packageLock.version = version
  packageLock.packages[''].version = version
  tauriConfig.version = version
  await Promise.all([
    write('package.json', `${JSON.stringify(packageJson, null, 2)}\n`),
    write('package-lock.json', `${JSON.stringify(packageLock, null, 2)}\n`),
    write('src-tauri/Cargo.toml', cargoToml.replace(cargoPackage, `$1${version}$2`)),
    write('src-tauri/Cargo.lock', cargoLock.replace(cargoLockPackage, `$1${version}$2`)),
    write('src-tauri/tauri.conf.json', `${JSON.stringify(tauriConfig, null, 2)}\n`),
    write('src/App.tsx', app.replace(appVersion, `$1${version}$2`)),
    ...readmes.map((readme, index) => write(readmePaths[index], readme.replace(readmeVersions[index], (match) => match.replace(/`[^`]+`/, '`' + version + '`')))),
  ])
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await syncReleaseVersion(process.cwd(), process.argv[2])
}
