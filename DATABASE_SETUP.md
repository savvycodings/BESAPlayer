# Database Setup Guide

## Problem: Database Connected But Tables Don't Exist

If you see "✅ Database connected successfully" but accounts won't create, it means:
- ✅ Database connection is working
- ❌ Database tables are missing

---

## Quick Fix

Run these commands in the `server` directory:

```bash
cd server
npm run db:push
```

This will create all required tables:
- `users` - User accounts
- `collections` - User's card collections
- `stores` - User stores/seller info
- `sessions` - User login sessions

---

## Step-by-Step Setup

### 1. Verify DATABASE_URL is Set

Make sure your `server/.env` file has:

```env
DATABASE_URL=postgresql://user:password@host:port/database
```

**Examples:**
- **Neon (Cloud PostgreSQL)**: `postgresql://user:pass@ep-xxx.region.aws.neon.tech/dbname?sslmode=require`
- **Local PostgreSQL**: `postgresql://postgres:password@localhost:5432/saplayer`
- **Supabase**: `postgresql://postgres.xxx:password@aws-0-us-east-1.pooler.supabase.com:5432/postgres`

### 2. Create Database Tables

Choose ONE of these methods:

#### Option A: Push Schema (Recommended - Development)
```bash
cd server
npm run db:push
```

This creates tables directly from your schema without migrations.

#### Option B: Run Migrations (Production)
```bash
cd server
npm run db:migrate
```

This runs existing migration files.

#### Option C: Generate & Push (If schema changed)
```bash
cd server
npm run db:generate  # Generate migration files
npm run db:push      # Push to database
```

### 3. Verify Tables Were Created

Check your database or use Drizzle Studio:

```bash
npm run db:studio
```

This opens a web interface at `http://localhost:4983` to view your database.

---

## Troubleshooting

### Error: "relation does not exist" or "table does not exist"

**Solution:** Run `npm run db:push`

### Error: "connection refused" or "can't connect"

**Possible issues:**
1. **DATABASE_URL not set** - Check `.env` file
2. **Wrong credentials** - Verify username/password in DATABASE_URL
3. **Database doesn't exist** - Create database first
4. **Network/firewall** - Cloud databases may need IP whitelisting

**Check your connection:**
```bash
# Test connection (server should show this on startup)
npm run dev
# Look for: "✅ Database connected successfully"
```

### Error: SSL/TLS connection required

For Neon/Supabase, your DATABASE_URL should include `?sslmode=require`:
```
postgresql://user:pass@host/db?sslmode=require
```

### Tables exist but still getting errors

**Try:**
1. Restart your server (`npm run dev`)
2. Check server logs for specific error messages
3. Verify you're connecting to the correct database

---

## Database Schema

Your database will have these tables:

### `users`
- User accounts with profile info
- Email, password, name, preferences
- Level, XP, portfolio value

### `collections`
- User's card collections
- Cards, sealed products, slabs
- Condition, grade, value

### `stores`
- User store/seller profiles
- Store name, verification level, ratings

### `sessions`
- User login sessions
- Tokens, expiration dates

---

## Available Commands

```bash
# Push schema to database (creates/updates tables)
npm run db:push

# Generate migration files from schema changes
npm run db:generate

# Run migrations
npm run db:migrate

# Open Drizzle Studio (database GUI)
npm run db:studio
```

---

## After Setup

Once tables are created, you can:

1. **Test sign-up:**
   ```bash
   curl -X POST http://localhost:3050/api/auth/sign-up \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password123"}'
   ```

2. **Test sign-in:**
   ```bash
   curl -X POST http://localhost:3050/api/auth/sign-in \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password123"}'
   ```

3. **Check in Drizzle Studio:**
   ```bash
   npm run db:studio
   ```
   Look for the `users` table and verify accounts are being created.

---

## Common Issues

### "Database tables not found" Error

**Solution:** Run `npm run db:push` to create tables.

### Connection works but can't create accounts

**Solution:** Tables don't exist - run `npm run db:push`.

### Works on one computer but not another

**Likely cause:** Tables were created on the other computer but not this one.

**Solution:** Run `npm run db:push` on this computer.

### Warning about SSL mode

The PostgreSQL SSL warning is informational. Your connection still works. To suppress it, ensure your DATABASE_URL has proper SSL parameters for your database provider.

---

## Quick Reference

```bash
# 1. Make sure DATABASE_URL is in .env
# 2. Create tables
npm run db:push

# 3. Verify connection
npm run dev
# Should see: "✅ Database connected successfully"

# 4. Test sign-up endpoint
# Should work now!
```

---

**Need more help?** Check the server logs for specific error messages.
