/**
 * Rewards and leveling: grant XP to buyer and seller on sale, level up users,
 * and update store verification (rings) by sales count.
 */

import { db, users, stores } from '../db'
import { eq } from 'drizzle-orm'

/** XP granted to the buyer for completing a purchase */
export const XP_PER_SALE_BUYER = 15

/** XP granted to the seller for completing a sale */
export const XP_PER_SALE_SELLER = 15

/** XP required to go from level 0 → 1. Then level N → N+1 uses getXpToNextLevelForLevel(N). */
const BASE_XP = 100

/** Extra XP needed per level (e.g. level 1→2 = 100+50 = 150, 2→3 = 200, ...) */
const XP_PER_LEVEL_STEP = 50

/**
 * Returns the XP required to reach the next level from the given level.
 * Level 0 → 1 = BASE_XP (100), Level 1 → 2 = 150, 2 → 3 = 200, etc.
 */
export function getXpToNextLevelForLevel(level: number): number {
  return BASE_XP + level * XP_PER_LEVEL_STEP
}

/** Store verification (rings) by total sales count. Must match app VERIFICATION_THRESHOLDS. */
const VERIFICATION_BY_SALES: { minSales: number; level: string }[] = [
  { minSales: 50, level: 'diamond' },
  { minSales: 31, level: 'platinum' },
  { minSales: 16, level: 'gold' },
  { minSales: 6, level: 'silver' },
  { minSales: 1, level: 'bronze' },
]

/**
 * Grant XP to a user and level them up if they reach xpToNextLevel.
 * Can be called for both buyer and seller after a completed sale.
 */
export async function grantXpToUser(userId: string, xpToAdd: number): Promise<void> {
  if (xpToAdd <= 0) return

  const [user] = await db.select({
    level: users.level,
    currentXP: users.currentXP,
    xpToNextLevel: users.xpToNextLevel,
  })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) {
    console.warn('[REWARDS] User not found for XP grant:', userId)
    return
  }

  const level = user.level ?? 0
  const currentXP = user.currentXP ?? 0
  let xpToNextLevel = user.xpToNextLevel ?? BASE_XP

  let newXP = currentXP + xpToAdd
  let newLevel = level

  // Level up as long as we meet the threshold
  while (newXP >= xpToNextLevel) {
    newXP -= xpToNextLevel
    newLevel += 1
    xpToNextLevel = getXpToNextLevelForLevel(newLevel)
  }

  await db.update(users)
    .set({
      level: newLevel,
      currentXP: newXP,
      xpToNextLevel,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))

  console.log('[REWARDS] XP granted:', { userId, xpToAdd, newLevel, newXP, xpToNextLevel })
}

/**
 * Set the store's verificationLevel (rank/rings) based on its totalSales count.
 * Call after incrementing totalSales so the ring tier updates (bronze → silver → gold → platinum → diamond).
 * Does NOT set to 'unverified' when totalSales is 0 — leaves existing level so manually verified stores keep their rank.
 */
export async function updateStoreVerificationLevel(storeId: number): Promise<void> {
  const [store] = await db.select({
    totalSales: stores.totalSales,
    verificationLevel: stores.verificationLevel,
  })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1)

  if (!store) {
    console.warn('[REWARDS] Store not found for verification update:', storeId)
    return
  }

  const totalSales = store.totalSales ?? 0
  let verificationLevel: string | null = null

  for (const { minSales, level } of VERIFICATION_BY_SALES) {
    if (totalSales >= minSales) {
      verificationLevel = level
      break
    }
  }

  // Only update when we have a tier from sales; never overwrite with 'unverified' (preserves manual verification)
  if (verificationLevel === null) {
    console.log('[REWARDS] Store verification unchanged (totalSales < 1):', { storeId, totalSales, currentLevel: store.verificationLevel })
    return
  }

  await db.update(stores)
    .set({
      verificationLevel,
      updatedAt: new Date(),
    })
    .where(eq(stores.id, storeId))

  console.log('[REWARDS] Store verification updated:', { storeId, totalSales, verificationLevel })
}

/**
 * Apply rewards for a completed sale: grant XP to buyer and seller, level them up,
 * and update the seller's store verification level (rings).
 * Call this after creating the order and incrementing store totalSales.
 */
export async function applySaleRewards(params: {
  buyerId: string
  sellerId: string
  storeId: number
}): Promise<void> {
  const { buyerId, sellerId, storeId } = params

  try {
    await grantXpToUser(buyerId, XP_PER_SALE_BUYER)
    await grantXpToUser(sellerId, XP_PER_SALE_SELLER)
    await updateStoreVerificationLevel(storeId)
  } catch (error: any) {
    console.error('[REWARDS] Error applying sale rewards:', error?.message || error)
    // Don't throw – order and totalSales are already committed; rewards are best-effort
  }
}
