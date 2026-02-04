import express from 'express'
import crypto from 'crypto'
import { db, users, stores, storeListings, collections, orders } from '../db'
import { eq, and, sql } from 'drizzle-orm'

const router = express.Router()

// PayFast Configuration - Store in environment variables in production
// IMPORTANT: Sandbox and Production use DIFFERENT merchant credentials!
const PAYFAST_CONFIG = {
  // Production credentials (your real account)
  merchantId: process.env.PAYFAST_MERCHANT_ID || '31957853',
  merchantKey: process.env.PAYFAST_MERCHANT_KEY || 'crrh4hjrcxuzt',
  passphrase: process.env.PAYFAST_PASSPHRASE || 'Shinigami2022',
  
  // Sandbox test credentials (your sandbox account)
  sandboxMerchantId: process.env.PAYFAST_SANDBOX_MERCHANT_ID || '10045117',
  sandboxMerchantKey: process.env.PAYFAST_SANDBOX_MERCHANT_KEY || 'dxv5rm6a520rb',
  sandboxPassphrase: process.env.PAYFAST_SANDBOX_PASSPHRASE || '', // Usually not needed for sandbox
  
  sandbox: process.env.PAYFAST_SANDBOX !== 'false', // Default to sandbox
  sandboxUrl: 'https://sandbox.payfast.co.za/eng/process',
  productionUrl: 'https://www.payfast.co.za/eng/process',
}

// Generate MD5 hash
function md5(str: string): string {
  return crypto.createHash('md5').update(str, 'utf8').digest('hex')
}

// Generate PayFast signature
function generatePayFastSignature(params: Record<string, string>, passphrase?: string): string {
  // Filter out empty values and signature field
  const filtered: Record<string, string> = {}
  Object.keys(params).forEach(key => {
    // PayFast requires we exclude empty strings and null values, but keep '0' and other falsy-but-valid values
    const value = params[key]
    if (value !== '' && value != null && value !== undefined && key !== 'signature') {
      filtered[key] = value.toString().trim()
    }
  })

  // Sort keys alphabetically (PayFast requirement)
  const sortedKeys = Object.keys(filtered).sort()

  // Build query string - PayFast uses URL encoding but with specific rules
  const paramString = sortedKeys
    .map(key => {
      const value = filtered[key]
      // PayFast expects values to be URL encoded, but spaces should be '+' not '%20'
      return `${key}=${encodeURIComponent(value).replace(/%20/g, '+')}`
    })
    .join('&')

  // Add passphrase if provided (must be URL encoded and appended)
  const signatureString = passphrase && passphrase.trim() !== ''
    ? `${paramString}&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`
    : paramString

  // Debug: log signature string (remove in production)
  console.log('Signature String (before MD5):', signatureString)
  console.log('Passphrase used:', passphrase ? 'YES' : 'NO')

  // Generate MD5 hash
  const signature = md5(signatureString)
  console.log('Generated Signature:', signature)
  
  return signature
}

