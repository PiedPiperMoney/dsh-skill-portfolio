import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply } from '../lib/index.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const assets = join(root, 'assets', 'portfolio')

function withTempHome(fn) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-portfolio-test-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    return fn(home)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    rmSync(home, { recursive: true, force: true })
  }
}

async function main() {
  // Activation registers exactly one provider with one candidate.
  const providers = []
  await withTempHome(() => {
    apply({ skills: { registerProvider: (factory) => providers.push(factory()) } })
  })
  assert.equal(providers.length, 1, 'one provider registered')
  assert.equal(providers[0].name, 'dsh-portfolio')

  const candidates = await providers[0].list()
  assert.equal(candidates.length, 1)
  const candidate = candidates[0]
  assert.equal(candidate.name, 'portfolio')
  assert.equal(candidate.provider, 'dsh-portfolio')
  assert.equal(candidate.source, 'bundled')
  assert.equal(candidate.rank, 600)
  assert.deepEqual(candidate.invocation, { modelInvocable: true, userInvocable: true })
  assert.match(candidate.description, /портфел/iu)
  assert.match(candidate.whenToUse, /дашборд/iu)
  assert.equal(candidate.resourceBase.kind, 'directory')
  assert.equal(resolve(candidate.resourceBase.path), resolve(assets))
  assert.equal(existsSync(candidate.locator), true, 'SKILL.md exists')

  const definition = await providers[0].get(candidate, {})
  assert.equal(definition.name, 'portfolio')
  assert.equal(definition.provider, 'dsh-portfolio')
  assert.match(definition.content, /^# Портфель:/u)
  assert.equal(definition.content.startsWith('---'), false, 'frontmatter is stripped')
  assert.doesNotMatch(definition.content, /^name: portfolio$/mu)

  // Everything the instructions point at must ship with the package.
  const required = [
    'SKILL.md',
    'references/настройка.md',
    'references/обновление.md',
    'references/доработка.md',
    'engine/build.mjs',
    'engine/shortcut.mjs',
    'dashboard/index.html',
    'dashboard/styles.css',
    'dashboard/ПРАВИЛА.md',
    'dashboard/js/benchmark.js',
    'dashboard/js/live.js',
    'dashboard/js/core.js',
    'dashboard/custom.js',
    'dashboard/custom.css',
    'sample/шаблон-операций.csv',
    'sample/snowball-sample.csv',
    'sample/settings.sample.json',
    'tests/run.mjs',
  ]
  for (const file of required) assert.equal(existsSync(join(assets, file)), true, `asset ${file}`)

  // The bundle manifest and the row that mounts this package.
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert.equal(manifest.dsh.manifestVersion, 1)
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.main, 'lib/index.js')
  assert.equal(manifest.exports['.'], './lib/index.js')
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
  assert.match(patch, /name: 'dsh-skill-portfolio'/u)

  // A hand-installed copy would shadow the plugin; activation must say so.
  await withTempHome((home) => {
    mkdirSync(join(home, 'skills', 'portfolio'), { recursive: true })
    writeFileSync(join(home, 'skills', 'portfolio', 'SKILL.md'), '---\nname: portfolio\ndescription: x\n---\n')
    const warnings = []
    const original = console.warn
    console.warn = (...args) => warnings.push(args.join(' '))
    try {
      apply({ skills: { registerProvider: () => {} } })
    } finally {
      console.warn = original
    }
    assert.equal(warnings.length, 1, 'one shadowing warning')
    assert.match(warnings[0], /local copy/u)
    assert.match(warnings[0], /skills\/portfolio/u)
  })

  console.log('OK   provider.test: package, candidate, resources and warning verified')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
