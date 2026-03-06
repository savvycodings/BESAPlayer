# Drop-off code and push notifications

## Flow

1. User pays R100 for verification → a **verification order** is created with `dropoff_code` initially empty (or a placeholder).
2. Your team creates a manual payment/order with the courier/PUDO service provider and receives the **real drop-off code**.
3. You call the **PATCH API** (below) with that code → the server updates the DB and sends **one Expo push** to **that user only**. They get the notification with the code and 24h message.

**Important:** Updating the database directly (e.g. SQL or admin UI) does **not** send a push. Only the PATCH endpoint updates the row and sends the notification. Use the API when you have the code so the user is notified.

## Why push (and not polling)

- **One push per user** – Only the user who owns that verification order gets the notification (we look up `verification_orders.user_id` → `users.expo_push_token`). No one else is notified.
- **Scales** – Expo Push Service handles delivery; your server does one HTTP request to Expo per code you set.
- **Cheaper than polling** – If every app user had to poll or send timestamps to check for new codes, you’d get many more requests from all clients. With push, you send a single request when *you* set the code, and only that device gets the message.

## Setting the drop-off code and notifying the user

**Use the API (this is what triggers the push):**  
When you have the code from the service provider, call:

```http
PATCH /api/verification-orders/:id/dropoff-code
Content-Type: application/json
X-Admin-Secret: <ADMIN_SECRET>

{ "dropoffCode": "ABC123" }
```

- Replace `:id` with the verification order id (from `verification_orders` table).
- Set the `ADMIN_SECRET` env var on the server and pass the same value in the `X-Admin-Secret` header (or in the body as `adminSecret`).
- The server will:
  - Update `verification_orders.dropoff_code` for that row.
  - Look up **that order’s user** and send **one** Expo push to their `expo_push_token` (title **"Your drop-off code is ready"**, body with code and expiry).

**If you update the DB only:**  
No push is sent. The user will only see the code when they open the app and you show it from the API (e.g. GET verification-orders). To notify them, use the PATCH endpoint instead of (or after) updating the row.

## Push token (Expo)

- The app registers for push when the user is logged in and sends the **Expo push token** to the backend via `PUT /api/profile/push-token`.
- The backend stores it in `users.expo_push_token`.
- Run the migration that adds `expo_push_token` to `users` (e.g. `0031_users_expo_push_token.sql` or `npm run db:push`).

## Env

- **Server:** `ADMIN_SECRET` – shared secret for `PATCH .../dropoff-code` (and optionally other admin actions).

## Example: set code and notify (curl)

```bash
curl -X PATCH "https://your-api.com/api/verification-orders/42/dropoff-code" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: your-admin-secret" \
  -d '{"dropoffCode": "PUDO123"}'
```
