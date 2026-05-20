/**
 * Fetch all Pokémon TCG sets from Pokedata.
 * GET https://www.pokedata.io/v0/sets?language=ENGLISH|JAPANESE
 * API cost: 5 credits per request (one request per language fetched).
 *
 * Usage (repo root or server/):
 *   pnpm run fetch-pokedata-sets
 *   cd server && pnpm run fetch-pokedata-sets
 *   pnpm run fetch-pokedata-sets -- --language=JAPANESE
 *   pnpm run fetch-pokedata-sets -- --all-languages
 *
 * Requires POKEDATA_API_KEY in server/.env
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'

const POKEDATA_BASE = 'https://www.pokedata.io/v0/sets'

export type PokedataSetRow = {
  id: number
  name: string
  language: string
  code: string | null
  release_date: string
  tcg?: string
}

type LanguageFilter = 'ENGLISH' | 'JAPANESE'

function normalizeKey(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ')
}

function parseArgs(): { languages: LanguageFilter[] } {
  const args = process.argv.slice(2)
  if (args.includes('--all-languages')) {
    return { languages: ['ENGLISH', 'JAPANESE'] }
  }
  const langArg = args.find((a) => a.startsWith('--language='))
  if (langArg) {
    const lang = langArg.split('=')[1]?.toUpperCase()
    if (lang !== 'ENGLISH' && lang !== 'JAPANESE') {
      throw new Error('--language must be ENGLISH or JAPANESE')
    }
    return { languages: [lang as LanguageFilter] }
  }
  return { languages: ['ENGLISH'] }
}

async function fetchSets(apiKey: string, language: LanguageFilter): Promise<PokedataSetRow[]> {
  const url = `${POKEDATA_BASE}?language=${encodeURIComponent(language)}`
  console.log(`GET ${url} (5 credits)`)
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Pokedata sets ${language}: ${res.status} — ${text}`)
  }
  const data = JSON.parse(text) as unknown
  if (!Array.isArray(data)) {
    throw new Error(`Pokedata sets ${language}: expected JSON array, got ${typeof data}`)
  }
  return data as PokedataSetRow[]
}

async function main() {
  const apiKey = (process.env.POKEDATA_API_KEY || '').trim()
  if (!apiKey) {
    throw new Error('Set POKEDATA_API_KEY in server/.env')
  }

  const { languages } = parseArgs()
  const allSets: PokedataSetRow[] = []

  for (const language of languages) {
    const rows = await fetchSets(apiKey, language)
    console.log(`  ${language}: ${rows.length} sets`)
    allSets.push(...rows)
  }

  const nameToId: Record<string, number> = {}
  const codeToId: Record<string, number> = {}
  const byId: Record<string, PokedataSetRow> = {}

  for (const row of allSets) {
    const id = row.id
    byId[String(id)] = row
    const nameKey = normalizeKey(row.name)
    if (nameKey && nameToId[nameKey] == null) {
      nameToId[nameKey] = id
    }
    if (row.code && String(row.code).trim()) {
      const codeKey = String(row.code).trim().toLowerCase()
      if (codeToId[codeKey] == null) codeToId[codeKey] = id
    }
  }

  const output = {
    fetchedAt: new Date().toISOString(),
    source: POKEDATA_BASE,
    creditsPerRequest: 5,
    languagesFetched: languages,
    count: allSets.length,
    sets: allSets.sort((a, b) => {
      const da = new Date(a.release_date).getTime()
      const db = new Date(b.release_date).getTime()
      return db - da
    }),
    byId,
    nameToId,
    codeToId,
  }

  const outPath = path.join(__dirname, '../src/pokedata/pokedataSets.json')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8')

  console.log('')
  console.log(`Wrote ${output.count} sets → ${outPath}`)
  console.log(`  nameToId keys: ${Object.keys(nameToId).length}`)
  console.log(`  codeToId keys: ${Object.keys(codeToId).length}`)
  console.log(`  API credits used: ~${languages.length * 5}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