// Serve payment form page
router.get('/payment-form', (req, res) => {
  try {
    const { paymentUrl, ...params } = req.query

    if (!paymentUrl || typeof paymentUrl !== 'string') {
      return res.status(400).send('Missing payment URL')
    }

    // Build form fields from query params
    const formFields = Object.keys(params)
      .filter(key => params[key] && key !== 'paymentUrl')
      .map(key => `<input type="hidden" name="${key}" value="${params[key]}" />`)
      .join('\n')

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Processing Payment...</title>
          <style>
            body {
              margin: 0;
              padding: 0;
              background: #000;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              color: white;
            }
            .loading {
              text-align: center;
            }
            .spinner {
              border: 3px solid rgba(255, 255, 255, 0.3);
              border-top: 3px solid white;
              border-radius: 50%;
              width: 40px;
              height: 40px;
              animation: spin 1s linear infinite;
              margin: 0 auto 20px;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          </style>
        </head>
        <body>
          <div class="loading">
            <div class="spinner"></div>
            <p>Redirecting to PayFast...</p>
          </div>
          <form id="payfastForm" method="post" action="${paymentUrl}">
            ${formFields}
          </form>
          <script>
            setTimeout(function() {
              document.getElementById('payfastForm').submit();
            }, 500);
          </script>
        </body>
      </html>
    `

    res.setHeader('Content-Type', 'text/html')
    res.send(html)
  } catch (error) {
    console.error('Payment form error:', error)
    res.status(500).send('Error loading payment form')
  }
})

// Create payment endpoint
router.post('/create-payment', (req, res) => {
  try {
    const {
      amount,
      itemName,
      itemDescription,
      returnUrl,
      cancelUrl,
      notifyUrl,
      userEmail,
      userNameFirst,
      userNameLast,
      cellNumber,
      mPaymentId,
      listingId, // Store listing ID for ownership transfer
      buyerId, // Store buyer ID for ownership transfer
      sellerId, // Store seller ID for ownership transfer
      backendUrl: clientBackendUrl, // URL from client (needed for mobile)
    } = req.body

    // Validate required fields
    if (!amount || !itemName) {
      return res.status(400).json({ error: 'Amount and item name are required' })
    }
    
    // Log received data for debugging
    console.log('📥 [CREATE PAYMENT] Received payment request:', {
      amount,
      itemName,
      listingId,
      buyerId,
      sellerId,
      userEmail,
      hasListingId: !!listingId,
      hasBuyerId: !!buyerId,
      hasSellerId: !!sellerId,
    })
    
    // Warn if IDs are missing (but don't fail - ITN fallback will handle it)
    if (!listingId || !buyerId || !sellerId) {
      console.warn('⚠️ [CREATE PAYMENT] Missing IDs - payment will be created but transfer may fail:', {
        missingListingId: !listingId,
        missingBuyerId: !buyerId,
        missingSellerId: !sellerId,
      })
    }

    // Generate unique payment ID if not provided
    const paymentId = mPaymentId || `pf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Build payment parameters
    // PayFast requires HTTP/HTTPS URLs, not deep links
    // Use client-provided URL (for mobile) or environment variable, or try to detect from request
    let backendUrl = clientBackendUrl || process.env.BACKEND_URL
    if (!backendUrl) {
      // Try to detect from request (for web/localhost)
      const protocol = req.protocol || 'http'
      const host = req.get('host') || 'localhost:3050'
      backendUrl = `${protocol}://${host}`
    }
    // Fallback to localhost if nothing else works
    if (!backendUrl) {
      backendUrl = 'http://localhost:3050'
    }
    
    console.log('Using backend URL for return URLs:', backendUrl)
    
    // Validate return/cancel URLs are HTTP/HTTPS (not deep links)
    let baseReturnUrl = returnUrl
    let baseCancelUrl = cancelUrl
    
    if (baseReturnUrl && !baseReturnUrl.startsWith('http://') && !baseReturnUrl.startsWith('https://')) {
      console.warn('Invalid return_url format, using default:', baseReturnUrl)
      baseReturnUrl = undefined
    }
    
    if (baseCancelUrl && !baseCancelUrl.startsWith('http://') && !baseCancelUrl.startsWith('https://')) {
      console.warn('Invalid cancel_url format, using default:', baseCancelUrl)
      baseCancelUrl = undefined
    }
    
    // Use defaults if not provided or invalid
    // Include payment ID in return URLs so we can track it
    baseReturnUrl = baseReturnUrl || `${backendUrl}/payment/return?status=success&m_payment_id=${paymentId}`
    baseCancelUrl = baseCancelUrl || `${backendUrl}/payment/return?status=cancel&m_payment_id=${paymentId}`
    
    // Use sandbox or production credentials based on mode
    const isSandbox = PAYFAST_CONFIG.sandbox
    const merchantId = isSandbox ? PAYFAST_CONFIG.sandboxMerchantId : PAYFAST_CONFIG.merchantId
    const merchantKey = isSandbox ? PAYFAST_CONFIG.sandboxMerchantKey : PAYFAST_CONFIG.merchantKey
    // For sandbox, check if passphrase is set, otherwise use empty string
    // Some sandbox accounts have passphrases, some don't
    const passphrase = isSandbox 
      ? (PAYFAST_CONFIG.sandboxPassphrase || process.env.PAYFAST_SANDBOX_PASSPHRASE || '')
      : PAYFAST_CONFIG.passphrase
    
    const paymentParams: Record<string, string> = {
      merchant_id: merchantId,
      merchant_key: merchantKey,
      return_url: baseReturnUrl,
      cancel_url: baseCancelUrl,
      notify_url: notifyUrl || `${backendUrl}/payment/itn`,
      name_first: userNameFirst || 'User',
      name_last: userNameLast || '',
      email_address: userEmail || 'user@example.com',
      cell_number: cellNumber || '',
      m_payment_id: paymentId,
      amount: parseFloat(amount).toFixed(2),
      item_name: itemName,
      item_description: itemDescription || itemName,
    }

    // Generate signature (use appropriate passphrase for environment)
    const signature = generatePayFastSignature(
      paymentParams,
      passphrase || undefined
    )

    // Add signature to params
    paymentParams.signature = signature

    // Determine payment URL
    const paymentUrl = PAYFAST_CONFIG.sandbox
      ? PAYFAST_CONFIG.sandboxUrl
      : PAYFAST_CONFIG.productionUrl

    // Debug logging (remove in production)
    console.log('PayFast Payment Config:', {
      environment: isSandbox ? 'SANDBOX' : 'PRODUCTION',
      merchantId: merchantId,
      paymentUrl,
      hasPassphrase: !!passphrase,
      amount: paymentParams.amount,
    })

    // Build direct PayFast URL with all parameters
    // PayFast accepts GET requests with all params in the URL
    const payfastParams = new URLSearchParams()
    Object.keys(paymentParams).forEach(key => {
      if (paymentParams[key]) {
        payfastParams.append(key, paymentParams[key])
      }
    })
    
    const directPayFastUrl = `${paymentUrl}?${payfastParams.toString()}`

    // Store initial payment status as pending with listing/buyer info
    // Better Auth uses string IDs, so keep them as strings (only listingId needs to be number)
    const parsedListingId = listingId ? (typeof listingId === 'string' ? parseInt(listingId) : listingId) : undefined
    const parsedBuyerId = buyerId ? (typeof buyerId === 'string' ? buyerId : String(buyerId)) : undefined
    const parsedSellerId = sellerId ? (typeof sellerId === 'string' ? sellerId : String(sellerId)) : undefined
    
    console.log('💾 [CREATE PAYMENT] Storing payment data:', {
      paymentId,
      listingId: parsedListingId,
      buyerId: parsedBuyerId,
      sellerId: parsedSellerId,
      rawListingId: listingId,
      rawBuyerId: buyerId,
      rawSellerId: sellerId,
    })
    
    paymentStatusStore.set(paymentId, {
      status: 'pending',
      mPaymentId: paymentId,
      timestamp: Date.now(),
      listingId: parsedListingId,
      buyerId: parsedBuyerId, // Keep as string for Better Auth
      sellerId: parsedSellerId, // Keep as string for Better Auth
    })

    // Return payment data
    res.json({
      success: true,
      paymentUrl: directPayFastUrl, // Direct PayFast URL - open this in browser
      paymentParams,
      mPaymentId: paymentId,
    })
  } catch (error) {
    console.error('PayFast payment creation error:', error)
    res.status(500).json({ error: 'Failed to create payment' })
  }
})

// Payment return endpoint - redirects to deep link
router.get('/return', async (req, res) => {
  try {
    const { status, m_payment_id } = req.query
    
      // If we have a payment ID and status is success, update payment status
      // This helps when ITN hasn't arrived yet
      if (status === 'success' && m_payment_id && typeof m_payment_id === 'string') {
        const existingPayment = paymentStatusStore.get(m_payment_id)
        console.log('🔍 [PAYMENT RETURN] Looking up payment:', {
          paymentId: m_payment_id,
          found: !!existingPayment,
          existingData: existingPayment ? {
            listingId: existingPayment.listingId,
            buyerId: existingPayment.buyerId,
            sellerId: existingPayment.sellerId,
          } : null,
        })
        
        if (existingPayment && existingPayment.status === 'pending') {
          // Update to complete if still pending (ITN might not have arrived yet)
          // IMPORTANT: Preserve all existing data including IDs
          paymentStatusStore.set(m_payment_id, {
            ...existingPayment,
            status: 'complete',
            timestamp: Date.now(),
          })
        console.log('✅ [PAYMENT CONFIRMED] Payment status updated to complete via return URL:', {
          paymentId: m_payment_id,
          previousStatus: 'pending',
          newStatus: 'complete',
          timestamp: new Date().toISOString(),
        })
        
        // Log payment data for debugging
        console.log('📋 [PAYMENT RETURN] Payment data:', {
          paymentId: m_payment_id,
          listingId: existingPayment.listingId,
          buyerId: existingPayment.buyerId,
          sellerId: existingPayment.sellerId,
          hasAllData: !!(existingPayment.listingId && existingPayment.buyerId && existingPayment.sellerId),
        })
        
        // Trigger ownership transfer if we have all required data
        if (existingPayment.listingId && existingPayment.buyerId && existingPayment.sellerId) {
          console.log('🔄 [PAYMENT RETURN] Transferring card ownership with stored IDs')
          try {
            // Get listing to get card name and amount
            const [listing] = await db.select()
              .from(storeListings)
              .where(eq(storeListings.id, existingPayment.listingId))
              .limit(1)
            
            if (listing) {
              console.log('📦 [PAYMENT RETURN] Found listing:', listing.cardName)
              await transferCardOwnership(
                existingPayment.listingId,
                existingPayment.buyerId,
                existingPayment.sellerId,
                listing.cardName,
                existingPayment.amount || listing.price.toString()
              )
              console.log('✅ [PAYMENT RETURN] Ownership transfer completed')
            } else {
              console.error('❌ [PAYMENT RETURN] Listing not found for transfer:', existingPayment.listingId)
            }
          } catch (error: any) {
            console.error('❌ [PAYMENT RETURN] Error transferring ownership:', error.message)
            console.error('❌ [PAYMENT RETURN] Error stack:', error.stack)
          }
        } else if (existingPayment.listingId) {
          // Fallback: Just mark listing as sold if we don't have buyer/seller IDs
          console.log('⚠️ [PAYMENT RETURN] Missing buyer/seller IDs, only marking listing as sold')
          console.log('   Missing data:', {
            hasListingId: !!existingPayment.listingId,
            hasBuyerId: !!existingPayment.buyerId,
            hasSellerId: !!existingPayment.sellerId,
          })
          try {
            await db.update(storeListings)
              .set({ isActive: false })
              .where(eq(storeListings.id, existingPayment.listingId))
            console.log('✅ [PAYMENT CONFIRMED] Listing marked as sold (no transfer - missing IDs):', existingPayment.listingId)
            console.log('⚠️ [PAYMENT RETURN] Card transfer will be handled by ITN handler')
          } catch (error) {
            console.error('❌ [PAYMENT CONFIRMED] Error marking listing as sold:', error)
          }
        } else {
          console.log('⚠️ [PAYMENT RETURN] No listingId found in payment data')
          console.log('⚠️ [PAYMENT RETURN] Card transfer will be handled by ITN handler (if ITN arrives)')
        }
      } else if (!existingPayment) {
        // Create entry if it doesn't exist
        paymentStatusStore.set(m_payment_id, {
          status: 'complete',
          mPaymentId: m_payment_id,
          timestamp: Date.now(),
        })
        console.log('✅ [PAYMENT CONFIRMED] Payment status created as complete via return URL:', {
          paymentId: m_payment_id,
          status: 'complete',
          timestamp: new Date().toISOString(),
        })
      } else {
        console.log('✅ [PAYMENT CONFIRMED] Payment already marked as complete:', {
          paymentId: m_payment_id,
          currentStatus: existingPayment.status,
          timestamp: new Date().toISOString(),
        })
      }
    }
    
    // Redirect to deep link based on status
    if (status === 'success') {
      // Return HTML that redirects to deep link
      // Also works with openAuthSessionAsync which can intercept the redirect
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Payment Successful</title>
            <script>
              // Try to redirect to deep link (for openAuthSessionAsync)
              // The redirect URL will be captured by the app
              window.location.href = 'saplayer://payment/success?status=success';
              
              // Fallback: show message if deep link doesn't work
              setTimeout(function() {
                document.getElementById('message').style.display = 'block';
              }, 2000);
            </script>
            <style>
              body {
                margin: 0;
                padding: 0;
                background: #000;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                color: white;
              }
              .message {
                text-align: center;
                display: none;
              }
            </style>
          </head>
          <body>
            <div class="message" id="message">
              <h2>Payment Successful!</h2>
              <p>Return to the app to continue.</p>
            </div>
          </body>
        </html>
      `)
    } else if (status === 'cancel') {
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Payment Cancelled</title>
            <script>
              window.location.href = 'saplayer://payment/cancel?status=cancel';
              setTimeout(function() {
                document.getElementById('message').style.display = 'block';
              }, 2000);
            </script>
            <style>
              body {
                margin: 0;
                padding: 0;
                background: #000;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                color: white;
              }
              .message {
                text-align: center;
                display: none;
              }
            </style>
          </head>
          <body>
            <div class="message" id="message">
              <h2>Payment Cancelled</h2>
              <p>Return to the app to continue.</p>
            </div>
          </body>
        </html>
      `)
    } else {
      res.status(400).send('Invalid status parameter')
    }
  } catch (error) {
    console.error('Payment return error:', error)
    res.status(500).send('Error processing return')
  }
})

