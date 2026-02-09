# ForzaCars Rentals

A car-rental web app built with **Next.js 14+** (App Router), **TypeScript**, and **Tailwind CSS**.

## Getting Started

```bash
# Install dependencies
npm install

# Copy the example env file and fill in your keys
cp .env.example .env.local

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values.

| Variable | Side | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anonymous (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** | Supabase service-role key — never import in client code |
| `RESEND_API_KEY` | **Server-only** | Resend API key for transactional email |
| `APP_BASE_URL` | Server | Base URL of the running app (e.g. `http://localhost:3000`) |

> **Important:** `SUPABASE_SERVICE_ROLE_KEY` and `RESEND_API_KEY` must never be imported
> into client components or exposed in the browser bundle. Only use them in server-side
> code (Server Actions, Route Handlers, scripts).

## Database

The Postgres schema lives in `supabase/migrations/` and is managed via the Supabase CLI.

| Table | Purpose |
|---|---|
| `businesses` | Rental companies |
| `profiles` | User profiles (1 : 1 with `auth.users`) |
| `cars` | Vehicles belonging to a business |
| `cars_catalog` | Wiki-sourced reference cars (Forza Horizon 2) — publicly readable |
| `car_availability_rules` | Recurring weekly time windows a car is bookable |
| `car_blackouts` | Ad-hoc unavailability periods (maintenance, etc.) |
| `bookings` | Reservations — includes a GiST exclusion constraint to prevent double-booking |
| `credit_ledger` | Append-only ledger of credit debits / credits per user |
| `audit_log` | Generic activity log for admin visibility |

Every table has **Row-Level Security** enabled (deny-by-default). Key rules:

| Role | Access |
|---|---|
| **Anon** | Read active cars only |
| **Customer** | Read own profile, bookings, credit ledger |
| **Business** | CRUD on own cars / availability / blackouts; read bookings for own cars |
| **Admin** | Full read/write on everything |

`bookings`, `credit_ledger`, and `audit_log` are **read-only from the client** — all writes go through `SECURITY DEFINER` RPCs:

| RPC | Who can call | What it does |
|---|---|---|
| `create_booking(car_id, start_ts, end_ts)` | Customer | Validates availability/blackouts/balance, inserts booking + debit ledger atomically |
| `cancel_booking(booking_id)` | Owner or Admin | Tiered refund (100 % / 50 % / 0 %), updates status + refund ledger atomically |
| `admin_grant_credits(user_id, amount, reason)` | Admin | Adds credits to any user's balance |

EXECUTE privileges are revoked from `public` / `anon` and granted only to `authenticated`.

A database trigger auto-creates a `profiles` row (role = `CUSTOMER`) whenever a new `auth.users` entry is inserted.

Apply migrations locally:

```bash
supabase db reset   # drops & recreates from migrations
# — or —
supabase migration up
```

## Importing FH2 Cars

