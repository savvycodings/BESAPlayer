import express from 'express'
import { db, users, stores, storeListings, orders, auctions, isoItems, sessions, collections, followers, vaultedRequests, pool } from '../db'
import { eq, and, count, sql, inArray, or, like, ilike, isNotNull, desc } from 'drizzle-orm'
import { auth } from '../auth/auth'
import { fromNodeHeaders } from 'better-auth/node'

const router = express.Router()

// Helper function to get user from Better Auth session
async function getUserFromSession(req: express.Request) {
  try {
    // Get session from Better Auth using cookies
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers)
    })

    if (!session?.user) {
      return null
    }

    // Get full user data from database
    const [user] = await db.select()
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1)

    return user || null
  } catch (error) {
    console.error('Error getting user from session:', error)
    return null
  }
}

// Helper function to get user from Better Auth session token (for mobile/Expo)
async function getUserFromSessionToken(token: string) {
  try {
    // Better Auth stores session tokens in the sessions table
    // The token field contains the session token
    const [session] = await db.select({
      userId: sessions.userId,
      expiresAt: sessions.expiresAt,
    })
      .from(sessions)
      .where(eq(sessions.token, token))
      .limit(1)

    if (!session) return null

    // Check if session is expired
    if (new Date() > new Date(session.expiresAt)) {
      return null
    }

    // Get user from database
    const [user] = await db.select()
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1)

    return user || null
  } catch (error) {
    console.error('Error getting user from session token:', error)
    return null
  }
}

// Middleware to authenticate requests using Better Auth
async function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
  // Try Better Auth session first (from cookies - works on web)
  let user = await getUserFromSession(req)

  // If no user from cookies, try Bearer token (for mobile/Expo)
  if (!user) {
    const authHeader = req.headers.authorization
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '')
      user = await getUserFromSessionToken(token)
    }
  }

  // Fallback to old token system for backward compatibility
  if (!user) {
    const token = req.body.token || req.query.token
    if (token) {
      user = await getUserFromSessionToken(token)
    }
  }

  if (!user) {
    return res.status(401).json({ message: 'Authentication required' })
  }

  req.user = user
  next()
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: any
    }
  }
}

// GET /api/store - Get user's store or return null if doesn't exist
router.get('/api/store', authenticate, async (req, res) => {
  try {
    const [store] = await db.select()
      .from(stores)
      .where(eq(stores.userId, req.user!.id))
      .limit(1)

    if (!store) {
      return res.json({ store: null })
    }

    // Get user info for store display (always use user avatar, not store profileImage)
    const [user] = await db.select({
      firstName: users.firstName,
      lastName: users.lastName,
      name: users.name,
      avatar: users.avatar,
      level: users.level,
      currentXP: users.currentXP,
      xpToNextLevel: users.xpToNextLevel,
    })
      .from(users)
      .where(eq(users.id, req.user!.id))
      .limit(1)

    res.json({
      store: {
        ...store,
        user: user || null,
        // Override profileImage with user avatar for consistency
        profileImage: user?.avatar || store.profileImage,
      }
    })
  } catch (error: any) {
    console.error('Get store error:', error)
    res.status(500).json({ message: 'Internal server error', error: error.message })
  }
})

// POST /api/store - Create a new store for the user
router.post('/api/store', authenticate, async (req, res) => {
  try {
    const { storeName, description, bannerUrl, profileImage } = req.body

    // Check if store already exists
    const [existingStore] = await db.select()
      .from(stores)
      .where(eq(stores.userId, req.user!.id))
      .limit(1)

    if (existingStore) {
      return res.status(400).json({ message: 'Store already exists for this user' })
    }

    // Get user's name for default store name
    const [user] = await db.select({
      firstName: users.firstName,
      lastName: users.lastName,
      name: users.name,
      avatar: users.avatar,
    })
      .from(users)
      .where(eq(users.id, req.user!.id))
      .limit(1)

    const defaultStoreName = storeName || `${user?.firstName || user?.name || 'User'}'s Card Shop`

    // Create store (use user avatar as profileImage)
    const [newStore] = await db.insert(stores).values({
      userId: req.user!.id,
      storeName: defaultStoreName,
      description: description || null,
      bannerUrl: bannerUrl || null,
      profileImage: profileImage || user?.avatar || null, // Use user avatar as default
      isActive: true,
    }).returning()

    res.json({
      success: true,
      store: newStore,
    })
  } catch (error: any) {
    console.error('Create store error:', error)
    res.status(500).json({ message: 'Internal server error', error: error.message })
  }
})

