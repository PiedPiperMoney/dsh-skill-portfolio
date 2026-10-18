// Copies a working copy of the skill into assets/portfolio. Intended for the
// maintainer before a release. Default source: the open portfolio-skill repository cloned next to this one.
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const sourceArg = process.argv[2] ?? join(root, '..', 'portfolio-skill', 'skills', 'portfolio')
const source = resolve(sourceArg)
const destination = join(root, 'assets', 'portfolio')

if (source === resolve(destination)) {
  console.error('Source and destination are the same folder; nothing to do.')
  process.exit(1)
}
for (const required of ['SKILL.md', 'engine/build.mjs', 'dashboard/index.html']) {
  if (!existsSync(join(source, required))) {
    console.error(`Not a portfolio skill folder: ${join(source, required)} is missing`)
    process.exit(1)
  }
}

rmSync(destination, { recursive: true, force: true })
cpSync(source, destination, { recursive: true })
const count = readdirSync(destination, { recursive: true }).length
console.log(`copied ${source} -> ${destination} (${count} entries)`)
console.log('next: npm test && node scripts/release.mjs patch')
