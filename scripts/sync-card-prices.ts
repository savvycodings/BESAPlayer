/**
 * Daily price sync: fetch Pokedata pricing for every row in market_cards (checkpointed).
 *
 * Usage (from server/):
 *   pnpm run sync-card-prices              # resume today's job or start fresh
 *   pnpm run sync-card-prices -- --fresh   # force new job for today
 *   pnpm run sync-card-prices -- --job-id=UUID
 *   pnpm run sync-card-prices -- --retry-failures --job-id=UUID
 *   pnpm run sync-card-prices -- --limit=100  # max cards this run (then exit 2)
 *
 * Exit codes: 0 = completed, 2 = paused/incomplete (re-run with --resume), 1 = fatal
 *
 * Env: DATABASE_URL, POKEDATA_API_KEY
 * Optional: PRICE_SYNC_DELAY_MS=1200, PRICE_SYNC_BATCH=50, PRICE_SYNC_MAX_RETRIES=3
 */

import 'dotenv/config'
import { randomUUID } from 'crypto'
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm'
import { db, marketCards, priceSyncFailures, priceSyncJobs } from '../src/db'
import { pokedataClient } from '../src/pokedata/client'
import { ensureMarketSchema } from '../src/market/ensureMarketSchema'
import { ensurePriceSyncSchema } from '../src/pricing/ensurePriceSyncSchema'
import {
  parsePricingFromApi,
  todayRecordedDate,
  upsertCardPriceFromPricing,
} from '../src/pricing/cardPriceUpsert'

const DELAY_MS = parseInt(process.env.PRICE_SYNC_DELAY_MS || '1200', 10)
const BATCH_SIZE = parseInt(process.env.PRICE_SYNC_BATCH || '50', 10)
const MAX_RETRIES = parseInt(process.env.PRICE_SYNC_MAX_RETRIES || '3', 10)

type JobStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed'

function parseArgs() {
  const argv = process.argv.slice(2)
  let fresh = false
  let resume = true
  let retryFailures = false
  let jobId: string | undefined
  let limit: number | undefined
  for (const a of argv) {
    if (a === '--fresh') {
      fresh = true
      resume = false
    }
    if (a === '--resume') resume = true
    if (a === '--retry-failures') retryFailures = true
    if (a.startsWith('--job-id=')) jobId = a.slice('--job-id='.length)
    if (a.startsWith('--limit=')) {
      const n = parseInt(a.slice('--limit='.length), 10)
      if (!Number.isNaN(n) && n > 0) limit = n
    }
  }
  return { fresh, resume, retryFailures, jobId, limit }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function countMarketCards(): Promise<number> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(marketCards)
  return count ?? 0
}

async function findResumableJob(recordedDate: string) {
  const rows = await db
    .select()
    .from(priceSyncJobs)
    .where(
      and(
        eq(priceSyncJobs.recordedDate, recordedDate),
        inArray(priceSyncJobs.status, ['pending', 'running', 'paused']),
      ),
    )
    .orderBy(asc(priceSyncJobs.startedAt))
    .limit(1)
  return rows[0] ?? null
}

async function createJob(recordedDate: string, total: number) {
  const id = randomUUID()
  const now = new Date()
  await db.insert(priceSyncJobs).values({
    id,
    recordedDate,
    status: 'running',
    cursorCardId: 0,
    totalCards: total,
    processed: 0,
    succeeded: 0,
    failed: 0,
    startedAt: now,
    updatedAt: now,
  })
  return id
}

async function updateJob(
  jobId: string,
  patch: Partial<{
    status: JobStatus
    cursorCardId: number
    processed: number
    succeeded: number
    failed: number
    errorSummary: string | null
    completedAt: Date | null
  }>,
) {
  await db
    .update(priceSyncJobs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(priceSyncJobs.id, jobId))
}

async function recordFailure(jobId: string, cardId: number, error: string) {
  const now = new Date()
  await db
    .insert(priceSyncFailures)
    .values({
      jobId,
      pokedataCardId: cardId,
      error: error.slice(0, 2000),
      attempts: 1,
      lastAttemptAt: now,
    })
    .onConflictDoUpdate({
      target: [priceSyncFailures.jobId, priceSyncFailures.pokedataCardId],
      set: {
        error: error.slice(0, 2000),
        attempts: sql`COALESCE(${priceSyncFailures.attempts}, 0) + 1`,
        lastAttemptAt: now,
      },
    })
}

async function fetchWithRetries(cardId: string, assetType: 'CARD' | 'SEALED' = 'CARD') {
  let lastErr: Error | null = null
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await pokedataClient.getCardPricing(cardId, assetType)
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
      if (attempt < MAX_RETRIES) await sleep(500 * attempt)
    }
  }
  throw lastErr ?? new Error('Unknown pricing error')
}

async function processCard(
  jobId: string,
  card: {
    pokedataCardId: number
    name: string
    num: string
    setName: string | null
    setCode: string | null
  },
  recordedDate: string,
) {
  const id = String(card.pokedataCardId)
  const pricing = await fetchWithRetries(id, 'CARD')
  const parsed = parsePricingFromApi(pricing, {
    cardName: card.name,
    setName: card.setName,
    cardNumber: card.num,
    setId: card.setCode,
  })
  await upsertCardPriceFromPricing(id, parsed, {
    recordedDate,
    updateMarketCardTimestamp: true,
  })
}

