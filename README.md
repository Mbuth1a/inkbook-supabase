# Mwamba Ink: tattoo booking site with M-Pesa deposits

A fast, mobile-first site for a Nairobi tattoo artist: portfolio, a four-step intake and booking flow, and an M-Pesa STK Push deposit that locks the slot. Studio name, prices, hours and styles are placeholders. Change them in `lib/config.ts`.

## Run it

```bash
npm install
cp .env.example .env.local     # MPESA_ENV=mock works with no credentials
npm run dev                     # http://localhost:3000/book
npm test                        # slot rules, double-booking, payment edge cases
```

In **mock mode** the "M-Pesa prompt" resolves by itself after 4 seconds. Use these phone numbers to test the unhappy paths:

| Number ends in | Behaviour |
| --- | --- |
| anything else | payment succeeds |
| `0000` | customer cancels the prompt |
| `1111` | prompt is never answered (stays pending, then expires after 5 min) |

The artist dashboard is at `/admin`. Sign in with `ADMIN_PASSWORD` (set it in `.env.local`, 8+ characters, and set `SESSION_SECRET` to a 16+ character random string). Bookmark `/admin` on a phone. From there you can track bookings (mark done, cancel, resolve payment issues, WhatsApp or call clients) and upload art to the gallery at `/admin/gallery`.

## How a booking works

1. The client fills in style, idea, size, placement and reference photos, then picks a date and time. Session length depends on size, so a 6-hour piece only sees days where 6 free hours exist.
2. On submit the server **atomically** checks the slot and inserts a 5-minute hold (a SQLite transaction, so two people cannot take the same slot), then sends the STK Push.
3. The client lands on `/book/<id>` and waits. The booking is confirmed when Safaricom's callback arrives. If the callback is late, the status poll asks Safaricom directly via the STK Query API.
4. Failure paths are handled: cancelled prompt, wrong PIN, timeout, insufficient balance. The slot is released immediately and the client can retry.
5. Late payment: if the money arrives after the hold lapsed, the booking is still honoured **if the slot is free**. If someone else took it, the booking is flagged `paid_conflict` and shows in `/admin` for a manual refund or rebook. Underpayments are flagged the same way.

## Going live with M-Pesa (Daraja)

