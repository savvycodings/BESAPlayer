/**
 * Fetch cards for ONE Pokémon set from Pokedata (5 credits per run).
 * GET https://www.pokedata.io/v0/set?set_id={id}
 *
 * JSON is written in two places (commit incrementally as you fetch):
 *   setCards/{setId}.json           — numeric id (DB sync / legacy)
 *   sets/{setId}-{slug}.json        — human-readable (e.g. 3665-perfect-order.json)
 *
 * Usage (repo root or server/):
 *   pnpm run fetch-set-cards                    # next ENGLISH set without cards synced
 *   pnpm run fetch-set-cards -- --set-id=533    # specific set
 *   pnpm run fetch-set-cards -- --status        # progress only (no API)
 *   pnpm run fetch-set-cards -- --from-json --set-id=533   # DB from saved JSON (no API)
 *   pnpm run fetch-set-cards -- --mirror-json-only         # sets/*.json from setCards/*.json (no API)
 *   pnpm run fetch-set-cards -- --json-only     # API + JSON file, skip DB
 *   pnpm run fetch-set-cards -- --force         # re-fetch even if already synced
 *   pnpm run fetch-set-cards -- --language=JAPANESE
 *
 * Requires POKEDATA_API_KEY (unless --from-json, --mirror-json-only, or --status).
 * Requires DATABASE_URL for DB upsert (unless --json-only or --status).
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { db, marketSets, marketCards } from '../src/db'
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import { ensureMarketSchema } from '../src/market/ensureMarketSchema'
import type { PokedataSetCardRow } from '../src/pokedata/client'

const SET_CARDS_API = 'https://www.pokedata.io/v0/set'
const POKEDATA_ROOT = path.join(__dirname, '../src/pokedata')
const SETS_JSON = path.join(POKEDATA_ROOT, 'pokedataSets.json')
const SET_CARDS_DIR = path.join(POKEDATA_ROOT, 'setCards')
const SETS_SLUG_DIR = path.join(POKEDATA_ROOT, 'sets')
const INDEX_PATH = path.join(SET_CARDS_DIR, '_index.json')

type LanguageFilter = 'ENGLISH' | 'JAPANESE'

type SetRow = {
  id: number
  name: string
  language: string
  code: string | null
  release_date: string
}

type SetCardsIndexEntry = {
  setName: string
  cardCount: number
  fetchedAt: string
  language: string
  /** Relative to pokedata/, e.g. setCards/3665.json */
  idFile: string
  /** Relative to pokedata/, e.g. sets/3665-perfect-order.json */
  slugFile: string
}

type SetCardsIndex = {
  updatedAt: string
  bySetId: Record<string, SetCardsIndexEntry>
}

type SetCardsFile = {
  setId: number
  setName: string
  language: string
  setCode: string | null
  fetchedAt: string
  source: string
  creditsUsed: number
  count: number
  cards: PokedataSetCardRow[]
}

/** "Perfect Order" → "perfect-order" */
export function setNameToSlug(setName: string): string {
  return setName
    .toLowerCase()
    .trim()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'set'
}

export function slugFileName(setId: number, setName: string): string {
  return `${setId}-${setNameToSlug(setName)}.json`
}

function parseArgs() {
  const args = process.argv.slice(2)
  const setIdArg = args.find((a) => a.startsWith('--set-id='))
  const languageArg = args.find((a) => a.startsWith('--language='))
  const language = (languageArg?.split('=')[1]?.toUpperCase() || 'ENGLISH') as LanguageFilter
  if (language !== 'ENGLISH' && language !== 'JAPANESE') {
    throw new Error('--language must be ENGLISH or JAPANESE')
  }
  return {
    setId: setIdArg ? Number(setIdArg.split('=')[1]) : null,
    language,
    fromJson: args.includes('--from-json'),
    jsonOnly: args.includes('--json-only'),
    mirrorJsonOnly: args.includes('--mirror-json-only'),
    status: args.includes('--status'),
    force: args.includes('--force'),
  }
}

function loadSetsJson(language: LanguageFilter): SetRow[] {
  if (!fs.existsSync(SETS_JSON)) {
    throw new Error(`Missing ${SETS_JSON}. Run: pnpm run fetch-pokedata-sets`)
  }
  const data = JSON.parse(fs.readFileSync(SETS_JSON, 'utf8')) as { sets?: SetRow[] }
  if (!Array.isArray(data.sets)) throw new Error('pokedataSets.json has no sets array')
  return data.sets
    .filter((s) => (s.language || 'ENGLISH').toUpperCase() === language)
    .sort((a, b) => new Date(b.release_date).getTime() - new Date(a.release_date).getTime())
}

