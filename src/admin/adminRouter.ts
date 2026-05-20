import { Router } from 'express'
import asyncHandler from 'express-async-handler'
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  sql,
} from 'drizzle-orm'
import {
  db,
  marketSets,
  marketCards,
  cardPrices,
  cardPriceHistory,
  priceSyncJobs,
  priceSyncFailures,
} from '../db'
import { ensureMarketSchema } from '../market/ensureMarketSchema'
import { ensurePriceSyncSchema } from '../pricing/ensurePriceSyncSchema'
import { requireAdminSecret } from './adminAuth'

const router = Router()

router.use(
  asyncHandler(async (_req, _res, next) => {
    await ensureMarketSchema()
    await ensurePriceSyncSchema()
    next()
  }),
)
router.use(requireAdminSecret)

router.get(
  '/api/admin/dashboard',
  asyncHandler(async (_req, res) => {
    const [{ setCount }] = await db
      .select({ setCount: sql<number>`count(*)::int` })
      .from(marketSets)
    const [{ cardCount }] = await db
      .select({ cardCount: sql<number>`count(*)::int` })
      .from(marketCards)
    const [{ pricedCount }] = await db
      .select({ pricedCount: sql<number>`count(*)::int` })
      .from(cardPrices)
    const [{ historyRows }] = await db
      .select({ historyRows: sql<number>`count(*)::int` })
      .from(cardPriceHistory)
    const [{ syncedCards }] = await db
      .select({
        syncedCards: sql<number>`count(*)::int`,
      })
      .from(marketCards)
      .where(sql`${marketCards.lastPriceSyncedAt} IS NOT NULL`)

    const [latestJob] = await db
      .select()
      .from(priceSyncJobs)
      .orderBy(desc(priceSyncJobs.startedAt))
      .limit(1)

    res.json({
      sets: setCount ?? 0,
      marketCards: cardCount ?? 0,
      cardPrices: pricedCount ?? 0,
      historyRows: historyRows ?? 0,
      cardsWithPriceSync: syncedCards ?? 0,
      priceCoveragePct:
        cardCount && cardCount > 0
          ? Math.round(((pricedCount ?? 0) / cardCount) * 1000) / 10
          : 0,
      latestJob: latestJob
        ? {
            id: latestJob.id,
            recordedDate: latestJob.recordedDate,
            status: latestJob.status,
            processed: latestJob.processed,
            totalCards: latestJob.totalCards,
            succeeded: latestJob.succeeded,
            failed: latestJob.failed,
            startedAt: latestJob.startedAt?.toISOString(),
            completedAt: latestJob.completedAt?.toISOString() ?? null,
          }
        : null,
    })
  }),
)

router.get(
  '/api/admin/price-jobs',
  asyncHandler(async (req, res) => {
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20))
    const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0)
    const rows = await db
      .select()
      .from(priceSyncJobs)
      .orderBy(desc(priceSyncJobs.startedAt))
      .limit(limit)
      .offset(offset)
    res.json({ jobs: rows, limit, offset })
  }),
)

router.get(
  '/api/admin/price-jobs/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id)
    const [job] = await db.select().from(priceSyncJobs).where(eq(priceSyncJobs.id, id)).limit(1)
    if (!job) {
      res.status(404).json({ error: 'Job not found' })
      return
    }
    const failures = await db
      .select()
      .from(priceSyncFailures)
      .where(eq(priceSyncFailures.jobId, id))
      .orderBy(desc(priceSyncFailures.lastAttemptAt))
      .limit(100)
    res.json({ job, failures })
  }),
)

router.post(
  '/api/admin/price-jobs/trigger',
  asyncHandler(async (_req, res) => {
    res.json({
      ok: true,
      message: 'Run on the server: pnpm run sync-card-prices (or --resume). Cron-friendly exit code 2 when incomplete.',
    })
  }),
)

router.get(
  '/api/admin/market/sets',
  asyncHandler(async (req, res) => {
    const language = String(req.query.language || 'ENGLISH').toUpperCase()
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    const conditions = [eq(marketSets.language, language)]
    if (q) conditions.push(ilike(marketSets.name, `%${q}%`))

    const rows = await db
      .select({
        pokedataSetId: marketSets.pokedataSetId,
        name: marketSets.name,
        code: marketSets.code,
        language: marketSets.language,
        cardCount: marketSets.cardCount,
        cardsSyncedAt: marketSets.cardsSyncedAt,
        releaseDate: marketSets.releaseDate,
      })
      .from(marketSets)
      .where(and(...conditions))
      .orderBy(desc(marketSets.releaseDate), asc(marketSets.name))

    const pricedBySet = await db
      .select({
        setId: marketCards.pokedataSetId,
        priced: sql<number>`count(*)::int`,
      })
      .from(marketCards)
      .innerJoin(cardPrices, eq(cardPrices.id, sql`${marketCards.pokedataCardId}::text`))
      .groupBy(marketCards.pokedataSetId)
    const pricedMap = new Map(pricedBySet.map((p) => [p.setId, p.priced ?? 0]))

    const sets = rows.map((r) => {
      const count = r.cardCount ?? 0
      const priced = pricedMap.get(r.pokedataSetId) ?? 0
      return {
        id: r.pokedataSetId,
        name: r.name,
        code: r.code,
        language: r.language,
        cardCount: count,
        cardsSynced: r.cardsSyncedAt != null,
        cardsSyncedAt: r.cardsSyncedAt?.toISOString() ?? null,
        releaseDate: r.releaseDate?.toISOString() ?? null,
        priceCoveragePct: count > 0 ? Math.round((priced / count) * 1000) / 10 : 0,
      }
    })

    res.json({ sets, language })
  }),
)