The `cars_catalog` table is populated by a server-only script that scrapes the
[Forza Horizon 2 car list](https://forza.fandom.com/wiki/Forza_Horizon_2/Cars)
from the Forza Fandom wiki.

```bash
# Dry-run — parse and print summary, no DB writes
npm run import:fh2:dry

# Full import — parse, fetch images, upsert into Supabase
npm run import:fh2
```

**Requirements:** `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must
be set in `.env.local`.  The script uses the service-role key to bypass RLS.

The import is **idempotent** — re-running it updates existing rows matched by the
`(source, source_game, wiki_page_title)` unique constraint.

What the script does:

1. Fetches the page HTML via the MediaWiki `parse` API.
2. Locates the main cars table (by matching `Vehicle` + `PI` headers) and parses
   every row with **cheerio** — extracts year, manufacturer, model, stats, and PI.
3. Batch-fetches thumbnail images (600 px) via the MediaWiki `PageImages` API
   (batches of 50, 250 ms delay, exponential back-off on 429 / 5xx).
4. Upserts everything into `cars_catalog`.

> **Note:** Stats (speed, handling, acceleration, launch, braking) are stored as
> integers on a **0 – 100 scale** (original 0 – 10 float × 10).  PI is stored as-is.

## Managing Inventory Units (Business Portal)

Business users can manage their car-unit inventory at `/biz/inventory`.

### Bulk-adding units

1. Navigate to **Inventory → + Bulk Add Units** (or `/biz/inventory/new`).
2. Search and select a car model from the global catalog.
3. Add 1–20 unit rows, each with a required **color** and optional:
   - **Color hex** (`#RRGGBB`)
   - **VIN** (auto-generated if blank)
   - **License plate** (auto-generated if blank)
   - **Credits/hour override** (uses model's suggested price if blank)
4. Use the **preset color chips** (Red, Blue, Black, etc.) for quick entry.
5. Review the summary and click **Create Units**.

All writes are validated server-side with [zod](https://zod.dev) and go through
a server action. VIN and license-plate defaults are generated by Postgres
functions with collision-safe retry loops. An `audit_log` entry is recorded for
every bulk-create action.

### Inventory list

`/biz/inventory` shows all units with:

- Model name, color (with hex swatch), VIN, and license plate
- Effective price: unit override (labelled "override") or model suggested price
- Active / Inactive status toggle

### Customer-facing availability

On `/cars/[id]` (public model detail page), customers can:

- See how many units are available for the next 24 hours
- Filter by **color** using clickable chip buttons
- Each unit shows an "Available" or "Busy" badge based on confirmed bookings and
  blackout windows

## Authentication & Routing

Authentication uses **Supabase Auth** with email / password.  All gating is **server-side**.

| Layer | What it checks |
|---|---|
| **Middleware** (`src/middleware.ts`) | Refreshes the session token; redirects guests away from protected paths (`/cars`, `/biz/*`, `/admin/*`) |
| **Route-group layouts** | `(customer)`, `(business)`, `(admin)` layouts call `requireRole()` — wrong role → redirect to correct dashboard |

Post-login redirects:

| Role | Dashboard |
|---|---|
| CUSTOMER | `/cars` |
| BUSINESS | `/biz/cars` |
| ADMIN | `/admin/users` |

## Project Structure

```
supabase/
└── migrations/
    ├── 20250209000000_core_schema.sql     # Tables, constraints, indexes
    ├── 20250209000001_rls_policies.sql    # RLS, auth trigger, helper fns
    ├── 20250209000002_rpc_functions.sql   # create_booking, cancel_booking, admin_grant_credits
    └── 20250209000003_cars_catalog.sql    # cars_catalog table (wiki import target)
src/
├── app/
│   ├── layout.tsx             # Root layout (async navbar)
│   ├── page.tsx               # Public home page
│   ├── globals.css
│   ├── login/
│   │   ├── page.tsx           # Login form
│   │   └── actions.ts         # login server action
│   ├── signup/
│   │   ├── page.tsx           # Sign-up form
│   │   └── actions.ts         # signup server action
│   ├── auth/callback/
│   │   └── route.ts           # Code-exchange after email confirm / OAuth
│   ├── (customer)/
│   │   ├── layout.tsx         # requireRole("CUSTOMER")
│   │   └── cars/page.tsx      # /cars — car browsing
│   ├── (business)/
│   │   ├── layout.tsx         # requireRole("BUSINESS")
│   │   ├── biz/cars/page.tsx  # /biz/cars — fleet management
│   │   ├── biz/inventory/page.tsx     # /biz/inventory — unit list
│   │   └── biz/inventory/new/page.tsx # /biz/inventory/new — bulk add
│   └── (admin)/
│       ├── layout.tsx         # requireRole("ADMIN")
│       └── admin/users/page.tsx # /admin/users — user management
├── components/
│   └── Navbar.tsx             # Role-aware async server component
├── lib/
│   ├── auth/
│   │   ├── getProfile.ts     # Cached profile fetcher
│   │   ├── requireRole.ts    # Server-side role gate + getDashboardPath
│   │   └── actions.ts        # signOut server action
│   └── supabase/
│       ├── client.ts          # Browser Supabase client
│       ├── server.ts          # Server Supabase client (cookies)
│       └── middleware.ts      # Session refresh + route protection
└── middleware.ts              # Next.js middleware entry point
scripts/
└── import_fh2_cars.ts         # Wiki car importer (server-only, uses service role)
```