function loadIndex(): SetCardsIndex {
  if (!fs.existsSync(INDEX_PATH)) {
    return { updatedAt: new Date().toISOString(), bySetId: {} }
  }
  const raw = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')) as SetCardsIndex
  for (const [id, entry] of Object.entries(raw.bySetId)) {
    if (!entry.idFile) {
      entry.idFile = `setCards/${id}.json`
    }
    if (!entry.slugFile && entry.setName) {
      entry.slugFile = `sets/${slugFileName(Number(id), entry.setName)}`
    }
  }
  return raw
}

function saveIndex(index: SetCardsIndex) {
  index.updatedAt = new Date().toISOString()
  fs.mkdirSync(SET_CARDS_DIR, { recursive: true })
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), 'utf8')
}

function setCardsPath(setId: number) {
  return path.join(SET_CARDS_DIR, `${setId}.json`)
}

function setsSlugPath(setId: number, setName: string) {
  return path.join(SETS_SLUG_DIR, slugFileName(setId, setName))
}

function resolveSlugFileBySetId(setId: number, index: SetCardsIndex): string | null {
  const entry = index.bySetId[String(setId)]
  if (entry?.slugFile) {
    const fromIndex = path.join(POKEDATA_ROOT, entry.slugFile)
    if (fs.existsSync(fromIndex)) return fromIndex
  }
  if (!fs.existsSync(SETS_SLUG_DIR)) return null
  const prefix = `${setId}-`
  const match = fs.readdirSync(SETS_SLUG_DIR).find((f) => f.startsWith(prefix) && f.endsWith('.json'))
  return match ? path.join(SETS_SLUG_DIR, match) : null
}

function loadSetCardsFile(setId: number): SetCardsFile {
  const idPath = setCardsPath(setId)
  if (fs.existsSync(idPath)) {
    return JSON.parse(fs.readFileSync(idPath, 'utf8')) as SetCardsFile
  }

  const index = loadIndex()
  const slugPath = resolveSlugFileBySetId(setId, index)
  if (slugPath) {
    return JSON.parse(fs.readFileSync(slugPath, 'utf8')) as SetCardsFile
  }

  throw new Error(
    `No JSON for set ${setId}. Expected ${idPath} or sets/${setId}-*.json. Run fetch without --from-json first.`,
  )
}

