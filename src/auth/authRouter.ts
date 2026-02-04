import express from 'express'
import { db, users, sessions, pool } from '../db'
import { eq } from 'drizzle-orm'

const router = express.Router()

// Test database endpoint
router.get('/api/auth/test-db', async (req, res) => {
  console.log('\n🧪 ========== DATABASE TEST ==========')
  console.log('📥 Database test request received')
  console.log('🌐 DATABASE_URL exists:', !!process.env.DATABASE_URL)
  console.log('🌐 DATABASE_URL preview:', process.env.DATABASE_URL ? `${process.env.DATABASE_URL.substring(0, 50)}...` : 'NOT SET')
  
  try {
    // Test 1: Check if users table exists
    console.log('🔍 Test 1: Checking if users table exists...')
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `)
    const usersTableExists = tableCheck.rows[0]?.exists || false
    console.log('   Users table exists:', usersTableExists)
    
    // Test 2: Count users (only if table exists)
    let userCount = 0
    if (usersTableExists) {
      console.log('🔍 Test 2: Counting users in database...')
      const userList = await db.select().from(users)
      userCount = userList.length
      console.log('   Total users in database:', userCount)
    } else {
      console.log('⚠️  Test 2: Skipped (users table does not exist)')
    }
    
    // Test 3: List all tables
    console.log('🔍 Test 3: Listing all tables...')
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `)
    const tableNames = tables.rows.map((r: any) => r.table_name)
    console.log('   Tables found:', tableNames)
    
    console.log('✅ ========== DATABASE TEST SUCCESS ==========\n')
    
    res.json({
      success: true,
      databaseUrl: process.env.DATABASE_URL ? `${process.env.DATABASE_URL.substring(0, 30)}...` : 'NOT SET',
      usersTableExists,
      userCount,
      tables: tableNames,
    })
  } catch (error: any) {
    console.error('\n❌ ========== DATABASE TEST ERROR ==========')
    console.error('❌ Error:', error.message)
    console.error('❌ Error code:', error.code)
    console.error('❌ Error stack:', error.stack)
    console.error('❌ ========== DATABASE TEST ERROR END ==========\n')
    
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})

