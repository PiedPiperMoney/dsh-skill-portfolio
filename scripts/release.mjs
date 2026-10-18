// Bumps the version, runs every check, packs the tarball, and prints the two
// publish commands. It never publishes by itself: that needs credentials and a
// deliberate decision.
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const manifestPath = join(root, 'package.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const requested = process.argv[2]

function bump(version, part) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(version)
  if (match === null) throw new Error(`Unsupported current version: ${version}`)
  let [, major, minor, patch] = match.map(Number)
  if (part === 'major') return `${major + 1}.0.0`
  if (part === 'minor') return `${major}.${minor + 1}.0`
  if (part === 'patch') return `${major}.${minor}.${patch + 1}`
  throw new Error(`Unknown bump: ${part}`)
}

function nextVersion() {
  if (requested === undefined) throw new Error('Usage: node scripts/release.mjs <patch|minor|major|x.y.z>')
  if (/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(requested)) return requested
  return bump(manifest.version, requested)
}

const version = nextVersion()
if (version === manifest.version) throw new Error(`Version is already ${version}`)

manifest.version = version
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`version: ${version}\n`)

for (const [command, args] of [
  ['npm', ['test']],
  ['npm', ['pack']],
]) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) {
    console.error(`\n${command} ${args.join(' ')} failed; the version bump is kept for a retry`)
    process.exit(result.status ?? 1)
  }
}

console.log(`
Next:
  1. Add a CHANGELOG.md entry for ${version}.
  2. npm publish          (or: npm publish --access public)
  3. git add -A && git commit -m "v${version}" && git tag v${version} && git push --follow-tags
`)