1. Create an account at [developer.safaricom.co.ke](https://developer.safaricom.co.ke), create an app, and copy the sandbox consumer key and secret into `.env.local`.
2. Set `MPESA_ENV=sandbox`, `MPESA_SHORTCODE=174379` and the sandbox passkey from the portal.
3. Daraja must reach your callback over public HTTPS, so for local testing run a tunnel (`cloudflared tunnel --url http://localhost:3000` or ngrok) and set `SITE_URL` to the tunnel URL.
4. For production, the artist needs a Paybill or Till number. Apply for Go Live in the portal, then set `MPESA_ENV=live` with the production key, secret, shortcode and passkey. Use `CustomerBuyGoodsOnline` for a Till, `CustomerPayBillOnline` for a Paybill.
5. Set `MPESA_CALLBACK_SECRET` to a long random string. Safaricom does not sign callbacks, so the secret in the callback URL is what stops forged "payment received" requests.

Only Safaricom lines receive STK prompts. The form says so, and Airtel customers would need a different route (Pesapal or Flutterwave, see below).

## Deploying

SQLite and uploaded photos live on disk (`data/`, `uploads/`), so use a server with a **persistent disk** (a small VPS, behind Caddy or nginx for HTTPS). Serverless hosts such as Vercel will lose data. Back up both folders daily. To move to a managed database later, only `lib/db.ts` and `lib/bookings.ts` contain SQL.

```bash
npm run build && npm start     # run under systemd or pm2
```

## Still to do before launch

- **Real content**: studio details in `lib/config.ts`, photos in `public/portfolio` listed in `content/portfolio.ts`, and your real prices and policies in `content/faq.ts` (the figures there are placeholders).
- **Notifications**: `lib/notify.ts` only logs. Connect Africa's Talking (client SMS), email via Resend, and a WhatsApp or Telegram alert to the artist.
- **Admin sign-in**: the token-in-URL admin is a stopgap. Replace with Auth.js limited to the artist's email.
- **Refunds, reschedules, blocked days**: refunds are manual through M-Pesa. Block days off by inserting rows into `blocked_dates`. A UI for this is the natural next feature.
- **Images**: client reference photos are stored unprocessed on disk. Strip EXIF location data and move to object storage (Cloudflare R2) if volume grows.
- **Legal**: add a privacy notice (Kenya Data Protection Act) since the form collects names, phone numbers and photos.

## Design decisions

- **Own slot engine instead of Cal.com**: one artist with size-dependent session lengths and a payment-gated hold is simpler and safer in ~150 lines than coordinating Cal.com's booking lifecycle with a separate payment webhook.
- **Daraja directly instead of an aggregator**: lower fees and fewer moving parts for M-Pesa-only deposits. Pesapal or Flutterwave are worth it if the artist wants card and Airtel Money too; they would replace `lib/mpesa.ts` only.
- **Portfolio from a file instead of a CMS**: no extra service to run. Add Sanity later if the artist wants to upload from a phone.
- **System fonts, no client-side libraries beyond React**: the pages stay light on mobile data.

## Booking modes

- **Request mode (default, `BOOKING_PAYMENTS=request`):** the client picks a slot and sends a booking request. The slot is held until you open `/admin`, see the deposit arrive in M-Pesa, and tap **Accept**. Decline frees the slot. Nothing is charged automatically, and no Safaricom approval or VPS is needed.
- **M-Pesa mode (`BOOKING_PAYMENTS=mpesa`):** the automatic Daraja prompt described below. Switch to this later, once Safaricom approves the account and the server is public HTTPS.

## How payments are protected (M-Pesa mode)

Safaricom's callbacks are unsigned, so the site never trusts a callback on its own:

1. The callback URL has a secret (`MPESA_CALLBACK_SECRET`). Wrong secret: 404.
2. Each callback triggers a status query to Safaricom for the same CheckoutRequestID. Only Safaricom's answer is applied. A forged callback for a payment that never happened is ignored.
3. Optional source-IP allowlist: set `MPESA_CALLBACK_IPS` (for example `196.201.212.0/24`) only after you have confirmed the current ranges with Safaricom. Leave it empty otherwise. Safaricom does not publish official ranges.

### Caddy in front of the site (live server)

Caddy handles HTTPS. Run the site on localhost only so nothing can bypass Caddy:

```
# Caddyfile
studio.yourdomain.com {
  reverse_proxy 127.0.0.1:3000 {
    header_up X-Real-IP {remote_host}
  }
}
```

Start the site with `npm run start -- -H 127.0.0.1 -p 3000`. Set `MPESA_TRUST_PROXY=1` in `.env.local` only when this setup is in place, because the IP check reads the header Caddy sets.

## Go-live checklist

1. In `.env.local`, set `SITE_URL` to your public `https://` address. Safaricom cannot reach `localhost`.
2. Set `MPESA_ENV=sandbox` first. Use the sandbox consumer key, secret and passkey from the portal, with shortcode `174379`. Make a test booking with a Safaricom number and approve the prompt.
3. Once the sandbox works, get Go Live approval for the artist's Paybill or Till. Then set `MPESA_ENV=live`, the production key, secret, shortcode, passkey, and `MPESA_TRANSACTION_TYPE` (`CustomerPayBillOnline` for a Paybill, `CustomerBuyGoodsOnline` for a Till).
4. Replace `MPESA_CALLBACK_SECRET` with a long random string, and change `ADMIN_PASSWORD` to a strong one.
5. Open `/admin`. The dashboard lists any setup problems in a red box until they're fixed, and shows a yellow "Test mode" box while payments are simulated.
6. Make one small real booking, then cancel it from the dashboard and refund it in M-Pesa.
