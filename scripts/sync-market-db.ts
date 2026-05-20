/**
 * Sync Pokedata sets into Postgres (market_sets) for offline Market screen.
 *
 * Default: fetch from Pokedata API (~5 credits per language) → write pokedataSets.json → upsert DB.
 *
 * Usage (repo root or server/):
 *   pnpm run update-db
 *   pnpm run update-db -- --from-json          # upsert from pokedataSets.json only (no API)
 *   pnpm run update-db -- --language=JAPANESE
 *   pnpm run update-db -- --all-languages      # ~10 credits
 *
 * Requires DATABASE_URL and (unless --from-json) POKEDATA_API_KEY in server/.env
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { db, marketSets } from '../src/db'
import { eq, sql } from 'drizzle-orm'
import { ensureMarketSchema } from '../src/market/ensureMarketSchema'

type PokedataSetRow = {
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

function parseArgs(): { languages: LanguageFilter[]; fromJson: boolean } {
  const args = process.argv.slice(2)
  const fromJson = args.includes('--from-json')
  if (args.includes('--all-languages')) {
    return { languages: ['ENGLISH', 'JAPANESE'], fromJson }
  }
  const langArg = args.find((a) => a.startsWith('--language='))
  if (langArg) {
    const lang = langArg.split('=')[1]?.toUpperCase()
    if (lang !== 'ENGLISH' && lang !== 'JAPANESE') {
      throw new Error('--language must be ENGLISH or JAPANESE')
    }
    return { languages: [lang as LanguageFilter], fromJson }
  }
  return { languages: ['ENGLISH'], fromJson }
}

function loadTcgNameToId(): Record<string, string> {
  const candidates = [
    path.join(__dirname, '../src/pokedata/pokemonTcgSets.json'),
    path.join(__dirname, '../../app/src/utils/pokemonTcgSets.json'),
  ]
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { nameToId?: Record<string, string> }
      if (data.nameToId) return data.nameToId
    } catch {
      // try next
    }
  }
  return {}
}

async function fetchSetsFromApi(apiKey: string, language: LanguageFilter): Promise<PokedataSetRow[]> {
  const url = `https://www.pokedata.io/v0/sets?language=${encodeURIComponent(language)}`
  console.log(`GET ${url} (5 credits)`)
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Pokedata sets ${language}: ${res.status} — ${text}`)
  const data = JSON.parse(text) as unknown
  if (!Array.isArray(data)) throw new Error(`Expected array for ${language}`)
  return data as PokedataSetRow[]
}

function writePokedataSetsJson(allSets: PokedataSetRow[], languages: LanguageFilter[]) {
  const nameToId: Record<string, number> = {}
  const codeToId: Record<string, number> = {}
  const byId: Record<string, PokedataSetRow> = {}
  for (const row of allSets) {
    byId[String(row.id)] = row
    const nameKey = normalizeKey(row.name)
    if (nameKey && nameToId[nameKey] == null) nameToId[nameKey] = row.id
    if (row.code?.trim()) {
      const codeKey = row.code.trim().toLowerCase()
      if (codeToId[codeKey] == null) codeToId[codeKey] = row.id
    }
  }
  const output = {
    fetchedAt: new Date().toISOString(),
    source: 'https://www.pokedata.io/v0/sets',
    creditsPerRequest: 5,
    languagesFetched: languages,
    count: allSets.length,
    sets: allSets.sort((a, b) => new Date(b.release_date).getTime() - new Date(a.release_date).getTime()),
    byId,
    nameToId,
    codeToId,
  }
  const outPath = path.join(__dirname, '../src/pokedata/pokedataSets.json')
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8')
  console.log(`Wrote ${output.count} sets → ${outPath}`)
}

function loadSetsFromJson(): PokedataSetRow[] {
  const jsonPath = path.join(__dirname, '../src/pokedata/pokedataSets.json')
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Missing ${jsonPath}. Run: pnpm run fetch-pokedata-sets`)
  }
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as { sets?: PokedataSetRow[] }
  if (!Array.isArray(data.sets)) throw new Error('pokedataSets.json has no sets array')
  return data.sets
}

function parseReleaseDate(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

async function ensureMarketSetsTable() {
  await ensureMarketSchema()
}

async function upsertSets(rows: PokedataSetRow[], tcgNameToId: Record<string, string>) {
  const existing = await db
    .select({ id: marketSets.pokedataSetId })
    .from(marketSets)
  const existingIds = new Set(existing.map((r) => r.id))

  let inserted = 0
  let updated = 0
  const now = new Date()

  for (const row of rows) {
    const tcgSetId = tcgNameToId[normalizeKey(row.name)] ?? null
    const values = {
      pokedataSetId: row.id,
      name: row.name,
      code: row.code?.trim() || null,
      language: row.language || 'ENGLISH',
      releaseDate: parseReleaseDate(row.release_date),
      tcg: row.tcg ?? 'Pokemon',
      tcgSetId,
      lastSyncedAt: now,
      updatedAt: now,
    }

    if (existingIds.has(row.id)) {
      await db
        .update(marketSets)
        .set(values)
        .where(eq(marketSets.pokedataSetId, row.id))
      updated++
    } else {
      await db.insert(marketSets).values({ ...values, cardCount: 0, createdAt: now })
      inserted++
    }
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(marketSets)

  return { inserted, updated, total: count ?? 0 }
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('Set DATABASE_URL in server/.env')
  }

  const { languages, fromJson } = parseArgs()
  const tcgNameToId = loadTcgNameToId()
  let allSets: PokedataSetRow[] = []

  if (fromJson) {
    allSets = loadSetsFromJson()
    console.log(`Loaded ${allSets.length} sets from pokedataSets.json (no API call)`)
  } else {
    const apiKey = (process.env.POKEDATA_API_KEY || '').trim()
    if (!apiKey) throw new Error('Set POKEDATA_API_KEY in server/.env (or use --from-json)')
    for (const language of languages) {
      const rows = await fetchSetsFromApi(apiKey, language)
      console.log(`  ${language}: ${rows.length} sets`)
      allSets.push(...rows)
    }
    writePokedataSetsJson(allSets, languages)
  }

  console.log('Ensuring market_sets table…')
  await ensureMarketSetsTable()

  console.log('Upserting into market_sets…')
  const { inserted, updated, total } = await upsertSets(allSets, tcgNameToId)

  console.log('')
  console.log('Market DB sync complete')
  console.log(`  New sets:     ${inserted}`)
  console.log(`  Updated:      ${updated}`)
  console.log(`  Total in DB:  ${total}`)
  if (!fromJson) {
    console.log(`  API credits:  ~${languages.length * 5}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