// PUT /api/store - Update store information
router.put('/api/store', authenticate, async (req, res) => {
  try {
    const { storeName, description, bannerUrl, profileImage } = req.body

    // Get existing store
    const [existingStore] = await db.select()
      .from(stores)
      .where(eq(stores.userId, req.user!.id))
      .limit(1)

    if (!existingStore) {
      return res.status(404).json({ message: 'Store not found' })
    }

    // Update store (don't update profileImage here - it should come from user avatar)
    const [updatedStore] = await db.update(stores)
      .set({
        storeName: storeName || existingStore.storeName,
        description: description !== undefined ? description : existingStore.description,
        bannerUrl: bannerUrl !== undefined ? bannerUrl : existingStore.bannerUrl,
        // Note: profileImage is now managed via user avatar, but we keep it in sync
        profileImage: profileImage !== undefined ? profileImage : existingStore.profileImage,
        updatedAt: new Date(),
      })
      .where(eq(stores.id, existingStore.id))
      .returning()

    // If profileImage was updated, also update user avatar to keep in sync
    if (profileImage !== undefined) {
      await db.update(users)
        .set({
          avatar: profileImage,
          updatedAt: new Date(),
        })
        .where(eq(users.id, req.user!.id))
    }

    res.json({
      success: true,
      store: updatedStore,
    })
  } catch (error: any) {
    console.error('Update store error:', error)
    res.status(500).json({ message: 'Internal server error', error: error.message })
  }
})

// GET /api/store/listings - Get all listings for user's store
router.get('/api/store/listings', authenticate, async (req, res) => {
  try {
    const [store] = await db.select()
      .from(stores)
      .where(eq(stores.userId, req.user!.id))
      .limit(1)

    if (!store) {
      return res.status(404).json({ message: 'Store not found' })
    }

    const listings = await db.select()
      .from(storeListings)
      .where(and(
        eq(storeListings.storeId, store.id),
        eq(storeListings.isActive, true)
      ))
      .orderBy(storeListings.createdAt)

    // Check vaulting requests for each listing and update status if needed
    const listingsWithVaultingStatus = await Promise.all(
      listings.map(async (listing) => {
        // Check if there's a vaulting request for this card
        const [vaultingRequest] = await db.select()
          .from(vaultedRequests)
          .where(and(
            eq(vaultedRequests.userId, req.user!.id),
            eq(vaultedRequests.cardName, listing.cardName)
          ))
          .orderBy(vaultedRequests.createdAt)
          .limit(1)

        let vaultingStatus = listing.vaultingStatus
        if (vaultingRequest) {
          if (vaultingRequest.status === 'vaulted') {
            vaultingStatus = 'vaulted'
          } else if (vaultingRequest.status === 'pending' || vaultingRequest.status === 'approved') {
            vaultingStatus = 'vaulting-in-process'
          }
        }

        return {
          ...listing,
          vaultingStatus,
        }
      })
    )

    res.json({ listings: listingsWithVaultingStatus })
  } catch (error: any) {
    console.error('Get listings error:', error)
    res.status(500).json({ message: 'Internal server error', error: error.message })
  }
})

