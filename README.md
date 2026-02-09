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
    └── 20250209000002_rpc_functions.sql   # create_booking, cancel_booking, admin_grant_credits
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
│   │   └── biz/cars/page.tsx  # /biz/cars — fleet management
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
```