router.get(
  '/api/admin/market/sets/:setId/cards',
  asyncHandler(async (req, res) => {
    const setId = parseInt(String(req.params.setId), 10)
    if (Number.isNaN(setId)) {
      res.status(400).json({ error: 'Invalid set id' })
      return
    }
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    const conditions = [eq(marketCards.pokedataSetId, setId)]
    if (q) {
      conditions.push(
        sql`(${marketCards.name} ILIKE ${'%' + q + '%'} OR ${marketCards.num} ILIKE ${'%' + q + '%'})`,
      )
    }

    const cards = await db
      .select({
        id: marketCards.pokedataCardId,
        name: marketCards.name,
        num: marketCards.num,
        secret: marketCards.secret,
        setName: marketCards.setName,
        lastPriceSyncedAt: marketCards.lastPriceSyncedAt,
        marketPrice: cardPrices.marketPrice,
        ebayLastSold: cardPrices.ebayLastSold,
        imageUrl: cardPrices.imageUrl,
        lastFetchedAt: cardPrices.lastFetchedAt,
        historyCount: sql<number>`(
          SELECT count(*)::int FROM card_price_history h
          WHERE h.card_id = ${marketCards.pokedataCardId}::text
        )`,
      })
      .from(marketCards)
      .leftJoin(cardPrices, eq(cardPrices.id, sql`${marketCards.pokedataCardId}::text`))
      .where(and(...conditions))
      .orderBy(asc(marketCards.num))

    res.json({
      cards: cards.map((c) => ({
        id: c.id,
        name: c.name,
        number: c.num,
        secret: c.secret,
        set: c.setName,
        marketPrice: c.marketPrice != null ? parseFloat(String(c.marketPrice)) : null,
        ebayLastSold: c.ebayLastSold != null ? parseFloat(String(c.ebayLastSold)) : null,
        imageUrl: c.imageUrl,
        lastFetchedAt: c.lastFetchedAt?.toISOString() ?? null,
        lastPriceSyncedAt: c.lastPriceSyncedAt?.toISOString() ?? null,
        historyPointCount: c.historyCount ?? 0,
      })),
    })
  }),
)

router.get(
  '/api/admin/cards/:cardId',
  asyncHandler(async (req, res) => {
    const cardId = String(req.params.cardId).trim()
    const numericId = parseInt(cardId, 10)
    const [catalog] =
      !Number.isNaN(numericId)
        ? await db
            .select()
            .from(marketCards)
            .where(eq(marketCards.pokedataCardId, numericId))
            .limit(1)
        : []

    const [cache] = await db.select().from(cardPrices).where(eq(cardPrices.id, cardId)).limit(1)

    const since = new Date()
    since.setDate(since.getDate() - 90)
    const history = await db
      .select({
        recordedAt: cardPriceHistory.recordedAt,
        recordedDate: cardPriceHistory.recordedDate,
        marketPrice: cardPriceHistory.marketPrice,
        ebayLastSold: cardPriceHistory.ebayLastSold,
      })
      .from(cardPriceHistory)
      .where(and(eq(cardPriceHistory.cardId, cardId), gte(cardPriceHistory.recordedAt, since)))
      .orderBy(asc(cardPriceHistory.recordedAt))

    const [failure] = await db
      .select()
      .from(priceSyncFailures)
      .where(eq(priceSyncFailures.pokedataCardId, numericId || -1))
      .orderBy(desc(priceSyncFailures.lastAttemptAt))
      .limit(1)

    res.json({
      catalog: catalog ?? null,
      cache: cache
        ? {
            id: cache.id,
            cardName: cache.cardName,
            setName: cache.setName,
            setId: cache.setId,
            cardNumber: cache.cardNumber,
            imageUrl: cache.imageUrl,
            marketPrice: cache.marketPrice != null ? parseFloat(String(cache.marketPrice)) : null,
            ebayLastSold:
              cache.ebayLastSold != null ? parseFloat(String(cache.ebayLastSold)) : null,
            lastFetchedAt: cache.lastFetchedAt.toISOString(),
          }
        : null,
      history: history.map((h) => ({
        date: h.recordedDate,
        recordedAt: h.recordedAt instanceof Date ? h.recordedAt.toISOString() : h.recordedAt,
        marketPrice: h.marketPrice != null ? parseFloat(String(h.marketPrice)) : null,
        ebayLastSold: h.ebayLastSold != null ? parseFloat(String(h.ebayLastSold)) : null,
      })),
      latestSyncFailure: failure ?? null,
    })
  }),
)

router.patch(
  '/api/admin/cards/:cardId',
  asyncHandler(async (req, res) => {
    const cardId = String(req.params.cardId).trim()
    const { imageUrl } = req.body as { imageUrl?: string }
    if (imageUrl === undefined) {
      res.status(400).json({ error: 'imageUrl required' })
      return
    }
    const now = new Date()
    await db
      .insert(cardPrices)
      .values({
        id: cardId,
        imageUrl: imageUrl || null,
        lastFetchedAt: now,
      })
      .onConflictDoUpdate({
        target: cardPrices.id,
        set: { imageUrl: imageUrl || null, updatedAt: now },
      })
    res.json({ ok: true, cardId, imageUrl: imageUrl || null })
  }),
)

export default router