// POST /api/store/listings - Create a new listing
router.post('/api/store/listings', authenticate, async (req, res) => {
  try {
    const { cardName, cardImage, price, vaultingStatus, purchaseType, description } = req.body

    if (!cardName || !price) {
      return res.status(400).json({ message: 'Card name and price are required' })
    }

    const [store] = await db.select()
      .from(stores)
      .where(eq(stores.userId, req.user!.id))
      .limit(1)

    if (!store) {
      return res.status(404).json({ message: 'Store not found' })
    }

    // Check if there's a vaulting request for this card
    const [vaultingRequest] = await db.select()
      .from(vaultedRequests)
      .where(and(
        eq(vaultedRequests.userId, req.user!.id),
        eq(vaultedRequests.cardName, cardName)
      ))
      .orderBy(vaultedRequests.createdAt)
      .limit(1)

    // Determine vaulting status based on request status
    let finalVaultingStatus = vaultingStatus || 'seller-has'
    if (vaultingRequest) {
      if (vaultingRequest.status === 'vaulted') {
        finalVaultingStatus = 'vaulted'
      } else if (vaultingRequest.status === 'pending' || vaultingRequest.status === 'approved') {
        finalVaultingStatus = 'vaulting-in-process'
      }
    }

    const [newListing] = await db.insert(storeListings).values({
      storeId: store.id,
      cardName,
      cardImage: cardImage || null,
      price: price.toString(),
      vaultingStatus: finalVaultingStatus,
      purchaseType: purchaseType || 'both',
      description: description || null,
      isActive: true,
    }).returning()

    res.json({
      success: true,
      listing: newListing,
    })
  } catch (error: any) {
    console.error('Create listing error:', error)
    res.status(500).json({ message: 'Internal server error', error: error.message })
  }
})

// PUT /api/store/listings/:id - Update a listing
router.put('/api/store/listings/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params
    const { cardName, cardImage, price, vaultingStatus, purchaseType, description, isActive } = req.body

    const [store] = await db.select()
      .from(stores)
      .where(eq(stores.userId, req.user!.id))
      .limit(1)

    if (!store) {
      return res.status(404).json({ message: 'Store not found' })
    }

    // Verify listing belongs to user's store
    const [listing] = await db.select()
      .from(storeListings)
      .where(and(
        eq(storeListings.id, parseInt(id)),
        eq(storeListings.storeId, store.id)
      ))
      .limit(1)

    if (!listing) {
      return res.status(404).json({ message: 'Listing not found' })
    }

    const [updatedListing] = await db.update(storeListings)
      .set({
        cardName: cardName || listing.cardName,
        cardImage: cardImage !== undefined ? cardImage : listing.cardImage,
        price: price ? price.toString() : listing.price,
        vaultingStatus: vaultingStatus || listing.vaultingStatus,
        purchaseType: purchaseType || listing.purchaseType,
        description: description !== undefined ? description : listing.description,
        isActive: isActive !== undefined ? isActive : listing.isActive,
        updatedAt: new Date(),
      })
      .where(eq(storeListings.id, parseInt(id)))
      .returning()

    res.json({
      success: true,
      listing: updatedListing,
    })
  } catch (error: any) {
    console.error('Update listing error:', error)
    res.status(500).json({ message: 'Internal server error', error: error.message })
  }
})

// GET /api/store/orders - Get all orders for user's store
router.get('/api/store/orders', authenticate, async (req, res) => {
  try {
    const [store] = await db.select()
      .from(stores)
      .where(eq(stores.userId, req.user!.id))
      .limit(1)

    if (!store) {
      return res.status(404).json({ message: 'Store not found' })
    }

    const ordersList = await db.select()
      .from(orders)
      .where(eq(orders.storeId, store.id))
      .orderBy(orders.orderDate)

    res.json({ orders: ordersList })
  } catch (error: any) {
    console.error('Get orders error:', error)
    res.status(500).json({ message: 'Internal server error', error: error.message })
  }
})

// GET /api/store/auctions - Get all auctions for user's store
router.get('/api/store/auctions', authenticate, async (req, res) => {
  try {
    const [store] = await db.select()
      .from(stores)
      .where(eq(stores.userId, req.user!.id))
      .limit(1)

    if (!store) {
      return res.status(404).json({ message: 'Store not found' })
    }

    const auctionsList = await db.select()
      .from(auctions)
      .where(eq(auctions.storeId, store.id))
      .orderBy(auctions.createdAt)

    res.json({ auctions: auctionsList })
  } catch (error: any) {
    console.error('Get auctions error:', error)
    res.status(500).json({ message: 'Internal server error', error: error.message })
  }
})

