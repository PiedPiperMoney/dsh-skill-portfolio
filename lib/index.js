// DSH plugin: exposes the portfolio skill from this package's assets.
//
// The skill itself is plain files (SKILL.md, engine/, dashboard/, tests/).
// This module only registers it with the skill registry, so the skill keeps
// working exactly as a manually installed copy under ~/.dsh/skills/portfolio.
import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Matches BUNDLED_SKILL_RANK in @deepseek-ai/dsh-skill. Kept local so the
// plugin has no host-package imports and cannot break on a DSH upgrade.
const BUNDLED_SKILL_RANK = 600

const PROVIDER = 'dsh-portfolio'
const SKILL_NAME = 'portfolio'

/** Cordis plugin identity. */
export const name = 'skill-portfolio'

/** The skill registry is required before this plugin can activate. */
export const inject = ['skills']

const SKILL_PATH = fileURLToPath(new URL('../assets/portfolio/SKILL.md', import.meta.url))
const SKILL_DIR = fileURLToPath(new URL('../assets/portfolio/', import.meta.url))

function unquote(value) {
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) return value.slice(1, -1)
  }
  return value
}

/**
 * Read the small YAML frontmatter used by SKILL.md: plain or quoted scalars and
 * `|` / `>` block scalars. Deliberately avoids a YAML dependency.
 */
function parseFrontmatter(block) {
  const result = {}
  const lines = block.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (line === '' || line.startsWith('#') || /^\s/u.test(line)) continue
    const colon = line.indexOf(':')
    if (colon < 1) continue
    const key = line.slice(0, colon).trim()
    let value = line.slice(colon + 1).trim()
    if (/^[|>][+-]?$/u.test(value)) {
      const folded = value.startsWith('>')
      const parts = []
      while (i + 1 < lines.length && (lines[i + 1] === '' || /^\s/u.test(lines[i + 1]))) {
        i += 1
        parts.push(lines[i].replace(/^\s{2}/u, ''))
      }
      const joined = parts.join('\n').trim()
      value = folded ? joined.replace(/\s*\n\s*/gu, ' ').trim() : joined
    } else {
      value = unquote(value)
    }
    result[key] = value
  }
  return result
}

function parseSkill(raw, path) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (match === null) throw new Error(`dsh-skill-portfolio: ${path} has no YAML frontmatter`)
  const meta = parseFrontmatter(match[1])
  const description = meta.description
  if (typeof description !== 'string' || description.length === 0) {
    throw new Error(`dsh-skill-portfolio: ${path} has no description`)
  }
  const whenToUse = typeof meta.whenToUse === 'string' && meta.whenToUse.length > 0 ? meta.whenToUse : undefined
  return { description, whenToUse, content: raw.slice(match[0].length).trim() }
}

/** Warn when a hand-installed copy would shadow this plugin (user skills rank above bundled). */
function warnAboutShadowingCopy() {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  const legacy = join(home, 'skills', 'portfolio')
  if (!existsSync(join(legacy, 'SKILL.md'))) return
  console.warn(
    `dsh-skill-portfolio: found a local copy at ${legacy}. User skills take precedence over bundled ones, ` +
      'so the plugin version will be ignored. Remove that folder to use the versioned plugin skill.',
  )
}

/**
 * Register the portfolio skill with resources readable from the package.
 * @param ctx - Context carrying the skill registry.
 */
export function apply(ctx) {
  let raw
  try {
    raw = readFileSync(SKILL_PATH, 'utf8')
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`dsh-skill-portfolio: cannot read ${SKILL_PATH}: ${reason}`)
  }
  const { description, whenToUse } = parseSkill(raw, SKILL_PATH)

  warnAboutShadowingCopy()

  const candidate = {
    name: SKILL_NAME,
    description,
    ...(whenToUse === undefined ? {} : { whenToUse }),
    invocation: { modelInvocable: true, userInvocable: true },
    provider: PROVIDER,
    source: 'bundled',
    rank: BUNDLED_SKILL_RANK,
    resourceBase: { kind: 'directory', path: SKILL_DIR },
    locator: SKILL_PATH,
  }

  const provider = {
    name: PROVIDER,
    list: () => Promise.resolve([candidate]),
    async get(selected, options) {
      const { rank: _rank, locator, ...summary } = selected
      const raw = await readFile(locator, { encoding: 'utf8', signal: options.signal })
      const parsed = parseSkill(raw, locator)
      return { ...summary, content: parsed.content }
    },
  }

  ctx.skills.registerProvider(() => provider)
}
