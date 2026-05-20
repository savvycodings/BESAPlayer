import { pgTable, serial, varchar, text, timestamp, boolean, integer, decimal, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// Users table with comprehensive profile information
// Note: Better Auth uses string IDs, so we use text instead of serial
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(), // Better Auth uses text, not varchar
  password: varchar('password', { length: 255 }), // Temporarily nullable - Better Auth should populate this
  name: text('name').notNull(), // Better Auth requires name to be notNull and text
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
  username: varchar('username', { length: 100 }).unique(),
  phone: varchar('phone', { length: 20 }),
  avatar: text('avatar'), // URL to profile image (Better Auth calls this "image")
  image: text('image'), // Better Auth expects "image" field (alias for avatar)
  bio: text('bio'), // User bio/description
  location: varchar('location', { length: 255 }),
  /** Chosen PUDO locker: code used as terminal_id for L2L/D2L (e.g. CG54). Set at sign-up or in settings. */
  pudoLockerCode: varchar('pudo_locker_code', { length: 100 }),
  /** Human-readable locker name (e.g. Sasol Rivonia Uplifted). For display and processing. */
  pudoLockerName: varchar('pudo_locker_name', { length: 255 }),
  /** Full address or locker location for shipping (e.g. 375 Rivonia Rd, Rivonia, Sandton). */
  pudoAddress: text('pudo_address'),
  dateOfBirth: timestamp('date_of_birth'),
  isPremium: boolean('is_premium').default(false),
  isVerified: boolean('is_verified').default(false),
  /** Present on some DBs; keep in schema so drizzle-kit push does not drop it */
  isAdmin: boolean('is_admin').default(false),
  level: integer('level').default(0), // Start at level 0 for new users
  currentXP: integer('current_xp').default(0),
  xpToNextLevel: integer('xp_to_next_level').default(100),
  portfolioValue: decimal('portfolio_value', { precision: 10, scale: 2 }).default('0'),
  // Social links
  website: varchar('website', { length: 255 }),
  twitter: varchar('twitter', { length: 100 }),
  instagram: varchar('instagram', { length: 100 }),
  // Preferences
  preferences: jsonb('preferences').$type<{
    theme?: string
    notifications?: boolean
    language?: string
  }>(),
  /** Expo push token for sending notifications (e.g. dropoff code ready) */
  expoPushToken: text('expo_push_token'),
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(), // Better Auth uses $onUpdate
  lastLoginAt: timestamp('last_login_at'),
  // Better Auth required fields
  emailVerified: boolean('email_verified').notNull().default(false),
  emailVerifiedAt: timestamp('email_verified_at'),
})

