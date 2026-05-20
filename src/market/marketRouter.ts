import { Router } from 'express'

import asyncHandler from 'express-async-handler'

import { db, marketSets, marketCards, cardPrices } from '../db'

import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm'

import { ensureMarketSchema } from './ensureMarketSchema'

import { searchMarketCards, toSearchResults } from './marketSearch'



const router = Router()



router.use(

  asyncHandler(async (_req, _res, next) => {

    await ensureMarketSchema()

    next()

  }),

)



/**

 * GET /api/market/sets — read cached sets from DB (no Pokedata call).

 * Query: language=ENGLISH|JAPANESE, q=search name/code

 */

router.get(

  '/api/market/sets',

  asyncHandler(async (req, res) => {

    const language = String(req.query.language || 'ENGLISH').toUpperCase()

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''



    const conditions = [eq(marketSets.language, language)]

    if (q.length > 0) {

      conditions.push(ilike(marketSets.name, `%${q}%`))

    }



    const rows = await db

      .select({

        pokedataSetId: marketSets.pokedataSetId,

        name: marketSets.name,

        code: marketSets.code,

        language: marketSets.language,

        releaseDate: marketSets.releaseDate,

        tcg: marketSets.tcg,

        cardCount: marketSets.cardCount,

        tcgSetId: marketSets.tcgSetId,

        cardsSyncedAt: marketSets.cardsSyncedAt,

        lastSyncedAt: marketSets.lastSyncedAt,

      })

      .from(marketSets)

      .where(and(...conditions))

      .orderBy(desc(marketSets.releaseDate), asc(marketSets.name))



    const [{ count }] = await db

      .select({ count: sql<number>`count(*)::int` })

      .from(marketSets)

      .where(eq(marketSets.language, language))



    const [{ syncedAt }] = await db

      .select({ syncedAt: sql<Date | null>`max(${marketSets.lastSyncedAt})` })

      .from(marketSets)

      .where(eq(marketSets.language, language))



    const [{ setsWithCards }] = await db

      .select({ setsWithCards: sql<number>`count(*)::int` })

      .from(marketSets)

      .where(and(eq(marketSets.language, language), sql`${marketSets.cardsSyncedAt} IS NOT NULL`))



    res.json({

      sets: rows.map((r) => ({

        id: r.pokedataSetId,

        name: r.name,

        code: r.code,

        language: r.language,

        releaseDate: r.releaseDate?.toISOString() ?? null,

        tcg: r.tcg,

        cardCount: r.cardCount ?? 0,

        tcgSetId: r.tcgSetId,

        cardsSynced: r.cardsSyncedAt != null,

      })),

      meta: {

        language,

        count: rows.length,

        totalForLanguage: count ?? 0,

        setsWithCards: setsWithCards ?? 0,

        lastSyncedAt: syncedAt ? new Date(syncedAt).toISOString() : null,

        source: 'database',

      },

    })

  }),

)



/**

 * GET /api/market/sets/:setId/cards — cards for one synced set (no Pokedata).

 */

router.get(

  '/api/market/sets/:setId/cards',

  asyncHandler(async (req, res) => {

    const setId = parseInt(String(req.params.setId), 10)

    if (Number.isNaN(setId)) {

      res.status(400).json({ error: 'Invalid set id' })

      return

    }



    const [setRow] = await db

      .select({

        id: marketSets.pokedataSetId,

        name: marketSets.name,

        code: marketSets.code,

        cardCount: marketSets.cardCount,

        cardsSyncedAt: marketSets.cardsSyncedAt,

        tcgSetId: marketSets.tcgSetId,

      })

      .from(marketSets)

      .where(eq(marketSets.pokedataSetId, setId))

      .limit(1)



    if (!setRow) {

      res.status(404).json({ error: 'Set not found in catalog' })

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

        setCode: marketCards.setCode,

        marketPrice: cardPrices.marketPrice,

        ebayLastSold: cardPrices.ebayLastSold,

        imageUrl: cardPrices.imageUrl,

        lastFetchedAt: cardPrices.lastFetchedAt,

      })

      .from(marketCards)

      .leftJoin(cardPrices, eq(cardPrices.id, sql`${marketCards.pokedataCardId}::text`))

      .where(and(...conditions))

      .orderBy(asc(marketCards.num))



    res.json({

      set: {

        id: setRow.id,

        name: setRow.name,

        code: setRow.code,

        cardCount: setRow.cardCount,

        cardsSynced: setRow.cardsSyncedAt != null,

        tcgSetId: setRow.tcgSetId,

      },

      cards: cards.map((c) => ({

        id: c.id,

        name: c.name,

        number: c.num,

        num: c.num,

        secret: c.secret,

        set: c.setName,

        setCode: c.setCode,

        marketPrice: c.marketPrice != null ? parseFloat(String(c.marketPrice)) : null,

        ebayLastSold: c.ebayLastSold != null ? parseFloat(String(c.ebayLastSold)) : null,

        imageUrl: c.imageUrl,

        lastFetchedAt: c.lastFetchedAt?.toISOString() ?? null,

      })),

      meta: { count: cards.length, source: 'database' },

    })

  }),

)



/**

 * GET /api/market/search — search cached cards (no Pokedata).

 * Query: q or query, language=ENGLISH, limit, set_id

 */

router.get(

  '/api/market/search',

  asyncHandler(async (req, res) => {

    const query = String(req.query.q || req.query.query || '').trim()

    const language = String(req.query.language || 'ENGLISH').toUpperCase()

    const limitParam = req.query.limit

    const limit = Math.min(Math.max(parseInt(String(limitParam), 10) || 10, 1), 50)

    const setIdParam = req.query.set_id

    const setId = setIdParam != null ? parseInt(String(setIdParam), 10) : undefined



    if (!query) {

      res.status(400).json({ error: 'Query parameter q or query is required' })

      return

    }



    const results = await searchMarketCards(query, {

      language,

      limit,

      setId: setId != null && !Number.isNaN(setId) ? setId : undefined,

    })



    res.json({

      results: toSearchResults(results),

      source: 'market_db',

      fromCache: true,

    })

  }),

)



export default router