async function main() {
  if (!process.env.POKEDATA_API_KEY?.trim()) throw new Error('POKEDATA_API_KEY required')
  if (!process.env.DATABASE_URL?.trim()) throw new Error('DATABASE_URL required')

  const { fresh, resume, retryFailures, jobId: argJobId, limit } = parseArgs()
  const recordedDate = todayRecordedDate()

  await ensureMarketSchema()
  await ensurePriceSyncSchema()

  const total = await countMarketCards()
  if (total === 0) {
    console.log('No cards in market_cards. Sync sets first (pnpm run fetch-set-cards).')
    process.exit(0)
  }

  let jobId = argJobId
  let cursor = 0
  let processed = 0
  let succeeded = 0
  let failed = 0

  if (!jobId) {
    if (!fresh && resume) {
      const existing = await findResumableJob(recordedDate)
      if (existing) jobId = existing.id
    }
    if (!jobId) {
      jobId = await createJob(recordedDate, total)
      console.log(`Created job ${jobId} for ${recordedDate} (${total} cards)`)
    } else {
      console.log(`Resuming job ${jobId}`)
    }
  }

  const [job] = await db.select().from(priceSyncJobs).where(eq(priceSyncJobs.id, jobId!)).limit(1)
  if (!job) throw new Error(`Job not found: ${jobId}`)
  if (job.status === 'completed') {
    console.log(`Job ${jobId} already completed for ${job.recordedDate}.`)
    process.exit(0)
  }

  cursor = job.cursorCardId ?? 0
  processed = job.processed ?? 0
  succeeded = job.succeeded ?? 0
  failed = job.failed ?? 0
  const jobRecordedDate = job.recordedDate

  await updateJob(jobId!, { status: 'running' })

  let cardIdsToProcess: number[] | null = null
  if (retryFailures) {
    const failures = await db
      .select({ pokedataCardId: priceSyncFailures.pokedataCardId })
      .from(priceSyncFailures)
      .where(eq(priceSyncFailures.jobId, jobId!))
    cardIdsToProcess = failures.map((f) => f.pokedataCardId)
    console.log(`Retrying ${cardIdsToProcess.length} failed cards`)
  }

  let processedThisRun = 0
  let incomplete = false

  const processBatch = async (cards: typeof batchCards) => {
    for (const card of cards) {
      try {
        await processCard(jobId!, card, jobRecordedDate)
        succeeded++
        cursor = card.pokedataCardId
      } catch (e) {
        failed++
        const msg = e instanceof Error ? e.message : String(e)
        console.warn(`  Failed card ${card.pokedataCardId}: ${msg}`)
        await recordFailure(jobId!, card.pokedataCardId, msg)
        cursor = card.pokedataCardId
      }
      processed++
      processedThisRun++

      await updateJob(jobId!, {
        cursorCardId: cursor,
        processed,
        succeeded,
        failed,
      })

      if (limit != null && processedThisRun >= limit) {
        incomplete = true
        break
      }
      await sleep(DELAY_MS)
    }
  }

  type BatchCard = {
    pokedataCardId: number
    name: string
    num: string
    setName: string | null
    setCode: string | null
  }

  if (cardIdsToProcess != null) {
    if (cardIdsToProcess.length === 0) {
      console.log('No failures to retry.')
    } else {
      const cards = await db
        .select({
          pokedataCardId: marketCards.pokedataCardId,
          name: marketCards.name,
          num: marketCards.num,
          setName: marketCards.setName,
          setCode: marketCards.setCode,
        })
        .from(marketCards)
        .where(inArray(marketCards.pokedataCardId, cardIdsToProcess))
      await processBatch(cards)
    }
  } else {
    while (!incomplete) {
      const batchCards: BatchCard[] = await db
        .select({
          pokedataCardId: marketCards.pokedataCardId,
          name: marketCards.name,
          num: marketCards.num,
          setName: marketCards.setName,
          setCode: marketCards.setCode,
        })
        .from(marketCards)
        .where(gt(marketCards.pokedataCardId, cursor))
        .orderBy(asc(marketCards.pokedataCardId))
        .limit(BATCH_SIZE)

      if (batchCards.length === 0) break
      await processBatch(batchCards)
    }
  }

  const done = !incomplete && processed >= (job.totalCards || total)
  if (done) {
    await updateJob(jobId!, {
      status: 'completed',
      completedAt: new Date(),
      cursorCardId: cursor,
      processed,
      succeeded,
      failed,
    })
    console.log(`Done. Job ${jobId}: ${succeeded} ok, ${failed} failed, ${processed}/${total}`)
    process.exit(0)
  }

  await updateJob(jobId!, {
    status: 'paused',
    cursorCardId: cursor,
    processed,
    succeeded,
    failed,
  })
  console.log(
    `Paused/incomplete. Job ${jobId}: ${processed}/${total} (${succeeded} ok, ${failed} failed). Re-run with --resume`,
  )
  process.exit(2)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
