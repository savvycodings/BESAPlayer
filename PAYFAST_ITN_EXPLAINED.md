# PayFast ITN (Instant Transaction Notification) Explained

## What is an ITN?

An **ITN (Instant Transaction Notification)** is PayFast's way of notifying your server that a payment has been processed. It's sent as a POST request to your `notify_url` endpoint.

## ITN Payload Breakdown

Here's what each field in your ITN payload means:

### Payment Identifiers
- **`m_payment_id`**: Your custom payment ID (the one you sent: `pf_1768855570938_f7cccs01d`)
- **`pf_payment_id`**: PayFast's internal payment ID (`2972258`) - use this for support/reference

### Payment Status
- **`payment_status`**: Current status of the payment
  - `COMPLETE` ✅ - Payment successful and funds transferred
  - `FAILED` ❌ - Payment failed
  - `PENDING` ⏳ - Payment is being processed
  - `CANCELLED` 🚫 - Payment was cancelled

### Financial Details
- **`amount_gross`**: Total amount charged to customer (`165.00`)
- **`amount_fee`**: PayFast's processing fee (`-3.80` - negative because it's deducted)
- **`amount_net`**: Amount you receive after fees (`161.20`)

### Transaction Details
- **`item_name`**: Product name (`Flareon Ex`)
- **`item_description`**: Product description
- **`name_first`**: Customer's first name
- **`name_last`**: Customer's last name
- **`email_address`**: Customer's email

### Security
- **`merchant_id`**: Merchant ID that processed the payment
- **`signature`**: PayFast's signature for verification (must verify this!)

### Custom Fields (Optional)
- **`custom_str1` through `custom_str5`**: Custom string fields you can send
- **`custom_int1` through `custom_int5`**: Custom integer fields you can send

## Your Current ITN

Based on your ITN payload:

✅ **Payment Status**: `COMPLETE` - Payment was successful!
💰 **Amount Charged**: R165.00
💸 **PayFast Fee**: R3.80
💵 **You Receive**: R161.20
📦 **Item**: Flareon Ex

## What Your Server Should Do

When you receive an ITN with `payment_status=COMPLETE`:

1. ✅ **Verify the signature** (already done in code)
2. ✅ **Verify the amount** matches what you expected
3. ✅ **Update order status** in your database
4. ✅ **Notify the seller** that payment was received
5. ✅ **Send confirmation** to the buyer
6. ✅ **Update inventory** if applicable
7. ✅ **Return 200 OK** to PayFast (required!)

## Security Best Practices

1. **Always verify the signature** - ensures the ITN came from PayFast
2. **Verify the amount** - prevents tampering
3. **Check payment_status** - only process `COMPLETE` payments
4. **Use m_payment_id** - match it to your order records
5. **Log everything** - for debugging and audit trails

## Next Steps

The ITN handler currently just logs the payment. You should:

1. Create an orders/payments table in your database
2. Store payment details when ITN is received
3. Update order status to "paid" or "completed"
4. Send notifications (email, push, etc.)
5. Update product inventory if needed
