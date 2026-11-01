import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function createUpdateManifest(root = process.cwd(), tag = process.env.GITHUB_REF_NAME) {
  const config = JSON.parse(await readFile(join(root, 'src-tauri/tauri.conf.json'), 'utf8'))
  if (tag !== `v${config.version}`) throw new Error('Release tag must match the Tauri app version')

  const base = `https://github.com/PavelCRG/FlickVert/releases/download/${encodeURIComponent(tag)}`
  const artifacts = {
    'windows-x86_64-nsis': 'FlickVert-Windows-x64-Setup.exe',
    'windows-x86_64-msi': 'FlickVert-Windows-x64-Setup.msi',
    'darwin-x86_64': 'FlickVert-macOS-Intel.app.tar.gz',
    'darwin-aarch64': 'FlickVert-macOS-Apple-Silicon.app.tar.gz',
  }
  const platforms = Object.fromEntries(await Promise.all(Object.entries(artifacts).map(async ([platform, file]) => {
    const signature = (await readFile(join(root, 'release-assets', `${file}.sig`), 'utf8')).trim()
    if (!signature) throw new Error(`Missing signature for ${file}`)
    return [platform, { url: `${base}/${file}`, signature }]
  })))
  await writeFile(join(root, 'release-assets/latest.json'), `${JSON.stringify({ version: config.version, pub_date: new Date().toISOString(), platforms }, null, 2)}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await createUpdateManifest()
