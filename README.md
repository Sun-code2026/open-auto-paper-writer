# MSCSL Research Paper Writer v2

Research Paper Writer v2 turns research notes, hypotheses, and data summaries into a journal-style manuscript draft. Unlike v1, users do not enter their own OpenAI API key. The browser talks to a backend API, and the backend stores the OpenAI key, checks subscription status, and calls OpenAI on behalf of active monthly subscribers.

## What v2 Adds

- Email-based session flow for users.
- Server-side OpenAI key storage through `OPENAI_API_KEY`.
- Subscription gate before manuscript generation.
- Optional Stripe Checkout endpoint for monthly billing.
- PubMed-grounded citation rewriting with validated PMIDs.

## Pipeline

1. Generate a structured outline from research content and keywords.
2. Draft each manuscript section with citation placeholders.
3. Search PubMed through NCBI E-utilities, fetch real PMID metadata and abstracts, and rewrite claims using only retrieved articles.
4. Run a reviewer agent that flags logic gaps, evidence weakness, structure issues, and readability problems.

## Safety Features

- PubMed failures return empty results instead of fabricated citations.
- Browser XML parsing includes a conservative regex fallback.
- Model-returned PMIDs are accepted only when they match retrieved PubMed records.
- If no PubMed evidence is found, the original section draft is preserved.
- The final references section is deduplicated from actually used references.

## Local Setup

Copy environment variables:

```bash
cp .env.example .env
```

Set at least:

```bash
OPENAI_API_KEY=sk-your-server-side-openai-key
APP_SESSION_SECRET=replace-with-a-long-random-string
REQUIRE_ACTIVE_SUBSCRIPTION=false
MONTHLY_AI_REQUEST_LIMIT=120
```

Install and run:

```bash
npm install
npm run dev:server
npm run dev
```

Open the Vite URL and log in with an email address. For local testing, `REQUIRE_ACTIVE_SUBSCRIPTION=false` lets any logged-in user generate manuscripts.

## Monthly Subscription Mode

For production, set:

```bash
REQUIRE_ACTIVE_SUBSCRIPTION=true
ALLOWED_SUBSCRIBERS=paid-user@example.com
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRICE_ID=price_...
PUBLIC_APP_URL=https://your-frontend-domain
APP_ORIGIN=https://your-frontend-domain
```

The current implementation supports two subscription checks:

1. Manual allow-list through `ALLOWED_SUBSCRIBERS`.
2. Stripe Checkout session creation through `/api/billing/checkout`.

For full production billing, add a Stripe webhook that listens for subscription events and persists active customers in a database. The current allow-list is suitable for v2 pilot usage and manual monthly subscribers.

## Keeping AI Costs Inside the Monthly Fee

Users still do not provide an API key. The service owner keeps one server-side `OPENAI_API_KEY`, and monthly subscription revenue covers the provider invoice.

Use `MONTHLY_AI_REQUEST_LIMIT` to cap each subscriber's monthly AI calls. This protects the operator from unlimited model usage. For example, if a plan costs $19/month, set a monthly request limit that leaves margin after expected OpenAI, hosting, payment, and support costs.

The pilot implementation stores usage in memory. Before production, move usage records to a database so counters survive server restarts.

## Deployment

GitHub Pages can host the frontend, but it cannot run the backend API. Deploy the server to a Node-capable host such as Render, Railway, Fly.io, or a VPS, then build the frontend with:

```bash
VITE_API_BASE_URL=https://your-api-domain npm run build
```

Keep `OPENAI_API_KEY` and `STRIPE_SECRET_KEY` only on the backend host.
