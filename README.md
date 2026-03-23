# FREEFORM

A dead-simple, self-hostable form builder. No accounts for respondents. No data sold. Results export as CSV. Webhook support included.

## Stack
- Node.js / Express
- SQLite (better-sqlite3)
- Zero frontend dependencies

## Run locally

```
npm install
cp .env.example .env
npm start
```

## Deploy

Deploy to Railway, Render, Fly.io, or any Node host. Set `DB_PATH` to a persistent volume path.

## Self-hosting

Fork it. Own your data. MIT licensed.