// POST /api/store/auctions - Create a new auction
router.post('/api/store/auctions', authenticate, async (req, res) => {
  try {
    const { title, description, startTime, image } = req.body

    if (!title || !startTime) {
      return res.status(400).json({ message: 'Title and start time are required' })
    }

    const [store] = await db.select()
      .from(stores)
      .where(eq(stores.userId, req.user!.id))
      .limit(1)

    if (!store) {
      return res.status(404).json({ message: 'Store not found' })
    }

    const [newAuction] = await db.insert(auctions).values({
      storeId: store.id,
      title,
      description: description || null,
      startTime: new Date(startTime),
      status: 'starting',
      image: image || null,
    }).returning()

    res.json({
      success: true,
      auction: newAuction,
    })
  } catch (error: any) {
    console.error('Create auction error:', error)
    res.status(500).json({ message: 'Internal server error', error: error.message })
  }
})

// GET /api/store/iso - Get all ISO items for user's store
router.get('/api/store/iso', authenticate, async (req, res) => {
  try {
    const [store] = await db.select()
      .from(stores)
      .where(eq(stores.userId, req.user!.id))
      .limit(1)

    if (!store) {
      return res.status(404).json({ message: 'Store not found' })
    }

    const isoItemsList = await db.select()
      .from(isoItems)
      .where(and(
        eq(isoItems.storeId, store.id),
        eq(isoItems.isActive, true)
      ))
      .orderBy(isoItems.createdAt)

    res.json({ isoItems: isoItemsList })
  } catch (error: any) {
    console.error('Get ISO items error:', error)
    res.status(500).json({ message: 'Internal server error', error: error.message })
  }
})

// POST /api/store/iso - Create a new ISO item
router.post('/api/store/iso', authenticate, async (req, res) => {
  try {
    const { cardName, cardNumber, set, image } = req.body

    if (!cardName) {
      return res.status(400).json({ message: 'Card name is required' })
    }

    const [store] = await db.select()
      .from(stores)
      .where(eq(stores.userId, req.user!.id))
      .limit(1)

    if (!store) {
      return res.status(404).json({ message: 'Store not found' })
    }

    const [newISO] = await db.insert(isoItems).values({
      storeId: store.id,
      cardName,
      cardNumber: cardNumber || null,
      set: set || null,
      image: image || null,
      isActive: true,
    }).returning()

    res.json({
      success: true,
      isoItem: newISO,
    })
  } catch (error: any) {
    console.error('Create ISO item error:', error)
    res.status(500).json({ message: 'Internal server error', error: error.message })
  }
})

// POST /api/profile/collections - Add a new collection item (card, sealed, slab)
router.post('/api/profile/collections', authenticate, async (req, res) => {
  try {
    const { type, name, description, image, cardId, set, condition, grade, estimatedValue, purchasePrice, purchaseDate, notes, requestVaulting } = req.body

    if (!type || !name) {
      return res.status(400).json({ message: 'Type and name are required' })
    }

    if (!['card', 'sealed', 'slab'].includes(type)) {
      return res.status(400).json({ message: 'Type must be "card", "sealed", or "slab"' })
    }

    const [newCollection] = await db.insert(collections).values({
      userId: req.user!.id,
      type,
      name,
      description: description || null,
      image: image || null,
      cardId: cardId || null,
      set: set || null,
      condition: condition || null,
      grade: grade || null,
      estimatedValue: estimatedValue ? estimatedValue.toString() : null,
      purchasePrice: purchasePrice ? purchasePrice.toString() : null,
      purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
      notes: notes || null,
    }).returning()

    // If user requested vaulting, create a vaulting request
    if (requestVaulting) {
      await db.insert(vaultedRequests).values({
        userId: req.user!.id,
        collectionId: newCollection.id,
        cardName: name,
        cardImage: image || null,
        set: set || null,
        status: 'pending',
      })
    }

    res.json({
      success: true,
      collection: newCollection,
    })
  } catch (error: any) {
    console.error('Create collection error:', error)
    res.status(500).json({ message: 'Internal server error', error: error.message })
  }
})

