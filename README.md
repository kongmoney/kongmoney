# KongMoney · 콩머니 — live-sheet-v3

Cloudflare Pages + Pages Functions + Google Sheets.

## Production features in this build
- `/api/dashboard?month=YYYY-MM` reads the real Google Sheet.
- Dashboard totals are calculated live from `지출내역` and `대출내역`.
- Member B's 400,000 KRW monthly auto-transfer and carry-over are recalculated in month order.
- `POST /api/expenses` appends a new expense to `지출내역`.
- `/api/health` verifies Google credentials and Sheet access.

## Required Cloudflare Secrets
- `GOOGLE_SHEET_ID`
- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`

Do not commit secrets or service-account JSON files to GitHub.