function parseReleaseDate(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function buildSetCardsPayload(setId: number, cards: PokedataSetCardRow[], index: SetCardsIndex): SetCardsFile {
  const first = cards[0]
  const setName = first?.set_name ?? index.bySetId[String(setId)]?.setName ?? `Set ${setId}`
  const language = first?.language ?? 'ENGLISH'
  const setCode = first?.set_code ?? null
  return {
    setId,
    setName,
    language,
    setCode,
    fetchedAt: new Date().toISOString(),
    source: `${SET_CARDS_API}?set_id=${setId}`,
    creditsUsed: 5,
    count: cards.length,
    cards,
  }
}

/** Write setCards/{id}.json + sets/{id}-{slug}.json and update _index.json */
function writeSetCardsArtifacts(setId: number, cards: PokedataSetCardRow[], index: SetCardsIndex) {
  const payload = buildSetCardsPayload(setId, cards, index)
  const idPath = setCardsPath(setId)
  const slugPath = setsSlugPath(setId, payload.setName)

  fs.mkdirSync(SET_CARDS_DIR, { recursive: true })
  fs.mkdirSync(SETS_SLUG_DIR, { recursive: true })

  const json = JSON.stringify(payload, null, 2)
  fs.writeFileSync(idPath, json, 'utf8')
  fs.writeFileSync(slugPath, json, 'utf8')

  const idFileRel = path.relative(POKEDATA_ROOT, idPath).replace(/\\/g, '/')
  const slugFileRel = path.relative(POKEDATA_ROOT, slugPath).replace(/\\/g, '/')

  index.bySetId[String(setId)] = {
    setName: payload.setName,
    cardCount: cards.length,
    fetchedAt: payload.fetchedAt,
    language: payload.language,
    idFile: idFileRel,
    slugFile: slugFileRel,
  }
  saveIndex(index)

  console.log(`Wrote ${cards.length} cards → ${idPath}`)
  console.log(`Wrote ${cards.length} cards → ${slugPath}`)
}

/** Copy setCards/*.json to sets/{id}-{slug}.json without API */
function mirrorJsonArtifacts(setId?: number) {
  const index = loadIndex()
  let files: string[]

  if (setId != null && !Number.isNaN(setId)) {
    const p = setCardsPath(setId)
    if (!fs.existsSync(p)) throw new Error(`Missing ${p}`)
    files = [p]
  } else if (fs.existsSync(SET_CARDS_DIR)) {
    files = fs
      .readdirSync(SET_CARDS_DIR)
      .filter((f) => f.endsWith('.json') && f !== '_index.json')
      .map((f) => path.join(SET_CARDS_DIR, f))
  } else {
    console.log('No setCards/ directory to mirror.')
    return
  }

  fs.mkdirSync(SETS_SLUG_DIR, { recursive: true })
  let mirrored = 0

  for (const idPath of files) {
    const payload = JSON.parse(fs.readFileSync(idPath, 'utf8')) as SetCardsFile
    const sid = payload.setId ?? parseInt(path.basename(idPath, '.json'), 10)
    if (Number.isNaN(sid)) continue

    writeSetCardsArtifacts(sid, payload.cards, index)
    mirrored++
  }

  console.log(`Mirrored ${mirrored} set(s) to ${SETS_SLUG_DIR}`)
}

async function pickNextSetId(language: LanguageFilter, index: SetCardsIndex, force: boolean): Promise<number | null> {
  if (process.env.DATABASE_URL?.trim()) {
    await ensureMarketSchema()
    const conditions = [eq(marketSets.language, language)]
    if (!force) conditions.push(isNull(marketSets.cardsSyncedAt))
    const [row] = await db
      .select({ id: marketSets.pokedataSetId, name: marketSets.name })
      .from(marketSets)
      .where(and(...conditions))
      .orderBy(desc(marketSets.releaseDate), asc(marketSets.name))
      .limit(1)
    if (row) return row.id
  }

  const sets = loadSetsJson(language)
  for (const s of sets) {
    if (force || !index.bySetId[String(s.id)]) return s.id
  }
  return null
}

async function fetchCardsFromApi(apiKey: string, setId: number): Promise<PokedataSetCardRow[]> {
  const url = `${SET_CARDS_API}?set_id=${setId}`
  console.log(`GET ${url} (5 credits)`)
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Pokedata set ${setId}: ${res.status} — ${text}`)
  const data = JSON.parse(text) as unknown
  if (!Array.isArray(data)) throw new Error(`Pokedata set ${setId}: expected JSON array`)
  return data as PokedataSetCardRow[]
}

async function upsertCardsToDb(setId: number, cards: PokedataSetCardRow[]) {
  await ensureMarketSchema()
  const now = new Date()
  const setName = cards[0]?.set_name

  await db.transaction(async (tx) => {
    await tx.delete(marketCards).where(eq(marketCards.pokedataSetId, setId))

    const batchSize = 100
    for (let i = 0; i < cards.length; i += batchSize) {
      const chunk = cards.slice(i, i + batchSize)
      await tx.insert(marketCards).values(
        chunk.map((c) => ({
          pokedataCardId: c.id,
          pokedataSetId: c.set_id,
          name: c.name,
          num: String(c.num),
          language: c.language || 'ENGLISH',
          setCode: c.set_code?.trim() || null,
          setName: c.set_name || setName || null,
          secret: Boolean(c.secret),
          releaseDate: parseReleaseDate(c.release_date),
          lastSyncedAt: now,
          createdAt: now,
        })),
      )
    }

    await tx
      .update(marketSets)
      .set({
        cardCount: cards.length,
        cardsSyncedAt: now,
        updatedAt: now,
      })
      .where(eq(marketSets.pokedataSetId, setId))
  })

  console.log(`DB: ${cards.length} cards for set ${setId}${setName ? ` (${setName})` : ''}`)
}

async function printStatus(language: LanguageFilter) {
  const sets = loadSetsJson(language)
  const index = loadIndex()
  const syncedFromIndex = Object.keys(index.bySetId).length

  let syncedFromDb = 0
  let totalInDb = sets.length
  if (process.env.DATABASE_URL?.trim()) {
    await ensureMarketSchema()
    const [{ synced }] = await db
      .select({ synced: sql<number>`count(*)::int` })
      .from(marketSets)
      .where(and(eq(marketSets.language, language), sql`${marketSets.cardsSyncedAt} IS NOT NULL`))
    syncedFromDb = synced ?? 0
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(marketSets)
      .where(eq(marketSets.language, language))
    totalInDb = total ?? sets.length
  }

  const nextId = await pickNextSetId(language, index, false)
  const nextSet = nextId != null ? sets.find((s) => s.id === nextId) : null

  console.log('')
  console.log(`Market cards sync — ${language}`)
  console.log(`  Sets in catalog:     ${sets.length}`)
  console.log(`  JSON files synced:   ${syncedFromIndex}`)
  if (process.env.DATABASE_URL?.trim()) {
    console.log(`  DB sets with cards:  ${syncedFromDb} / ${totalInDb}`)
  }
  console.log(`  Remaining (~):       ${sets.length - syncedFromIndex} JSON runs × 5 credits`)
  if (nextSet) {
    console.log(`  Next suggested:      ${nextSet.name} (set_id=${nextSet.id})`)
  } else {
    console.log('  Next suggested:      (none — all synced for this language)')
  }
  console.log('')
}

async function main() {
  const { setId: argSetId, language, fromJson, jsonOnly, mirrorJsonOnly, status, force } = parseArgs()

  if (mirrorJsonOnly) {
    mirrorJsonArtifacts(argSetId ?? undefined)
    return
  }

  if (status) {
    if (!process.env.DATABASE_URL?.trim() && !fs.existsSync(INDEX_PATH)) {
      const sets = loadSetsJson(language)
      const index = loadIndex()
      console.log(`Sets: ${sets.length}, JSON synced: ${Object.keys(index.bySetId).length}`)
      return
    }
    await printStatus(language)
    return
  }

  const index = loadIndex()
  let setId = argSetId

  if (setId == null || Number.isNaN(setId)) {
    setId = await pickNextSetId(language, index, force)
    if (setId == null) {
      console.log(`All ${language} sets already have cards synced. Use --set-id=ID --force to refresh one.`)
      process.exit(2) // catalog complete (loop scripts stop on exit 2)
    }
  }

  if (!force && index.bySetId[String(setId)] && !fromJson) {
    console.log(`Set ${setId} already in _index.json (${index.bySetId[String(setId)].cardCount} cards). Use --force to re-fetch.`)
    const idPath = setCardsPath(setId)
    const slugPath = resolveSlugFileBySetId(setId, index)
    if (!slugPath && fs.existsSync(idPath)) {
      console.log('Mirroring to sets/ (slug file missing)…')
      const file = loadSetCardsFile(setId)
      writeSetCardsArtifacts(setId, file.cards, index)
    }
    if (!jsonOnly && process.env.DATABASE_URL?.trim() && fs.existsSync(idPath)) {
      console.log('Syncing existing JSON to DB…')
      const file = loadSetCardsFile(setId)
      await upsertCardsToDb(setId, file.cards)
    }
    return
  }

  const sets = loadSetsJson(language)
  const meta = sets.find((s) => s.id === setId)
  if (meta) {
    console.log(`Set: ${meta.name} (id=${setId}, code=${meta.code ?? '—'})`)
  } else {
    console.log(`Set id=${setId}`)
  }

  let cards: PokedataSetCardRow[]

  if (fromJson) {
    cards = loadSetCardsFile(setId).cards
    console.log(`Loaded ${cards.length} cards from JSON (no API call)`)
    writeSetCardsArtifacts(setId, cards, index)
  } else {
    const apiKey = (process.env.POKEDATA_API_KEY || '').trim()
    if (!apiKey) throw new Error('Set POKEDATA_API_KEY in server/.env')
    cards = await fetchCardsFromApi(apiKey, setId)
    console.log(`  Received ${cards.length} cards`)
    writeSetCardsArtifacts(setId, cards, index)
  }

  if (!jsonOnly) {
    if (!process.env.DATABASE_URL?.trim()) {
      console.log('DATABASE_URL not set — skipped DB upsert (JSON saved).')
    } else {
      console.log('Upserting into market_cards…')
      await upsertCardsToDb(setId, cards)
    }
  }

  const remaining = sets.filter((s) => !index.bySetId[String(s.id)]).length
  console.log('')
  console.log('Done.')
  console.log(`  API credits this run: ${fromJson ? 0 : 5}`)
  console.log(`  Cards in set:         ${cards.length}`)
  if (!fromJson && !jsonOnly) {
    console.log(`  ~${remaining} ${language} sets left in JSON index (run again for next set)`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
