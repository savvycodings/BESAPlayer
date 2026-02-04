# Ngrok Setup Guide

## Quick Setup

### 1. Sign up for Ngrok (Free)
Go to: https://dashboard.ngrok.com/signup

### 2. Get Your Authtoken
After signing up, go to: https://dashboard.ngrok.com/get-started/your-authtoken

Copy your authtoken (looks like: `2abc123def456ghi789jkl012mno345pqr678stu901vwx234yz`)

### 3. Configure Ngrok

**Option A: Using npx (Recommended)**
```bash
cd server
npx ngrok config add-authtoken YOUR_AUTHTOKEN_HERE
```

**Option B: If you have ngrok installed globally**
```bash
ngrok config add-authtoken YOUR_AUTHTOKEN_HERE
```

### 4. Run Ngrok
```bash
cd server
npm run ngrok
```

You'll see output like:
```
Forwarding  https://abc123-def456.ngrok-free.app -> http://localhost:3050
```

### 5. Update Environment Variables

**`server/.env`:**
```env
BETTER_AUTH_URL=https://abc123-def456.ngrok-free.app
```

**`app/.env`:**
```env
EXPO_PUBLIC_BACKEND_URL=https://abc123-def456.ngrok-free.app
```

---

## Alternative: Use LocalTunnel (No Account Needed)

If you don't want to sign up for ngrok, use LocalTunnel instead:

### Install LocalTunnel
```bash
npm install -g localtunnel
```

### Run LocalTunnel
```bash
lt --port 3050
```

You'll get a URL like: `https://random-name.loca.lt`

### Update Environment Variables
Use the LocalTunnel URL in your `.env` files instead of ngrok.

---

## Troubleshooting

**"ngrok: command not found"**
- Use `npx ngrok` instead of just `ngrok`
- Or install globally: `npm install -g ngrok`

**"authentication failed"**
- Make sure you've run: `npx ngrok config add-authtoken YOUR_TOKEN`
- Check your token is correct

**URL changes every time**
- Free ngrok URLs change on restart
- Use a paid ngrok account for fixed domains
- Or use LocalTunnel with `--subdomain` flag (requires account)
