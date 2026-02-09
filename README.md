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

`bookings`, `credit_ledger`, and `audit_log` are **read-only from the client** — all writes go through `SECURITY DEFINER` RPCs (to be added).

A database trigger auto-creates a `profiles` row (role = `CUSTOMER`) whenever a new `auth.users` entry is inserted.

Apply migrations locally:

```bash
supabase db reset   # drops & recreates from migrations
# — or —
supabase migration up
```

## Project Structure

```
supabase/
└── migrations/
    ├── 20250209000000_core_schema.sql    # Tables, constraints, indexes
    └── 20250209000001_rls_policies.sql   # RLS, auth trigger, helper fns
src/
├── app/
│   ├── layout.tsx        # Root layout with navbar
│   ├── page.tsx          # Home page
│   ├── globals.css       # Tailwind global styles
│   ├── cars/
│   │   └── page.tsx      # Cars listing (placeholder)
│   └── login/
│       └── page.tsx      # Login (placeholder)
├── components/
│   └── Navbar.tsx        # Site-wide navigation bar
├── lib/
│   └── supabase/
│       ├── client.ts     # Browser Supabase client
│       ├── server.ts     # Server Supabase client (cookies)
│       └── middleware.ts  # Session refresh helper
└── middleware.ts          # Next.js middleware entry point
```
