import { pgTable, serial, varchar, text, timestamp, boolean, integer, decimal, jsonb } from 'drizzle-orm/pg-core'
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
  pudoAddress: text('pudo_address'), // Full address or locker location for shipping
  pudoLockerCode: varchar('pudo_locker_code', { length: 100 }), // PUDO locker code (e.g. ABC123) for locker-to-locker; pulled into payment form and stored on order for seller
  dateOfBirth: timestamp('date_of_birth'),
  isPremium: boolean('is_premium').default(false),
  isVerified: boolean('is_verified').default(false),
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

// Historical price points per card (one row per fetch for product chart)
export const cardPriceHistory = pgTable('card_price_history', {
  id: serial('id').primaryKey(),
  cardId: text('card_id').notNull(), // Pokedata card ID
  recordedAt: timestamp('recorded_at').defaultNow().notNull(),
  marketPrice: decimal('market_price', { precision: 10, scale: 2 }),
  ebayLastSold: decimal('ebay_last_sold', { precision: 10, scale: 2 }),
  currency: varchar('currency', { length: 10 }).default('USD'),
})

// Store listings (items for sale)
export const storeListings = pgTable('store_listings', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id').references(() => stores.id, { onDelete: 'cascade' }).notNull(),
  collectionId: integer('collection_id').references(() => collections.id, { onDelete: 'set null' }), // which collection item is listed (for accurate "Listed" badge)
  cardId: varchar('card_id', { length: 100 }), // Pokedata card ID (optional, for price cache)
  cardName: varchar('card_name', { length: 255 }).notNull(),
  cardImage: text('card_image'), // URL to card image
  cardImageBack: text('card_image_back'), // Back of card photo
  cardImageClose: text('card_image_close'), // Up close / damage photo
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  vaultingStatus: varchar('vaulting_status', { length: 50 }).default('seller-has'), // 'vaulted', 'seller-has', 'vaulting-in-process', 'unverified'
  purchaseType: varchar('purchase_type', { length: 50 }).default('both'), // 'instant', 'auction', 'both'
  currentBid: decimal('current_bid', { precision: 10, scale: 2 }),
  bidCount: integer('bid_count').default(0),
  description: text('description'),
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
export type Account = typeof accounts.$inferSelect
export type NewAccount = typeof accounts.$inferInsert
export type VerificationToken = typeof verificationTokens.$inferSelect
export type NewVerificationToken = typeof verificationTokens.$inferInsert