// GET /api/profile/collections - Get user's collections
router.get('/api/profile/collections', authenticate, async (req, res) => {
  try {
    const userCollections = await db.select()
      .from(collections)
      .where(eq(collections.userId, req.user!.id))
      .orderBy(collections.createdAt)

    // Get user's store to check for listings
    const [store] = await db.select()
      .from(stores)
      .where(eq(stores.userId, req.user!.id))
      .limit(1)

    // Get all active listings for this user's store
    let activeListings: any[] = []
    if (store) {
      activeListings = await db.select()
        .from(storeListings)
        .where(and(
          eq(storeListings.storeId, store.id),
          eq(storeListings.isActive, true)
        ))
    }

    // Create a map of listed card names for quick lookup
    const listedCardNames = new Set(activeListings.map(listing => listing.cardName.toLowerCase().trim()))

    // Add isListed flag to each collection
    const collectionsWithListedStatus = userCollections.map(collection => ({
      ...collection,
      isListed: listedCardNames.has(collection.name.toLowerCase().trim()),
    }))

    // Calculate stats
    const cards = userCollections.filter(c => c.type === 'card').length
    const sealed = userCollections.filter(c => c.type === 'sealed').length
    const slabs = userCollections.filter(c => c.type === 'slab').length
    const total = userCollections.length

    // Calculate portfolio value
    const portfolioValue = userCollections.reduce((sum, collection) => {
      const value = parseFloat(collection.estimatedValue || collection.purchasePrice || '0')
      return sum + value
    }, 0)

    // Calculate set distribution
    const setMap = new Map<string, number>()
    userCollections.forEach((collection: any) => {
      const setKey = collection.set || collection.type || 'Unknown'
      setMap.set(setKey, (setMap.get(setKey) || 0) + 1)
    })
    
    const setDistribution = Array.from(setMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10) // Top 10 sets

    res.json({
      collections: collectionsWithListedStatus,
      stats: {
        cards,
        sealed,
        slabs,
        total,
      },
      portfolioValue,
      setDistribution,
    })
  } catch (error: any) {
    console.error('Get collections error:', error)
    res.status(500).json({ message: 'Internal server error', error: error.message })
  }
})

// GET /api/profile/user - Get user profile data
router.get('/api/profile/user', authenticate, async (req, res) => {
  try {
    const [user] = await db.select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      name: users.name,
      avatar: users.avatar,
      isPremium: users.isPremium,
      level: users.level,
      currentXP: users.currentXP,
      xpToNextLevel: users.xpToNextLevel,
      portfolioValue: users.portfolioValue,
    })
      .from(users)
      .where(eq(users.id, req.user!.id))
      .limit(1)

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Get followers count
    const [followersResult] = await db.select({ count: count() })
      .from(followers)
      .where(eq(followers.followingId, req.user!.id))

    const followersCount = followersResult?.count || 0

    // Get products count (collections)
    const [productsResult] = await db.select({ count: count() })
      .from(collections)
      .where(eq(collections.userId, req.user!.id))

    const productsCount = productsResult?.count || 0

    // Get sales count (completed orders)
    const [store] = await db.select()
      .from(stores)
      .where(eq(stores.userId, req.user!.id))
      .limit(1)

    let salesCount = 0
    if (store) {
      const [salesResult] = await db.select({ count: count() })
        .from(orders)
        .where(and(
          eq(orders.storeId, store.id),
          eq(orders.status, 'completed')
        ))
      salesCount = salesResult?.count || 0
    }

    res.json({
      user: {
        ...user,
        followersCount,
        productsCount,
        salesCount,
      },
    })
  } catch (error: any) {
    console.error('Get user profile error:', error)
    res.status(500).json({ message: 'Internal server error', error: error.message })
  }
})

