# PayFast Setup Guide

## ⚠️ IMPORTANT: Sandbox vs Production

**PayFast Sandbox and Production are SEPARATE environments with DIFFERENT credentials!**

- **Sandbox**: For testing only. Uses test merchant IDs that don't process real payments.
- **Production**: For real payments. Uses your actual merchant credentials.

**You CANNOT use production credentials in sandbox mode!**

## Current Configuration

### Production Credentials (Your Real Account)
- **Merchant ID**: `31957853`
- **Merchant Key**: `crrh4hjrcxuzt`
- **Passphrase**: `Shinigami2022`

### Sandbox Credentials (Your Sandbox Account)
- **Merchant ID**: `10045117`
- **Merchant Key**: `dxv5rm6a520rb`
- **Passphrase**: Check your sandbox dashboard (Settings → Developer Settings)
- **Sandbox URL**: `https://sandbox.payfast.co.za/eng/process`

⚠️ **IMPORTANT**: If your sandbox account has a passphrase set, you MUST include it in the signature. Check your sandbox dashboard to see if a passphrase is configured.

## Environment Variables

Create or update `server/.env.local` with:

```env
PAYFAST_MERCHANT_ID=31957853
PAYFAST_MERCHANT_KEY=crrh4hjrcxuzt
PAYFAST_PASSPHRASE=Shinigami2022
PAYFAST_SANDBOX=true
BACKEND_URL=http://localhost:3050
```

## Important Notes

### Sandbox vs Production

- **Sandbox Mode**: Use for testing. Set `PAYFAST_SANDBOX=true`
- **Production Mode**: Use for live payments. Set `PAYFAST_SANDBOX=false`

⚠️ **Important**: Your merchant credentials must match the environment:
- Sandbox credentials → Use sandbox mode
- Production credentials → Use production mode

### Passphrase

The passphrase **MUST** be included in the signature if it's set in your PayFast account. The code now includes it by default.

### Testing

1. Make sure your server is running: `npm run dev` in `server/` directory
2. Test payment flow in the app
3. Check server logs for debug information
4. Use PayFast sandbox test cards:
   - Success: `4000 0000 0000 0002`
   - Decline: `4000 0000 0000 0069`

## Troubleshooting

### "Invalid merchant ID" Error

This usually means:
1. **Wrong environment**: Using production credentials with sandbox, or vice versa
2. **Wrong merchant ID**: Double-check your PayFast dashboard
3. **Missing passphrase**: If passphrase is set in PayFast, it MUST be included

### "Invalid signature" Error

This means:
1. Passphrase mismatch
2. Parameter order issue
3. Missing required fields

Check server logs for debug output.
