import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, 'dist')
const source = await readFile(resolve(root, 'index.html'), 'utf8')
const script = '<script type="module" src="/src/main.tsx"></script>'

if (!source.includes(script)) throw new Error('index.html is missing the frontend entry script')

await mkdir(output, { recursive: true })
await cp(resolve(root, 'public'), output, { recursive: true })
await writeFile(
  resolve(output, 'index.html'),
  source
    .replace(script, '<script type="module" src="/assets/main.js"></script>')
    .replace('</head>', '    <link rel="stylesheet" href="/assets/main.css" />\n  </head>'),
)
