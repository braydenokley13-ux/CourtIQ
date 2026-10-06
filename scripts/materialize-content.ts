import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { createContentManifest, validateContentManifest } from '@courtiq/basketball/content-manifest'

const output = fileURLToPath(new URL('../packages/basketball/src/content/generated/manifest.json', import.meta.url))
const manifest = createContentManifest()
validateContentManifest(manifest)
const rendered = `${JSON.stringify(manifest, null, 2)}\n`

if (process.argv.includes('--check')) {
  let existing: string
  try {
    existing = await readFile(output, 'utf8')
  } catch {
    throw new Error('Local basketball content is missing. Run pnpm content:materialize.')
  }
  if (existing !== rendered)
    throw new Error('Local basketball content is stale. Run pnpm content:materialize and commit the manifest.')
  console.log('Executable basketball content is valid and materialized.')
} else {
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, rendered, 'utf8')
  console.log('Materialized validated executable basketball content locally.')
}
