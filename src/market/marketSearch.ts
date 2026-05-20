import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { db, marketCards, marketSets } from '../db'
import { buildImageUrl } from '../pokedata/lookup'

export type MarketSearchResult = {
  id: string
  name: string
  set: string
  number: string
}

/** Result shape compatible with /pokedata/search */
export function toSearchResults(rows: MarketSearchResult[]) {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    set: r.set,
    number: r.number,
    num: r.number,
  }))
}

export async function countMarketCards(): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(marketCards)
  return count ?? 0
}

/**
 * Search synced market_cards (no Pokedata). Returns [] if catalog empty or no matches.
 */
export async function searchMarketCards(
  query: string,
  opts?: { language?: string; limit?: number; setId?: number },
): Promise<MarketSearchResult[]> {
  const q = query.trim()
  if (!q) return []

  const language = (opts?.language || 'ENGLISH').toUpperCase()
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 50)
  const pattern = `%${q.replace(/\s+/g, '%')}%`

  const conditions = [eq(marketCards.language, language)]
  if (opts?.setId != null) {
    conditions.push(eq(marketCards.pokedataSetId, opts.setId))
  }

  conditions.push(
    or(
      ilike(marketCards.name, pattern),
      ilike(marketCards.setName, pattern),
      ilike(marketCards.num, pattern),
      ilike(marketCards.setCode, pattern),
      sql`(${marketCards.name} || ' ' || ${marketCards.num} || ' ' || COALESCE(${marketCards.setName}, '')) ILIKE ${pattern}`,
    )!,
  )

  const rows = await db
    .select({
      id: marketCards.pokedataCardId,
      name: marketCards.name,
      num: marketCards.num,
      setName: marketCards.setName,
      tcgSetId: marketSets.tcgSetId,
      setCode: marketCards.setCode,
      releaseDate: marketSets.releaseDate,
    })
    .from(marketCards)
    .innerJoin(marketSets, eq(marketCards.pokedataSetId, marketSets.pokedataSetId))
    .where(and(...conditions))
    .orderBy(desc(marketSets.releaseDate), asc(marketCards.num))
    .limit(limit)

  return rows.map((r) => ({
    id: String(r.id),
    name: r.name,
    set: r.setName || '',
    number: r.num,
  }))
}

export type MarketCardMeta = {
  id: string
  cardName: string
  setName: string | null
  setId: string | null
  cardNumber: string | null
  imageUrl: string | null
}

/** Card metadata from market_cards (no pricing). */
export async function getMarketCardById(id: string): Promise<MarketCardMeta | null> {
  const numId = parseInt(id, 10)
  if (Number.isNaN(numId)) return null

  const [row] = await db
    .select({
      id: marketCards.pokedataCardId,
      name: marketCards.name,
      num: marketCards.num,
      setName: marketCards.setName,
      setCode: marketCards.setCode,
      tcgSetId: marketSets.tcgSetId,
    })
    .from(marketCards)
    .innerJoin(marketSets, eq(marketCards.pokedataSetId, marketSets.pokedataSetId))
    .where(eq(marketCards.pokedataCardId, numId))
    .limit(1)

  if (!row) return null

  const tcgCode = row.tcgSetId || row.setCode || null
  const imageUrl = buildImageUrl(tcgCode, row.num, row.setName)

  return {
    id: String(row.id),
    cardName: row.name,
    setName: row.setName,
    setId: tcgCode,
    cardNumber: row.num,
    imageUrl,
  }
}