// POST /api/profile/vaulting/bulk - Create bulk vaulting requests
router.post('/api/profile/vaulting/bulk', authenticate, async (req, res) => {
  try {
    const { collectionIds } = req.body

    if (!Array.isArray(collectionIds) || collectionIds.length === 0) {
      return res.status(400).json({ message: 'Collection IDs array is required' })
    }

    // Get the collections to verify they belong to the user
    const userCollections = await db.select()
      .from(collections)
      .where(and(
        eq(collections.userId, req.user!.id),
        inArray(collections.id, collectionIds)
      ))

    if (userCollections.length !== collectionIds.length) {
      return res.status(400).json({ message: 'Some collections not found or do not belong to you' })
    }

    // Create vaulting requests for each collection
    const vaultingRequests = userCollections.map(collection => ({
      userId: req.user!.id,
      collectionId: collection.id,
      cardName: collection.name,
      cardImage: collection.image || null,
      set: collection.set || null,
      status: 'pending' as const,
    }))

    const newRequests = await db.insert(vaultedRequests)
      .values(vaultingRequests)
      .returning()

    res.json({
      success: true,
      requests: newRequests,
      count: newRequests.length,
    })
  } catch (error: any) {
    console.error('Create bulk vaulting requests error:', error)
    res.status(500).json({ message: 'Internal server error', error: error.message })
  }
})

// PUT /api/profile/user - Update user profile (including avatar)
router.put('/api/profile/user', authenticate, async (req, res) => {
  try {
    const { avatar, firstName, lastName, name, bio, location } = req.body

    // Get existing user
    const [existingUser] = await db.select()
      .from(users)
      .where(eq(users.id, req.user!.id))
      .limit(1)

    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Update user
    const [updatedUser] = await db.update(users)
      .set({
        avatar: avatar !== undefined ? avatar : existingUser.avatar,
        firstName: firstName !== undefined ? firstName : existingUser.firstName,
        lastName: lastName !== undefined ? lastName : existingUser.lastName,
        name: name !== undefined ? name : existingUser.name,
        bio: bio !== undefined ? bio : existingUser.bio,
        location: location !== undefined ? location : existingUser.location,
        updatedAt: new Date(),
      })
      .where(eq(users.id, req.user!.id))
      .returning({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        name: users.name,
        avatar: users.avatar,
        bio: users.bio,
        location: users.location,
        isPremium: users.isPremium,
        level: users.level,
        currentXP: users.currentXP,
        xpToNextLevel: users.xpToNextLevel,
        portfolioValue: users.portfolioValue,
      })

    // Also update store profileImage if store exists (to keep in sync)
    const [store] = await db.select()
      .from(stores)
      .where(eq(stores.userId, req.user!.id))
      .limit(1)

    if (store && avatar !== undefined) {
      await db.update(stores)
        .set({
          profileImage: avatar,
          updatedAt: new Date(),
        })
        .where(eq(stores.id, store.id))
    }

    res.json({
      success: true,
      user: updatedUser,
    })
  } catch (error: any) {
    console.error('Update user profile error:', error)
    res.status(500).json({ message: 'Internal server error', error: error.message })
  }
})

