// Runs the packaged skill's own offline checks against a throwaway copy of the
// dashboard, so a broken or incomplete asset set fails before publishing.
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const assets = join(root, 'assets', 'portfolio')
const major = Number(process.versions.node.split('.')[0])
if (!Number.isFinite(major) || major < 18) {
  console.error(`Node.js 18 or newer is required, found ${process.versions.node}`)
  process.exit(1)
}

const work = mkdtempSync(join(tmpdir(), 'dsh-portfolio-check-'))
try {
  const dashboard = join(work, 'dashboard')
  cpSync(join(assets, 'dashboard'), dashboard, { recursive: true })
  const result = spawnSync(process.execPath, [join(assets, 'tests', 'run.mjs'), '--dashboard', dashboard], {
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    console.error(`\nPackaged skill checks failed with exit code ${result.status}`)
    process.exitCode = result.status ?? 1
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