// User collections (cards, sealed products, slabs)
export const collections = pgTable('collections', {
  id: serial('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  type: varchar('type', { length: 50 }).notNull(), // 'card', 'sealed', 'slab'
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  image: text('image'), // URL to item image
  cardId: varchar('card_id', { length: 100 }), // Pokedata card ID
  set: varchar('set', { length: 255 }), // Set name (e.g., 'Obsidian Flames', 'Hidden Fates')
  cardNumber: varchar('card_number', { length: 50 }), // Card number in set (e.g. 161) for images.pokemontcg.io
  condition: varchar('condition', { length: 50 }), // 'mint', 'near_mint', 'excellent', etc.
  grade: integer('grade'), // PSA/BGS grade if slabbed
  estimatedValue: decimal('estimated_value', { precision: 10, scale: 2 }),
  purchasePrice: decimal('purchase_price', { precision: 10, scale: 2 }),
  purchaseDate: timestamp('purchase_date'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(), // Better Auth uses $onUpdate
})

// User store/seller information
export const stores = pgTable('stores', {
  id: serial('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
  storeName: varchar('store_name', { length: 255 }),
  description: text('description'),
  bannerUrl: text('banner_url'),
  profileImage: text('profile_image'),
  verificationLevel: varchar('verification_level', { length: 50 }).default('unverified'), // 'bronze', 'silver', 'gold', 'platinum', 'diamond'
  totalSales: integer('total_sales').default(0),
  rating: decimal('rating', { precision: 3, scale: 2 }).default('0'),
  totalReviews: integer('total_reviews').default(0),
  isActive: boolean('is_active').default(true),
  twitchUrl: text('twitch_url'),
  youtubeUrl: text('youtube_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(), // Better Auth uses $onUpdate
})

// User followers (many-to-many relationship)
export const followers = pgTable('followers', {
  id: serial('id').primaryKey(),
  followerId: text('follower_id').references(() => users.id, { onDelete: 'cascade' }).notNull(), // User who is following
  followingId: text('following_id').references(() => users.id, { onDelete: 'cascade' }).notNull(), // User being followed
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// User sessions (for Better Auth compatibility)
// Better Auth expects: id (text), token (text), expiresAt, createdAt, updatedAt, ipAddress, userAgent, userId
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(), // Better Auth uses text IDs, not serial
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  token: text('token').notNull().unique(), // Better Auth uses text, not varchar
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: text('ip_address'), // Better Auth uses text
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
})

// Accounts table (required by Better Auth for OAuth/account linking and email/password)
// Better Auth stores passwords in the account table, not the user table
export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  accountId: text('account_id').notNull(), // Better Auth uses text
  providerId: text('provider_id').notNull(), // Better Auth uses text
  password: text('password'), // Password for email/password auth
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'), // Missing field!
  accessTokenExpiresAt: timestamp('access_token_expires_at'), // Missing field!
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'), // Missing field!
  scope: text('scope'), // Missing field!
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
})

// Verification tokens (for email verification, password reset, etc.)
// Better Auth expects: id, identifier, value (not token!), expiresAt, createdAt, updatedAt
export const verificationTokens = pgTable('verification_tokens', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(), // Better Auth uses text
  value: text('value').notNull().unique(), // Better Auth uses "value" not "token"!
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(), // Missing field!
})

/** Local catalog of Pokémon sets (synced from Pokedata via pnpm run update-db). Market UI reads this only. */
export const marketSets = pgTable('market_sets', {
  pokedataSetId: integer('pokedata_set_id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  code: varchar('code', { length: 32 }),
  language: varchar('language', { length: 20 }).notNull().default('ENGLISH'),
  releaseDate: timestamp('release_date'),
  tcg: varchar('tcg', { length: 50 }),
  /** Number of cards in market_cards for this set (synced from Pokedata /v0/set). */
  cardCount: integer('card_count').notNull().default(0),
  /** When cards-in-set were last synced (null = never). */
  cardsSyncedAt: timestamp('cards_synced_at'),
  /** images.pokemontcg.io set id when name matches pokemonTcgSets.json */
  tcgSetId: varchar('tcg_set_id', { length: 32 }),
  lastSyncedAt: timestamp('last_synced_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
})

/** Cards in a set — synced one set at a time via pnpm run fetch-set-cards (5 credits/set). */
export const marketCards = pgTable(
  'market_cards',
  {
    pokedataCardId: integer('pokedata_card_id').primaryKey(),
    pokedataSetId: integer('pokedata_set_id')
      .notNull()
      .references(() => marketSets.pokedataSetId, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    num: varchar('num', { length: 32 }).notNull(),
    language: varchar('language', { length: 20 }).notNull().default('ENGLISH'),
    setCode: varchar('set_code', { length: 32 }),
    setName: varchar('set_name', { length: 255 }),
    secret: boolean('secret').default(false).notNull(),
    releaseDate: timestamp('release_date'),
    lastSyncedAt: timestamp('last_synced_at').defaultNow().notNull(),
    /** Last successful daily price sync (from sync-card-prices job). */
    lastPriceSyncedAt: timestamp('last_price_synced_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    setIdIdx: index('market_cards_set_id_idx').on(table.pokedataSetId),
    setNumIdx: index('market_cards_set_num_idx').on(table.pokedataSetId, table.num),
    nameIdx: index('market_cards_name_idx').on(table.name),
  }),
)

// Cached Pokedata search results (same query within TTL = no API call)
export const pokedataSearchCache = pgTable('pokedata_search_cache', {
  cacheKey: text('cache_key').primaryKey(), // normalized: query|assetType|language
  results: jsonb('results').$type<{ id: string; name?: string; set?: string; number?: string }[]>().notNull(),
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
})

// Cached card prices from Pokedata (eco-friendly: avoid API until 48h old)
export const cardPrices = pgTable('card_prices', {
  id: text('id').primaryKey(), // Pokedata card ID
  cardName: varchar('card_name', { length: 255 }),
  setName: varchar('set_name', { length: 255 }),
  setId: varchar('set_id', { length: 100 }), // e.g. swsh12 for images.pokemontcg.io
  cardNumber: varchar('card_number', { length: 50 }), // e.g. 127 for images.pokemontcg.io
  imageUrl: text('image_url'), // Resolved images.pokemontcg.io URL (set once, reused everywhere)
  marketPrice: decimal('market_price', { precision: 10, scale: 2 }), // TCGPlayer or CardMkt
  ebayLastSold: decimal('ebay_last_sold', { precision: 10, scale: 2 }), // eBay Raw
  currency: varchar('currency', { length: 10 }).default('USD'),
  lastFetchedAt: timestamp('last_fetched_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
})

// Historical price points per card — one row per card per calendar day (we build history internally; Pokedata gives only today's price)
export const cardPriceHistory = pgTable('card_price_history', {
  id: serial('id').primaryKey(),
  cardId: text('card_id').notNull(), // Pokedata card ID
  recordedAt: timestamp('recorded_at').defaultNow().notNull(),
  /** Calendar day (YYYY-MM-DD) so we store at most one row per card per day from client-driven lookups */
  recordedDate: varchar('recorded_date', { length: 10 }).notNull(),
  marketPrice: decimal('market_price', { precision: 10, scale: 2 }),
  ebayLastSold: decimal('ebay_last_sold', { precision: 10, scale: 2 }),
  currency: varchar('currency', { length: 10 }).default('USD'),
}, (t) => ({
  cardDateUnique: uniqueIndex('card_price_history_card_date_unique').on(t.cardId, t.recordedDate),
}))

/** Daily bulk price sync over market_cards (checkpointed, cron-friendly). */
export const priceSyncJobs = pgTable('price_sync_jobs', {
  id: varchar('id', { length: 36 }).primaryKey(),
  recordedDate: varchar('recorded_date', { length: 10 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending|running|paused|completed|failed
  cursorCardId: integer('cursor_card_id').notNull().default(0),
  totalCards: integer('total_cards').notNull().default(0),
  processed: integer('processed').notNull().default(0),
  succeeded: integer('succeeded').notNull().default(0),
  failed: integer('failed').notNull().default(0),
  errorSummary: text('error_summary'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
}, (t) => ({
  recordedDateIdx: index('price_sync_jobs_recorded_date_idx').on(t.recordedDate),
  statusIdx: index('price_sync_jobs_status_idx').on(t.status),
}))

export const priceSyncFailures = pgTable(
  'price_sync_failures',
  {
    id: serial('id').primaryKey(),
    jobId: varchar('job_id', { length: 36 })
      .notNull()
      .references(() => priceSyncJobs.id, { onDelete: 'cascade' }),
    pokedataCardId: integer('pokedata_card_id').notNull(),
    error: text('error').notNull(),
    attempts: integer('attempts').notNull().default(1),
    lastAttemptAt: timestamp('last_attempt_at').defaultNow().notNull(),
  },
  (t) => ({
    jobCardUnique: uniqueIndex('price_sync_failures_job_card_unique').on(t.jobId, t.pokedataCardId),
  }),
)

// Store listings (items for sale)
export const storeListings = pgTable('store_listings', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').references(() => stores.id, { onDelete: 'cascade' }).notNull(),
  collectionId: integer('collection_id').references(() => collections.id, { onDelete: 'set null' }), // which collection item is listed (for accurate "Listed" badge)
  cardId: varchar('card_id', { length: 100 }), // Pokedata card ID (optional, for price cache)
  /** Legacy DB column (alias of card_id on some rows) */
  pokedataId: varchar('pokedata_id', { length: 100 }),
  cardName: varchar('card_name', { length: 255 }).notNull(),
  /** Optional listing condition when not linked to a collection row */
  condition: varchar('condition', { length: 50 }),
  costPriceZar: decimal('cost_price_zar', { precision: 10, scale: 2 }),
  cardImage: text('card_image'), // URL to card image
  cardImageBack: text('card_image_back'), // Back of card photo
  cardImageClose: text('card_image_close'), // Up close / damage photo
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  vaultingStatus: varchar('vaulting_status', { length: 50 }).default('seller-has'), // 'vaulted', 'seller-has', 'vaulting-in-process', 'unverified'
  purchaseType: varchar('purchase_type', { length: 50 }).default('both'), // 'instant', 'auction', 'both'
  currentBid: decimal('current_bid', { precision: 10, scale: 2 }),
  bidCount: integer('bid_count').default(0),
  description: text('description'),
  quantity: integer('quantity').default(1).notNull(),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(), // Better Auth uses $onUpdate
})

// Listing bids: one row per bid so we can show who bid what (listing + bidder + amount)
export const listingBids = pgTable('listing_bids', {
  id: serial('id').primaryKey(),
  listingId: integer('listing_id').references(() => storeListings.id, { onDelete: 'cascade' }).notNull(),
  bidderId: text('bidder_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Orders
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').references(() => stores.id, { onDelete: 'cascade' }).notNull(),
  buyerId: text('buyer_id').references(() => users.id).notNull(),
  itemName: varchar('item_name', { length: 255 }).notNull(),
  itemImage: text('item_image'),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(), // total paid (item + shipping)
  quantity: integer('quantity').default(1),
  shippingFeeZar: decimal('shipping_fee_zar', { precision: 10, scale: 2 }).default('100.00'),
  orderDate: timestamp('order_date').defaultNow().notNull(),
  status: varchar('status', { length: 50 }).default('processing'), // 'processing', 'shipped', 'completed', 'cancelled'
  trackingStatus: varchar('tracking_status', { length: 50 }).default('order_placed'), // 'order_placed' | 'deposited' | 'in_transit' | 'delivered'
  orderNumber: varchar('order_number', { length: 100 }).notNull().unique(),
  /** PUDO locker-to-locker: buyer's locker code for delivery */
  buyerPudoLockerCode: varchar('buyer_pudo_locker_code', { length: 100 }),
  /** Full address or locker name/location for shipping */
  buyerShippingAddress: text('buyer_shipping_address'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(), // Better Auth uses $onUpdate
})

// Auctions
export const auctions = pgTable('auctions', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').references(() => stores.id, { onDelete: 'cascade' }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time'),
  status: varchar('status', { length: 50 }).default('starting'), // 'starting', 'live', 'ended', 'cancelled'
  currentBid: decimal('current_bid', { precision: 10, scale: 2 }),
  bidCount: integer('bid_count').default(0),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(), // Better Auth uses $onUpdate
})

// ISO (In Search Of) items
export const isoItems = pgTable('iso_items', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').references(() => stores.id, { onDelete: 'cascade' }).notNull(),
  cardName: varchar('card_name', { length: 255 }).notNull(),
  cardNumber: varchar('card_number', { length: 50 }),
  set: varchar('set', { length: 255 }),
  image: text('image'), // URL to card image
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(), // Better Auth uses $onUpdate
})

// Store reviews: buyer feedback after completed orders
export const storeReviews = pgTable('store_reviews', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').references(() => stores.id, { onDelete: 'cascade' }).notNull(),
  buyerId: text('buyer_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  orderId: integer('order_id').references(() => orders.id, { onDelete: 'set null' }),
  rating: integer('rating').notNull(), // 1–5 stars
  comment: text('comment'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Vaulted requests - for cards that need to be vaulted before selling
export const vaultedRequests = pgTable('vaulted_requests', {
  id: serial('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  collectionId: integer('collection_id').references(() => collections.id, { onDelete: 'cascade' }),
  cardName: varchar('card_name', { length: 255 }).notNull(),
  cardImage: text('card_image'), // URL to card image
  set: varchar('set', { length: 255 }),
  status: varchar('status', { length: 50 }).default('pending'), // 'pending', 'approved', 'vaulted', 'rejected'
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(), // Better Auth uses $onUpdate
})

// Verification orders - one per R100 payment for verification; links to vaulted_requests for courier/ops
export const verificationOrders = pgTable('verification_orders', {
  id: serial('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  paymentId: varchar('payment_id', { length: 100 }).notNull().unique(), // PayFast m_payment_id
  amount: decimal('amount', { precision: 10, scale: 2 }).default('100.00'),
  userEmail: varchar('user_email', { length: 255 }),
  userName: varchar('user_name', { length: 255 }), // Full name for courier
  pudoLockerCode: varchar('pudo_locker_code', { length: 100 }),
  pudoAddress: text('pudo_address'),
  dropoffCode: varchar('dropoff_code', { length: 50 }), // Code user gets to drop off at Pudo (e.g. 24h window)
  trackingStatus: varchar('tracking_status', { length: 50 }).default('pending_dropoff'), // pending_dropoff | deposited | in_transit | verified
  expiresAt: timestamp('expires_at'), // e.g. 24h from payment for user to drop off
  paidAt: timestamp('paid_at'),
  /** When the user first saw the dropoff code in the app (for "new" badge, no push needed) */
  userSeenDropoffCodeAt: timestamp('user_seen_dropoff_code_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
})

// Which vaulted_requests are included in a verification order (one payment can cover multiple cards)
export const verificationOrderItems = pgTable('verification_order_items', {
  id: serial('id').primaryKey(),
  verificationOrderId: integer('verification_order_id').references(() => verificationOrders.id, { onDelete: 'cascade' }).notNull(),
  vaultedRequestId: integer('vaulted_request_id').references(() => vaultedRequests.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  collections: many(collections),
  store: one(stores),
  sessions: many(sessions),
  followers: many(followers, {
    relationName: 'followers',
  }),
  following: many(followers, {
    relationName: 'following',
  }),
}))

export const collectionsRelations = relations(collections, ({ one }) => ({
  user: one(users, {
    fields: [collections.userId],
    references: [users.id],
  }),
}))

export const storesRelations = relations(stores, ({ one, many }) => ({
  user: one(users, {
    fields: [stores.userId],
    references: [users.id],
  }),
  listings: many(storeListings),
  orders: many(orders),
  auctions: many(auctions),
  isoItems: many(isoItems),
  reviews: many(storeReviews),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}))

export const storeListingsRelations = relations(storeListings, ({ one, many }) => ({
  store: one(stores, {
    fields: [storeListings.storeId],
    references: [stores.id],
  }),
  bids: many(listingBids),
}))

export const listingBidsRelations = relations(listingBids, ({ one }) => ({
  listing: one(storeListings, {
    fields: [listingBids.listingId],
    references: [storeListings.id],
  }),
  bidder: one(users, {
    fields: [listingBids.bidderId],
    references: [users.id],
  }),
}))

export const ordersRelations = relations(orders, ({ one }) => ({
  store: one(stores, {
    fields: [orders.storeId],
    references: [stores.id],
  }),
  buyer: one(users, {
    fields: [orders.buyerId],
    references: [users.id],
  }),
}))

export const storeReviewsRelations = relations(storeReviews, ({ one }) => ({
  store: one(stores, {
    fields: [storeReviews.storeId],
    references: [stores.id],
  }),
  buyer: one(users, {
    fields: [storeReviews.buyerId],
    references: [users.id],
  }),
  order: one(orders, {
    fields: [storeReviews.orderId],
    references: [orders.id],
  }),
}))

export const auctionsRelations = relations(auctions, ({ one }) => ({
  store: one(stores, {
    fields: [auctions.storeId],
    references: [stores.id],
  }),
}))

export const isoItemsRelations = relations(isoItems, ({ one }) => ({
  store: one(stores, {
    fields: [isoItems.storeId],
    references: [stores.id],
  }),
}))

export const vaultedRequestsRelations = relations(vaultedRequests, ({ one }) => ({
  user: one(users, {
    fields: [vaultedRequests.userId],
    references: [users.id],
  }),
  collection: one(collections, {
    fields: [vaultedRequests.collectionId],
    references: [collections.id],
  }),
}))

export const verificationOrdersRelations = relations(verificationOrders, ({ one, many }) => ({
  user: one(users, { fields: [verificationOrders.userId], references: [users.id] }),
  items: many(verificationOrderItems),
}))

export const verificationOrderItemsRelations = relations(verificationOrderItems, ({ one }) => ({
  verificationOrder: one(verificationOrders, { fields: [verificationOrderItems.verificationOrderId], references: [verificationOrders.id] }),
  vaultedRequest: one(vaultedRequests, { fields: [verificationOrderItems.vaultedRequestId], references: [vaultedRequests.id] }),
}))

export const followersRelations = relations(followers, ({ one }) => ({
  follower: one(users, {
    fields: [followers.followerId],
    references: [users.id],
    relationName: 'followers',
  }),
  following: one(users, {
    fields: [followers.followingId],
    references: [users.id],
    relationName: 'following',
  }),
}))

// Type exports for TypeScript
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Collection = typeof collections.$inferSelect
export type NewCollection = typeof collections.$inferInsert
export type Store = typeof stores.$inferSelect
export type NewStore = typeof stores.$inferInsert
export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
export type CardPrice = typeof cardPrices.$inferSelect
export type NewCardPrice = typeof cardPrices.$inferInsert
export type CardPriceHistory = typeof cardPriceHistory.$inferSelect
export type NewCardPriceHistory = typeof cardPriceHistory.$inferInsert
export type StoreListing = typeof storeListings.$inferSelect
export type NewStoreListing = typeof storeListings.$inferInsert
export type ListingBid = typeof listingBids.$inferSelect
export type NewListingBid = typeof listingBids.$inferInsert
export type Order = typeof orders.$inferSelect
export type NewOrder = typeof orders.$inferInsert
export type Auction = typeof auctions.$inferSelect
export type NewAuction = typeof auctions.$inferInsert
export type ISOItem = typeof isoItems.$inferSelect
export type NewISOItem = typeof isoItems.$inferInsert
export type Follower = typeof followers.$inferSelect
export type NewFollower = typeof followers.$inferInsert
export type VaultedRequest = typeof vaultedRequests.$inferSelect
export type NewVaultedRequest = typeof vaultedRequests.$inferInsert
export type VerificationOrder = typeof verificationOrders.$inferSelect
export type NewVerificationOrder = typeof verificationOrders.$inferInsert
export type VerificationOrderItem = typeof verificationOrderItems.$inferSelect
export type NewVerificationOrderItem = typeof verificationOrderItems.$inferInsert
export type Account = typeof accounts.$inferSelect
export type NewAccount = typeof accounts.$inferInsert
export type VerificationToken = typeof verificationTokens.$inferSelect
export type NewVerificationToken = typeof verificationTokens.$inferInsert
export type StoreReview = typeof storeReviews.$inferSelect
export type NewStoreReview = typeof storeReviews.$inferInsert