// Simple sign-up endpoint
router.post('/api/auth/sign-up', async (req, res) => {
  console.log('\n🔵 ========== SIGN-UP REQUEST RECEIVED ==========')
  console.log('📥 Request received at:', new Date().toISOString())
  console.log('📦 Request body:', JSON.stringify(req.body, null, 2))
  console.log('🌐 DATABASE_URL exists:', !!process.env.DATABASE_URL)
  console.log('🌐 DATABASE_URL preview:', process.env.DATABASE_URL ? `${process.env.DATABASE_URL.substring(0, 30)}...` : 'NOT SET')
  
  try {
    const { email, password, name, firstName, lastName } = req.body

    console.log('📝 Extracted data:', { email, hasPassword: !!password, name, firstName, lastName })

    if (!email || !password) {
      console.log('❌ Validation failed: Missing email or password')
      return res.status(400).json({ message: 'Email and password are required' })
    }

    console.log('🔍 Step 1: Checking if user exists...')
    console.log('   Querying database for email:', email)
    
    // Check if user exists
    const existingUser = await db.select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    console.log('✅ Step 1 complete: User check query executed')
    console.log('   Existing users found:', existingUser.length)
    if (existingUser.length > 0) {
      console.log('   Existing user data:', JSON.stringify(existingUser[0], null, 2))
    }

    if (existingUser.length > 0) {
      console.log('❌ User already exists - returning error')
      return res.status(400).json({ message: 'User already exists' })
    }

    console.log('🔍 Step 2: Creating new user...')
    console.log('   User data to insert:', {
      email,
      hasPassword: !!password,
      name: name || `${firstName || ''} ${lastName || ''}`.trim() || null,
      firstName: firstName || null,
      lastName: lastName || null,
    })

    // Create user (in production, hash password with bcrypt)
    const [newUser] = await db.insert(users).values({
      email,
      password, // TODO: Hash with bcrypt before storing
      name: name || `${firstName || ''} ${lastName || ''}`.trim() || null,
      firstName: firstName || null,
      lastName: lastName || null,
    }).returning({
      id: users.id,
      email: users.email,
      name: users.name,
      firstName: users.firstName,
      lastName: users.lastName,
    })

    console.log('✅ Step 2 complete: User created successfully!')
    console.log('   New user data:', JSON.stringify(newUser, null, 2))
    console.log('✅ ========== SIGN-UP SUCCESS ==========\n')

    res.json({
      success: true,
      user: newUser,
      message: 'User created successfully',
    })
  } catch (error: any) {
    console.error('\n❌ ========== SIGN-UP ERROR ==========')
    console.error('❌ Error type:', error.constructor.name)
    console.error('❌ Error message:', error.message)
    console.error('❌ Error code:', error.code)
    console.error('❌ Error stack:', error.stack)
    console.error('❌ Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2))
    
    // Check if it's a table doesn't exist error
    if (error.message?.includes('does not exist') || error.message?.includes('relation') || error.code === '42P01') {
      console.error('❌ ERROR TYPE: Database table does not exist')
      console.error('   Solution: Run "npm run db:push" in server directory')
      return res.status(500).json({ 
        message: 'Database tables not found. Please run: npm run db:push',
        error: 'Tables need to be created. Run "npm run db:push" in the server directory.',
        code: 'TABLES_NOT_FOUND',
        details: {
          errorMessage: error.message,
          errorCode: error.code,
        }
      })
    }
    
    console.error('❌ ========== SIGN-UP ERROR END ==========\n')
    
    res.status(500).json({ 
      message: 'Internal server error', 
      error: error.message,
      code: error.code || 'UNKNOWN_ERROR',
      details: process.env.NODE_ENV === 'development' ? {
        stack: error.stack,
        fullError: error.toString()
      } : undefined
    })
  }
})

// Simple sign-in endpoint
router.post('/api/auth/sign-in', async (req, res) => {
  console.log('\n🟢 ========== SIGN-IN REQUEST RECEIVED ==========')
  console.log('📥 Request received at:', new Date().toISOString())
  console.log('📦 Request body:', JSON.stringify({ email: req.body.email, hasPassword: !!req.body.password }, null, 2))
  
  try {
    const { email, password } = req.body

    if (!email || !password) {
      console.log('❌ Validation failed: Missing email or password')
      return res.status(400).json({ message: 'Email and password are required' })
    }

    console.log('🔍 Searching for user with email:', email)
    
    // Find user
    const [user] = await db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      firstName: users.firstName,
      lastName: users.lastName,
      password: users.password,
    })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    if (!user) {
      console.log('❌ User not found')
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    console.log('✅ User found:', { id: user.id, email: user.email })

    // In production, compare hashed password with bcrypt
    if (user.password !== password) {
      console.log('❌ Password mismatch')
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    console.log('✅ Password verified, creating session...')

    // Create session token (in production, use JWT)
    const token = `token_${user.id}_${Date.now()}`
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    await db.insert(sessions).values({
      userId: user.id,
      token,
      expiresAt,
    })

    // Update last login
    await db.update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id))

    console.log('✅ Sign-in successful')
    console.log('🟢 ========== SIGN-IN SUCCESS ==========\n')

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      token,
      message: 'Signed in successfully',
    })
  } catch (error: any) {
    console.error('\n❌ ========== SIGN-IN ERROR ==========')
    console.error('❌ Error:', error.message)
    console.error('❌ Error code:', error.code)
    console.error('❌ ========== SIGN-IN ERROR END ==========\n')
    
    // Check if it's a table doesn't exist error
    if (error.message?.includes('does not exist') || error.message?.includes('relation') || error.code === '42P01') {
      return res.status(500).json({ 
        message: 'Database tables not found. Please run: npm run db:push',
        error: 'Tables need to be created. Run "npm run db:push" in the server directory.',
        code: 'TABLES_NOT_FOUND'
      })
    }
    
    res.status(500).json({ 
      message: 'Internal server error', 
      error: error.message,
      code: error.code || 'UNKNOWN_ERROR'
    })
  }
})

export default router
