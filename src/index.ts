import express from 'express'
import cors from 'cors'
import { toNodeHandler } from 'better-auth/node'
import chatRouter from './chat/chatRouter'
import imagesRouter from './images/imagesRouter'
import fileRouter from './files/fileRouter'
import pokedataRouter from './pokedata/pokedataRouter'
import payfastRouter from './payment/payfastRouter'
import authRouter from './auth/authRouter'
import storeRouter from './store/storeRouter'
import bodyParser from 'body-parser'
import 'dotenv/config'
import { testConnection } from './db'
import { auth } from './auth/auth'

// Log environment variable status on startup
console.log('🔑 Environment check:')
console.log('  GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? `${process.env.GEMINI_API_KEY.substring(0, 10)}...` : '❌ NOT SET')
console.log('  POKEDATA_API_KEY:', process.env.POKEDATA_API_KEY ? '✅ SET' : '❌ NOT SET')
console.log('  DATABASE_URL:', process.env.DATABASE_URL ? '✅ SET' : '❌ NOT SET')

const app = express()

// Configure CORS to allow credentials (required for Better Auth cookies)
// Cannot use wildcard '*' when credentials are included
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true)
    }
    
    // List of allowed origins
    const allowedOrigins = [
      'http://localhost:8081',  // Expo web
      'http://localhost:19006', // Expo web alternative
      'http://localhost:3000',  // Common dev port
      'http://localhost:3050',  // Server port (for testing)
    ]
    
    // Allow any exp:// origin (Expo Go)
    if (origin.startsWith('exp://')) {
      return callback(null, true)
    }
    
    // Allow any localhost origin in development
    if (origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')) {
      return callback(null, true)
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true)
    }
    
    // Allow ngrok origins
    if (origin.includes('ngrok-free.app') || origin.includes('ngrok.io')) {
      return callback(null, true)
    }
    
    // In development, be permissive
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true)
    }
    
    callback(new Error('Not allowed by CORS'))
  },
  credentials: true, // Required for Better Auth cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'ngrok-skip-browser-warning'],
}))

// Mount Better Auth handler BEFORE express.json() middleware
// Better Auth needs access to raw request body
app.all('/api/auth/*', toNodeHandler(auth))

// Body parsing middleware (after Better Auth)
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }))
app.use(bodyParser.json({ limit: '50mb' }))
app.use(express.json({ limit: '50mb' }))

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.use('/chat', chatRouter)
app.use('/images', imagesRouter)
app.use('/files', fileRouter)
app.use('/pokedata', pokedataRouter)
app.use('/payment', payfastRouter)
app.use('/', authRouter)  // Keep custom auth for backward compatibility
app.use('/', storeRouter)

// Start server and test database connection
const PORT = process.env.PORT || 3050
app.listen(PORT, async () => {
  console.log(`Server started on port ${PORT}`)
  
  // Test database connection
  if (process.env.DATABASE_URL) {
    await testConnection()
  } else {
    console.log('⚠️  DATABASE_URL not set - database features disabled')
  }
})