// GET /api/stores/search - Search for stores (public endpoint)
// IMPORTANT: This must come BEFORE /api/stores/:storeId to avoid route conflicts
router.get('/api/stores/search', async (req, res) => {
  console.log('\n🔍 ========== STORE SEARCH REQUEST RECEIVED ==========')
  console.log('📥 Request received at:', new Date().toISOString())
  console.log('📦 Request query:', req.query)
  
  try {
    const { q, limit = '20' } = req.query
    const searchQuery = typeof q === 'string' ? q.trim() : ''
    const limitNum = parseInt(limit as string, 10) || 20

    console.log('🔍 Searching for stores with query:', searchQuery || '(empty - returning active stores)')
    
    let foundStores
    
    if (!searchQuery || searchQuery.length < 2) {
      // If no search query or query is too short, return active stores
      console.log('📊 Returning active stores (no search query)')
      
      foundStores = await db.select({
        id: stores.id,
        userId: stores.userId,
        storeName: stores.storeName,
        description: stores.description,
        bannerUrl: stores.bannerUrl,
        profileImage: stores.profileImage,
        verificationLevel: stores.verificationLevel,
        totalSales: stores.totalSales,
        rating: stores.rating,
        totalReviews: stores.totalReviews,
        isActive: stores.isActive,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userName: users.name,
        userAvatar: users.avatar,
      })
        .from(stores)
        .innerJoin(users, eq(stores.userId, users.id))
        .where(eq(stores.isActive, true))
        .orderBy(desc(stores.totalSales), desc(stores.rating))
        .limit(limitNum)
    } else {
      // Search stores by store name or user name
      const searchPattern = `%${searchQuery}%`
      
      console.log('🔍 Searching with pattern:', searchPattern)
      
      // First, let's check if there are any stores at all
      const allStores = await db.select({ 
        id: stores.id, 
        storeName: stores.storeName, 
        isActive: stores.isActive 
      })
        .from(stores)
        .limit(5)
      console.log('📊 Total stores sample:', allStores.length, allStores)
      
      // Use Drizzle ORM with ilike for case-insensitive search
      // Use parameterized query through pool for ILIKE with wildcards
      const queryResult = await pool.query(`
        SELECT 
          s.id,
          s.user_id as "userId",
          s.store_name as "storeName",
          s.description,
          s.banner_url as "bannerUrl",
          s.profile_image as "profileImage",
          s.verification_level as "verificationLevel",
          s.total_sales as "totalSales",
          s.rating,
          s.total_reviews as "totalReviews",
          s.is_active as "isActive",
          u.first_name as "userFirstName",
          u.last_name as "userLastName",
          u.name as "userName",
          u.avatar as "userAvatar"
        FROM stores s
        INNER JOIN users u ON s.user_id = u.id
        WHERE s.is_active = true
          AND (
            COALESCE(s.store_name, '') ILIKE $1 OR
            COALESCE(u.first_name, '') ILIKE $1 OR
            COALESCE(u.last_name, '') ILIKE $1 OR
            COALESCE(u.name, '') ILIKE $1
          )
        LIMIT $2
      `, [searchPattern, limitNum])
      
      foundStores = queryResult.rows.map((row: any) => ({
        id: row.id,
        userId: row.userId,
        storeName: row.storeName,
        description: row.description,
        bannerUrl: row.bannerUrl,
        profileImage: row.profileImage,
        verificationLevel: row.verificationLevel,
        totalSales: row.totalSales,
        rating: row.rating,
        totalReviews: row.totalReviews,
        isActive: row.isActive,
        userFirstName: row.userFirstName,
        userLastName: row.userLastName,
        userName: row.userName,
        userAvatar: row.userAvatar,
      }))
    }

    console.log('✅ Found stores:', foundStores.length)
    if (foundStores.length > 0) {
      console.log('   Store names:', foundStores.map(s => s.storeName || s.userName || 'null').join(', '))
    }
    console.log('🔍 ========== STORE SEARCH SUCCESS ==========\n')

    res.json({
      success: true,
      stores: foundStores.map(store => ({
        id: store.id,
        userId: store.userId,
        storeName: store.storeName,
        description: store.description,
        bannerUrl: store.bannerUrl,
        profileImage: store.profileImage || store.userAvatar,
        verificationLevel: store.verificationLevel,
        totalSales: store.totalSales,
        rating: store.rating,
        totalReviews: store.totalReviews,
        owner: {
          firstName: store.userFirstName,
          lastName: store.userLastName,
          name: store.userName,
          avatar: store.userAvatar,
        },
      })),
      message: `Found ${foundStores.length} store(s)`,
    })
  } catch (error: any) {
    console.error('\n❌ ========== STORE SEARCH ERROR ==========')
    console.error('❌ Error:', error.message)
    console.error('❌ Error code:', error.code)
    console.error('❌ ========== STORE SEARCH ERROR END ==========\n')
    
    res.status(500).json({ 
      success: false,
      message: 'Internal server error', 
      error: error.message,
      code: error.code || 'UNKNOWN_ERROR'
    })
  }
})