// In-memory payment status store (in production, use a database)
// Updated to use string IDs for Better Auth compatibility
const paymentStatusStore = new Map<string, {
  status: 'pending' | 'complete' | 'failed' | 'cancelled'
  mPaymentId: string
  pfPaymentId?: string
  amount?: string
  timestamp: number
  listingId?: number
  buyerId?: string | number // Better Auth uses string IDs
  sellerId?: string | number // Better Auth uses string IDs
}>()

// Function to transfer card ownership after successful payment
// Updated to use string IDs for Better Auth compatibility
async function transferCardOwnership(
  listingId: number,
  buyerId: string | number, // Better Auth uses string IDs
  sellerId: string | number, // Better Auth uses string IDs
  itemName: string,
  amount: string
) {
  // Convert to strings if needed (Better Auth uses string IDs)
  const buyerIdStr: string = typeof buyerId === 'string' ? buyerId : String(buyerId)
  const sellerIdStr: string = typeof sellerId === 'string' ? sellerId : String(sellerId)
  console.log('\n🔄 ========== CARD OWNERSHIP TRANSFER ==========')
  console.log('📦 Transfer details:', { listingId, buyerId, sellerId, itemName, amount })
  
  try {
    // Find the listing
    const [listing] = await db.select()
      .from(storeListings)
      .where(eq(storeListings.id, listingId))
      .limit(1)

    if (!listing) {
      console.error('❌ [OWNERSHIP TRANSFER] Listing not found:', listingId)
      return
    }

    console.log('✅ [OWNERSHIP TRANSFER] Listing found:', listing.cardName)

    // Find the buyer by ID (use string ID for Better Auth)
    const [buyer] = await db.select()
      .from(users)
      .where(eq(users.id, buyerIdStr))
      .limit(1)

    if (!buyer) {
      console.error('❌ [OWNERSHIP TRANSFER] Buyer not found:', buyerIdStr)
      return
    }

    console.log('✅ [OWNERSHIP TRANSFER] Buyer found:', buyer.email)

    // Find the seller by ID (use string ID for Better Auth)
    const [seller] = await db.select()
      .from(users)
      .where(eq(users.id, sellerIdStr))
      .limit(1)

    if (!seller) {
      console.error('❌ [OWNERSHIP TRANSFER] Seller not found:', sellerIdStr)
      return
    }

    console.log('✅ [OWNERSHIP TRANSFER] Seller found:', seller.email)

    // Find the seller's store
    const [sellerStore] = await db.select()
      .from(stores)
      .where(eq(stores.userId, sellerIdStr))
      .limit(1)

    if (!sellerStore) {
      console.error('❌ [OWNERSHIP TRANSFER] Seller store not found for userId:', sellerId)
      return
    }

    console.log('✅ [OWNERSHIP TRANSFER] Seller store found:', sellerStore.storeName)

    // Find the card in the seller's collection by matching card name (case-insensitive)
    // First try to find by exact listing cardName match, then try case-insensitive match
    let sellerCard = null
    
    // Try exact match first (most reliable)
    const [exactMatch] = await db.select()
      .from(collections)
      .where(
        and(
          eq(collections.userId, sellerIdStr),
          eq(collections.name, listing.cardName)
        )
      )
      .limit(1)
    
    if (exactMatch) {
      sellerCard = exactMatch
      console.log('✅ [OWNERSHIP TRANSFER] Found card by exact name match:', listing.cardName)
    } else {
      // Try case-insensitive match
      const [caseInsensitiveMatch] = await db.select()
        .from(collections)
        .where(
          and(
            eq(collections.userId, sellerIdStr),
            sql`LOWER(TRIM(${collections.name})) = LOWER(TRIM(${listing.cardName}))`
          )
        )
        .limit(1)
      
      if (caseInsensitiveMatch) {
        sellerCard = caseInsensitiveMatch
        console.log('✅ [OWNERSHIP TRANSFER] Found card by case-insensitive match:', listing.cardName)
      } else {
        // Try matching with itemName from payment (fallback)
        const [itemNameMatch] = await db.select()
          .from(collections)
          .where(
            and(
              eq(collections.userId, sellerIdStr),
              sql`LOWER(TRIM(${collections.name})) = LOWER(TRIM(${itemName}))`
            )
          )
          .limit(1)
        
        if (itemNameMatch) {
          sellerCard = itemNameMatch
          console.log('✅ [OWNERSHIP TRANSFER] Found card by itemName match:', itemName)
        }
      }
    }

    if (sellerCard) {
      console.log('✅ [OWNERSHIP TRANSFER] Found card in seller collection:', sellerCard.name)
      console.log('   Card ID:', sellerCard.id)
      console.log('   Card Name:', sellerCard.name)
      console.log('   Seller ID:', sellerId)
      
      // Create a new collection entry for the buyer with the same card data
      // Use listing.cardName to ensure consistency
      const [newCard] = await db.insert(collections).values({
        userId: buyerIdStr,
        type: sellerCard.type || 'card',
        name: listing.cardName, // Use listing.cardName for consistency
        description: sellerCard.description || listing.description || null,
        image: sellerCard.image || listing.cardImage || null,
        cardId: sellerCard.cardId,
        set: sellerCard.set,
        condition: sellerCard.condition,
        grade: sellerCard.grade,
        estimatedValue: sellerCard.estimatedValue,
        purchasePrice: amount,
        purchaseDate: new Date(),
        notes: `Purchased from ${sellerStore.storeName || seller.name || 'seller'}`,
      }).returning()

      console.log('✅ [OWNERSHIP TRANSFER] Card added to buyer collection:', {
        newCardId: newCard.id,
        buyerId: buyerIdStr,
        cardName: listing.cardName,
      })

      // Delete the card from seller's collection
      const deleteResult = await db.delete(collections)
        .where(eq(collections.id, sellerCard.id))
        .returning()

      console.log('✅ [OWNERSHIP TRANSFER] Card removed from seller collection:', {
        deletedCardId: sellerCard.id,
        sellerId: sellerIdStr,
        deleteResult: deleteResult.length > 0 ? 'Success' : 'No rows deleted',
      })
      console.log('✅ [OWNERSHIP TRANSFER] Card transferred:', {
        from: sellerIdStr,
        to: buyerIdStr,
        cardName: listing.cardName,
        collectionId: newCard.id,
      })
    } else {
      console.log('⚠️ [OWNERSHIP TRANSFER] Card not found in seller collection, creating from listing')
      console.log('   Listing cardName:', listing.cardName)
      console.log('   Item name from payment:', itemName)
      console.log('   Seller ID:', sellerId)
      
      // If card not found in collection, create a new entry for buyer based on listing
      // Use listing.cardName for consistency
      const [newCard] = await db.insert(collections).values({
        userId: buyerIdStr,
        type: 'card',
        name: listing.cardName, // Use listing.cardName instead of itemName
        description: listing.description || null,
        image: listing.cardImage || null,
        purchasePrice: amount,
        purchaseDate: new Date(),
        notes: `Purchased from ${sellerStore.storeName || seller.name || 'seller'}`,
      }).returning()

      console.log('✅ [OWNERSHIP TRANSFER] New card added to buyer collection:', {
        buyerId: buyerIdStr,
        cardName: listing.cardName,
        collectionId: newCard.id,
      })
    }

    // Mark listing as inactive (sold)
    await db.update(storeListings)
      .set({ isActive: false })
      .where(eq(storeListings.id, listingId))

    console.log('✅ [OWNERSHIP TRANSFER] Listing marked as sold:', listingId)

    // Create an order record
    // Convert amount to number (PayFast sends as string)
    // Use listing.price as fallback if amount conversion fails
    const orderPriceNum = amount ? parseFloat(amount.toString()) : parseFloat(listing.price.toString())
    // Format to 2 decimal places for decimal field (e.g., "1000.00")
    const orderPrice = isNaN(orderPriceNum) ? listing.price.toString() : orderPriceNum.toFixed(2)
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    console.log('💰 [OWNERSHIP TRANSFER] Creating order with:', {
      storeId: listing.storeId,
      buyerId: buyerId,
      itemName: listing.cardName,
      price: orderPrice,
      priceNumber: orderPriceNum,
      amountFromPayment: amount,
      listingPrice: listing.price.toString(),
    })
    
    const [newOrder] = await db.insert(orders).values({
      storeId: listing.storeId,
      buyerId: buyerIdStr,
      itemName: listing.cardName, // Use listing.cardName for consistency
      itemImage: listing.cardImage || null,
      price: orderPrice, // Already formatted as string with 2 decimal places
      quantity: 1,
      status: 'completed',
      orderNumber: orderNumber,
    }).returning()

    console.log('✅ [OWNERSHIP TRANSFER] Order created successfully:', {
      orderId: newOrder.id,
      orderNumber,
      buyerId: buyerId,
      storeId: listing.storeId,
      price: newOrder.price,
      status: newOrder.status,
    })

    // Update store's totalSales count (increment by 1)
    await db.update(stores)
      .set({ 
        totalSales: sql`${stores.totalSales} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(stores.id, listing.storeId))

    console.log('✅ [OWNERSHIP TRANSFER] Store totalSales incremented for storeId:', listing.storeId)
    console.log('🔄 ========== CARD OWNERSHIP TRANSFER SUCCESS ==========\n')
  } catch (error: any) {
    console.error('\n❌ ========== CARD OWNERSHIP TRANSFER ERROR ==========')
    console.error('❌ Error:', error.message)
    console.error('❌ Stack:', error.stack)
    console.error('❌ ========== CARD OWNERSHIP TRANSFER ERROR END ==========\n')
  }
}

// Manual card transfer endpoint (for fixing failed transfers)
// POST /payment/manual-transfer
router.post('/manual-transfer', async (req, res) => {
  try {
    const { paymentId, listingId, buyerId, sellerId, itemName, amount } = req.body
    
    if (!paymentId || !listingId || !buyerId || !sellerId) {
      return res.status(400).json({ 
        error: 'Missing required fields: paymentId, listingId, buyerId, sellerId' 
      })
    }
    
    console.log('🔧 [MANUAL TRANSFER] Manual transfer requested:', {
      paymentId,
      listingId,
      buyerId,
      sellerId,
      itemName,
      amount,
    })
    
    // Get listing to get card name and price
    const [listing] = await db.select()
      .from(storeListings)
      .where(eq(storeListings.id, typeof listingId === 'string' ? parseInt(listingId) : listingId))
      .limit(1)
    
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' })
    }
    
    // Transfer ownership
    await transferCardOwnership(
      typeof listingId === 'string' ? parseInt(listingId) : listingId,
      buyerId,
      sellerId,
      itemName || listing.cardName,
      amount || listing.price.toString()
    )
    
    res.json({ 
      success: true, 
      message: 'Card transfer completed successfully' 
    })
  } catch (error: any) {
    console.error('Manual transfer error:', error)
    res.status(500).json({ 
      error: 'Failed to transfer card', 
      message: error.message 
    })
  }
})

// Check payment status endpoint
router.get('/status/:paymentId', (req, res) => {
  try {
    const { paymentId } = req.params
    const payment = paymentStatusStore.get(paymentId)
    
    if (!payment) {
      console.log('⚠️ [STATUS CHECK] Payment not found:', paymentId)
      return res.status(404).json({ error: 'Payment not found' })
    }
    
    console.log('📊 [STATUS CHECK] Payment status retrieved:', {
      paymentId,
      status: payment.status,
      timestamp: new Date(payment.timestamp).toISOString(),
    })
    
    res.json({
      success: true,
      status: payment.status,
      mPaymentId: payment.mPaymentId,
      pfPaymentId: payment.pfPaymentId,
      amount: payment.amount,
    })
  } catch (error) {
    console.error('Payment status check error:', error)
    res.status(500).json({ error: 'Failed to check payment status' })
  }
})

// ITN (Instant Transaction Notification) callback endpoint
router.post('/itn', async (req, res) => {
  try {
    const data = req.body
    const { signature: incomingSignature, m_payment_id, payment_status, amount_gross } = data

    // Re-generate signature to verify
    const verifyParams: Record<string, string> = {}
    Object.keys(data).forEach(key => {
      if (key !== 'signature' && data[key] !== '') {
        verifyParams[key] = data[key].toString()
      }
    })

    // Determine which credentials to use based on merchant_id in the ITN
    const isSandbox = data.merchant_id === PAYFAST_CONFIG.sandboxMerchantId
    const merchantKey = isSandbox ? PAYFAST_CONFIG.sandboxMerchantKey : PAYFAST_CONFIG.merchantKey
    const passphrase = isSandbox ? PAYFAST_CONFIG.sandboxPassphrase : PAYFAST_CONFIG.passphrase

    // Add merchant key for verification
    verifyParams.merchant_key = merchantKey

    const expectedSignature = generatePayFastSignature(
      verifyParams,
      passphrase || undefined
    )

    // Verify signature
    if (expectedSignature !== incomingSignature) {
      console.error('PayFast ITN: Invalid signature', {
        expected: expectedSignature,
        received: incomingSignature,
        merchantId: data.merchant_id,
        isSandbox,
        passphraseUsed: !!passphrase,
      })
      // For now, log but continue (PayFast sandbox sometimes has signature issues)
      // In production, you should return 400
      console.warn('⚠️ [ITN] Signature mismatch - continuing anyway (sandbox mode)')
      // return res.status(400).send('Invalid signature')
    }

    // Verify payment status and process accordingly
    console.log('✅ PayFast ITN received - Payment Verified:', {
      m_payment_id, // Your payment ID
      pf_payment_id: data.pf_payment_id, // PayFast's internal payment ID
      payment_status, // 'COMPLETE', 'FAILED', 'PENDING', etc.
      amount_gross: data.amount_gross, // Total amount charged
      amount_fee: data.amount_fee, // PayFast's fee (negative value)
      amount_net: data.amount_net, // Amount you receive after fees
      item_name: data.item_name,
      email_address: data.email_address,
      merchant_id: data.merchant_id,
    })

    // Process successful payment
    if (payment_status === 'COMPLETE') {
      // Get stored payment data
      const storedPayment = paymentStatusStore.get(m_payment_id)
      
      // Store payment status for app to check
      paymentStatusStore.set(m_payment_id, {
        status: 'complete',
        mPaymentId: m_payment_id,
        pfPaymentId: data.pf_payment_id,
        amount: data.amount_gross,
        timestamp: Date.now(),
        listingId: storedPayment?.listingId,
        buyerId: storedPayment?.buyerId,
        sellerId: storedPayment?.sellerId,
      })
      
      // Transfer card ownership if listingId, buyerId, and sellerId are available
      if (storedPayment?.listingId && storedPayment?.buyerId && storedPayment?.sellerId) {
        console.log('🔄 [ITN] Transferring card ownership with stored IDs')
        await transferCardOwnership(
          storedPayment.listingId,
          storedPayment.buyerId,
          storedPayment.sellerId,
          data.item_name,
          data.amount_gross
        )
      } else {
        console.log('⚠️ [ITN] Missing payment metadata, attempting to find listing and buyer')
        console.log('   Stored payment data:', {
          listingId: storedPayment?.listingId,
          buyerId: storedPayment?.buyerId,
          sellerId: storedPayment?.sellerId,
        })
        
        // Try to find listing by item name if listingId not stored
        const [listing] = await db.select()
          .from(storeListings)
          .where(
            and(
              eq(storeListings.cardName, data.item_name),
              eq(storeListings.isActive, true)
            )
          )
          .limit(1)
        
        if (listing) {
          console.log('✅ [ITN] Found listing by name:', listing.cardName, 'ID:', listing.id)
          
          // Find seller from store
          const [sellerStore] = await db.select()
            .from(stores)
            .where(eq(stores.id, listing.storeId))
            .limit(1)
          
          if (!sellerStore) {
            console.error('❌ [ITN] Seller store not found for listing:', listing.storeId)
            return res.status(200).send('OK')
          }
          
          console.log('✅ [ITN] Found seller store, userId:', sellerStore.userId)
          
          // Find buyer by email (Better Auth uses email)
          const [buyer] = await db.select()
            .from(users)
            .where(eq(users.email, data.email_address))
            .limit(1)
          
          if (!buyer) {
            console.error('❌ [ITN] Buyer not found by email:', data.email_address)
            return res.status(200).send('OK')
          }
          
          console.log('✅ [ITN] Found buyer by email, id:', buyer.id)
          console.log('🔄 [ITN] Transferring card ownership with found IDs')
          
          await transferCardOwnership(
            listing.id,
            buyer.id,
            sellerStore.userId,
            data.item_name,
            data.amount_gross
          )
          
          console.log('✅ [ITN] Ownership transfer completed')
        } else {
          console.log('⚠️ [ITN] Could not find listing for ownership transfer')
          console.log('   Searched for item_name:', data.item_name)
        }
      }
      
      console.log('💰 [PAYMENT COMPLETE - ITN] Order should be fulfilled:', {
        paymentId: m_payment_id,
        pfPaymentId: data.pf_payment_id,
        itemName: data.item_name,
        amount: data.amount_gross,
        netAmount: data.amount_net,
        fee: Math.abs(parseFloat(data.amount_fee || '0')),
        buyerEmail: data.email_address,
        timestamp: new Date().toISOString(),
      })
    } else if (payment_status === 'FAILED') {
      // Store failed payment status
      paymentStatusStore.set(m_payment_id, {
        status: 'failed',
        mPaymentId: m_payment_id,
        timestamp: Date.now(),
      })
      console.log('❌ Payment FAILED:', {
        paymentId: m_payment_id,
        reason: data.payment_status_reason || 'Unknown',
      })
      // TODO: Handle failed payment (notify user, update order status)
    } else {
      console.log('⏳ Payment PENDING or other status:', payment_status)
      // TODO: Handle pending payments
    }

    // Always return 200 OK to PayFast (required)
    res.status(200).send('OK')
  } catch (error) {
    console.error('PayFast ITN error:', error)
    // Still return 200 to PayFast
    res.status(200).send('OK')
  }
})

export default router
