import { readFile, writeFile } from 'node:fs/promises'

const config = JSON.parse(await readFile('src-tauri/tauri.conf.json', 'utf8'))
const tag = process.env.GITHUB_REF_NAME
if (tag !== `v${config.version}`) throw new Error('Release tag must match the Tauri app version')

const base = `https://github.com/PavelCRG/FlickVert/releases/download/${encodeURIComponent(tag)}`
const artifacts = {
  'windows-x86_64-nsis': 'FlickVert-Windows-x64-Setup.exe',
  'windows-x86_64-msi': 'FlickVert-Windows-x64-Setup.msi',
  'darwin-x86_64': 'FlickVert-macOS-Intel.app.tar.gz',
  'darwin-aarch64': 'FlickVert-macOS-Apple-Silicon.app.tar.gz',
}
const platforms = Object.fromEntries(await Promise.all(Object.entries(artifacts).map(async ([platform, file]) => {
  const signature = (await readFile(`release-assets/${file}.sig`, 'utf8')).trim()
  if (!signature) throw new Error(`Missing signature for ${file}`)
  return [platform, { url: `${base}/${file}`, signature }]
})))
await writeFile('release-assets/latest.json', `${JSON.stringify({ version: config.version, pub_date: new Date().toISOString(), platforms }, null, 2)}\n`)