// GET /api/stores/:storeId - Get store data by store ID (public endpoint)
// IMPORTANT: This must come AFTER /api/stores/search to avoid route conflicts
router.get('/api/stores/:storeId', async (req, res) => {
  console.log('\n🏪 ========== GET STORE REQUEST RECEIVED ==========')
  console.log('📥 Request received at:', new Date().toISOString())
  console.log('📦 Store ID:', req.params.storeId)
  
  try {
    const storeId = parseInt(req.params.storeId, 10)
    
    if (isNaN(storeId)) {
      return res.status(400).json({ message: 'Invalid store ID' })
    }

    console.log('🔍 Fetching store with ID:', storeId)
    
    // Get store data
    const [store] = await db.select()
      .from(stores)
      .where(and(
        eq(stores.id, storeId),
        eq(stores.isActive, true)
      ))
      .limit(1)

    if (!store) {
      console.log('❌ Store not found')
      return res.status(404).json({ message: 'Store not found' })
    }

    // Get user data
    const [user] = await db.select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      name: users.name,
      avatar: users.avatar,
      level: users.level,
      currentXP: users.currentXP,
      xpToNextLevel: users.xpToNextLevel,
    })
      .from(users)
      .where(eq(users.id, store.userId))
      .limit(1)

    // Get store listings
    const listings = await db.select()
      .from(storeListings)
      .where(and(
        eq(storeListings.storeId, store.id),
        eq(storeListings.isActive, true)
      ))
      .orderBy(desc(storeListings.createdAt))

    // Get sales count and total revenue
    const [salesResult] = await db.select({ 
      count: count(),
      totalRevenue: sql<number>`COALESCE(SUM(${orders.price}), 0)`
    })
      .from(orders)
      .where(and(
        eq(orders.storeId, store.id),
        eq(orders.status, 'completed')
      ))

    const salesCount = salesResult?.count || 0
    const totalRevenue = parseFloat(salesResult?.totalRevenue?.toString() || '0')

    // Get followers count
    const [followersResult] = await db.select({ count: count() })
      .from(followers)
      .where(eq(followers.followingId, store.userId))

    const followersCount = followersResult?.count || 0

    console.log('✅ Store found:', store.storeName)
    console.log('   Store userId:', store.userId)
    console.log('   User ID:', user?.id)
    console.log('   User email:', user ? '***' : 'not found') // Don't log actual email for privacy
    console.log('   Listings:', listings.length)
    console.log('   Sales:', salesCount)
    console.log('🏪 ========== GET STORE SUCCESS ==========\n')

    res.json({
      success: true,
      store: {
        id: store.id,
        userId: store.userId,
        storeName: store.storeName,
        description: store.description,
        bannerUrl: store.bannerUrl,
        profileImage: store.profileImage || user?.avatar,
        verificationLevel: store.verificationLevel,
        totalSales: store.totalSales,
        rating: store.rating,
        totalReviews: store.totalReviews,
        salesCount,
        totalRevenue,
        followersCount,
      },
      user: user || null,
      listings: listings.map(listing => ({
        id: listing.id,
        cardName: listing.cardName,
        cardImage: listing.cardImage,
        price: parseFloat(listing.price.toString()),
        vaultingStatus: listing.vaultingStatus,
        purchaseType: listing.purchaseType,
        currentBid: listing.currentBid ? parseFloat(listing.currentBid.toString()) : null,
        bidCount: listing.bidCount,
        description: listing.description,
      })),
    })
  } catch (error: any) {
    console.error('\n❌ ========== GET STORE ERROR ==========')
    console.error('❌ Error:', error.message)
    console.error('❌ ========== GET STORE ERROR END ==========\n')
    
    res.status(500).json({ 
      success: false,
      message: 'Internal server error', 
      error: error.message,
    })
  }
})

export default router
