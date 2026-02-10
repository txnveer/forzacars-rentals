# ForzaCars Rentals - Production Deployment Guide

## 🚀 MVP Deployment: Vercel + Supabase

This guide walks you through deploying ForzaCars Rentals to production using:
- **Vercel** for Next.js hosting
- **Supabase** for database, auth, and storage
- **Supabase built-in emails** for auth flows (no Resend needed for MVP)

---

## Prerequisites

- [x] GitHub repository with latest code pushed to `main` branch
- [x] Vercel account (free tier works)
- [x] Supabase project already created

---

## Part 1: Supabase Configuration

### 1.1 Run Database Migrations

**Option A: Using Supabase SQL Editor (Recommended for MVP)**

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Open the file `supabase/all_migrations.sql` from your project
4. Copy the entire contents
5. Paste into the SQL Editor
6. Click **Run** to execute all migrations
7. Verify success (check Tables tab to see all tables created)

**Option B: Using Supabase CLI** (if you have it installed)

```bash
# Install Supabase CLI if needed
npm install -g supabase

# Login
supabase login

# Link your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

### 1.2 Enable Email/Password Authentication

1. In Supabase Dashboard, go to **Authentication → Providers**
2. Ensure **Email** provider is **enabled**
3. Configure email settings:
   - **Enable email confirmations**: Toggle ON if you want users to confirm email before login
   - **Secure email change**: Toggle ON (recommended)
   - **Enable phone confirmations**: Leave OFF (not needed for MVP)

### 1.3 Configure Auth Email Templates

1. Go to **Authentication → Email Templates**
2. Review the default templates for:
   - **Confirm signup**: Sent when user signs up (if confirmation enabled)
   - **Reset password**: Sent when user requests password reset
   - **Magic Link**: Not needed for MVP
   - **Change Email Address**: Sent when user changes email

**Important**: The default templates use `{{ .SiteURL }}` and `{{ .ConfirmationURL }}` which will be automatically configured in the next step.

### 1.4 Set Auth URL Configuration (CRITICAL - Do this AFTER Vercel deployment)

⚠️ **You'll need to come back to this step after deploying to Vercel to get your production URL**

1. Go to **Authentication → URL Configuration**
2. Set the following (replace `<your-vercel-domain>` with your actual Vercel URL):

**Site URL**: 
```
https://<your-vercel-domain>.vercel.app
```

**Redirect URLs** (add all of these):
```
http://localhost:3000/**
https://<your-vercel-domain>.vercel.app/**
https://<your-vercel-domain>.vercel.app/auth/callback
```

💡 **Why this matters**: Supabase uses these URLs to:
- Redirect users after email confirmation
- Redirect users after password reset
- Validate auth callback requests

### 1.5 Verify Storage Buckets

1. Go to **Storage** in left sidebar
2. Verify these buckets exist (they should if migrations ran successfully):
   - `car-images` (for business-uploaded car unit photos)
   - `car-model-images` (if you're using it)

3. For each bucket, check **Policies** tab:
   - Public read access should be enabled
   - Write access should be restricted to authenticated business users

---

## Part 2: Vercel Deployment

### 2.1 Connect GitHub Repository

1. Go to https://vercel.com/new
2. Click **Import Git Repository**
3. Select your GitHub account and the `forzacars-rentals` repository
4. Click **Import**

### 2.2 Configure Project Settings

**Framework Preset**: Next.js (should auto-detect)

**Root Directory**: `./` (leave default)

**Build Command**: `npm run build` (leave default)

**Output Directory**: `.next` (leave default)

**Install Command**: `npm install` (leave default)

**Node.js Version**: 20.x (default is fine)

### 2.3 Add Environment Variables

Click **Environment Variables** and add the following:

#### Required for All Environments (Production, Preview, Development)

Get these from your Supabase Dashboard → Settings → API:

```bash
# Supabase Public Keys (get from your Supabase Dashboard → Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here

# Supabase Service Role Key (server-only, highly sensitive)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

#### Optional (for better timezone handling)

```bash
# Server timezone (for consistent server-side date formatting)
APP_TZ=America/Chicago
```

**DO NOT ADD** (not needed for MVP):
- `RESEND_API_KEY` (we're using Supabase emails)

### 2.4 Deploy

1. Click **Deploy**
2. Wait for the build to complete (2-3 minutes)
3. Once deployed, you'll see your production URL: `https://<your-project>.vercel.app`

**Copy this URL** - you'll need it for the next step!

### 2.5 Update Supabase Auth URLs (CRITICAL)

⚠️ **Go back to Supabase Dashboard now**

1. Go to **Authentication → URL Configuration**
2. Update with your actual Vercel URL:

**Site URL**: 
```
https://<your-project>.vercel.app
```

**Redirect URLs**:
```
http://localhost:3000/**
https://<your-project>.vercel.app/**
https://<your-project>.vercel.app/auth/callback
```

3. Click **Save**

---

## Part 3: Post-Deployment Configuration

### 3.1 Set Up Custom Domain (Optional)

If you have a custom domain (e.g., `forzacars.com`):

1. In Vercel Dashboard, go to **Settings → Domains**
2. Add your domain
3. Follow DNS instructions (add CNAME or A record)
4. After DNS propagates, **update Supabase Auth URLs** again with custom domain

### 3.2 Create Admin User

You need an admin account to manage the platform:

1. Sign up for a new account at: `https://<your-project>.vercel.app/signup`
2. Use email: `forzarentalsadmin@proton.me` (or your preferred admin email)
3. Check your email and confirm (if email confirmation is enabled)
4. Promote to admin via SQL:

```sql
-- In Supabase SQL Editor
UPDATE public.profiles
SET role = 'ADMIN'
WHERE email = 'forzarentalsadmin@proton.me';
```

### 3.3 Create Test Business Account

1. Sign up for a business account at: `https://<your-project>.vercel.app/signup`
2. Promote to business role and link to a business:

```sql
-- Create a test business
INSERT INTO public.businesses (name, email, phone)
VALUES ('Test Rental Co', 'business@test.com', '555-0100')
RETURNING id;

-- Link user to business (replace user_id and business_id)
UPDATE public.profiles
SET role = 'BUSINESS',
    business_id = '<business_id_from_above>'
WHERE email = 'business@test.com';
```

---

## Part 4: Smoke Tests (Critical)

Test these flows in production:

### ✅ 4.1 Public Access (No Login)
- [ ] Visit homepage - should load without login
- [ ] Browse `/cars` - should show car list
- [ ] View car detail `/cars/[id]` - should show details and scheduler
- [ ] Try to book - should redirect to `/login` with returnTo parameter

### ✅ 4.2 Sign Up Flow
- [ ] Go to `/signup`
- [ ] Enter email and password
- [ ] Submit form
- [ ] Check email for confirmation link (if enabled)
- [ ] Click confirmation link
- [ ] Should redirect to `/cars` or returnTo destination
- [ ] Navbar should show logged-in state with email and "Customer" badge

### ✅ 4.3 Login Flow
- [ ] Go to `/login`
- [ ] Enter credentials
- [ ] Submit form
- [ ] Should redirect to `/cars` or returnTo destination
- [ ] Navbar shows correct user info

### ✅ 4.4 Password Reset Flow
- [ ] Go to `/forgot-password`
- [ ] Enter email
- [ ] Submit form
- [ ] Check email for reset link
- [ ] Click reset link
- [ ] Should redirect to `/reset-password` with token
- [ ] Enter new password
- [ ] Submit
- [ ] Should be able to login with new password

### ✅ 4.5 Booking Flow (Customer)
- [ ] Login as customer
- [ ] Browse to a car detail page
- [ ] Use scheduler to select a time window (test multi-day)
- [ ] Verify pricing calculation shows correct breakdown
- [ ] Click "Book Now"
- [ ] Should create booking and charge credits
- [ ] Check `/bookings` - should show new booking with correct timezone

### ✅ 4.6 Business Portal
- [ ] Login as business user
- [ ] Go to `/biz/fleet`
- [ ] Should see fleet management interface
- [ ] Try adding a car unit
- [ ] Upload an image for a unit
- [ ] Check `/biz/bookings` - should see all bookings for your fleet

### ✅ 4.7 Admin Portal
- [ ] Login as admin
- [ ] Go to `/admin/users`
- [ ] Should see all users
- [ ] Go to `/admin/bookings`
- [ ] Should see all bookings across all businesses
- [ ] Test granting credits to a user

---

## Part 5: Monitoring & Troubleshooting

### 5.1 View Logs

**Vercel Logs**:
1. Go to your project in Vercel Dashboard
2. Click **Deployments** → Select deployment → **Functions**
3. View real-time logs for each serverless function

**Supabase Logs**:
1. Go to Supabase Dashboard → **Logs**
2. Select:
   - **Postgres Logs**: Database queries and errors
   - **Auth Logs**: Sign-ups, logins, password resets
   - **API Logs**: All API requests

### 5.2 Common Issues

#### Issue: "Could not complete authentication"
- **Cause**: Redirect URL not configured in Supabase
- **Fix**: Verify Supabase Auth URL Configuration (Part 1.4)

#### Issue: Email confirmation link doesn't work
- **Cause**: Site URL mismatch
- **Fix**: Ensure Site URL in Supabase matches your production domain exactly (no trailing slash)

#### Issue: "Booking failed" or undefined credits
- **Cause**: RLS policies blocking queries or missing migrations
- **Fix**: Run all migrations, check RLS policies in Supabase

#### Issue: Images not loading
- **Cause**: Storage bucket policies or Next.js image config
- **Fix**: 
  1. Check bucket policies allow public read
  2. Verify `next.config.mjs` includes Supabase storage domain

#### Issue: Build fails on Vercel
- **Cause**: Missing dependencies or TypeScript errors
- **Fix**: 
  1. Check build logs in Vercel
  2. Run `npm run build` locally to reproduce
  3. Fix TypeScript errors or install missing dependencies

---

## Part 6: Security Checklist

Before going fully live:

- [ ] All environment variables set correctly (no hardcoded secrets)
- [ ] Supabase RLS policies reviewed and tested
- [ ] Service role key NEVER exposed to client
- [ ] CORS configured properly (if using external APIs)
- [ ] Rate limiting enabled on critical endpoints
- [ ] Email confirmation enabled (if desired)
- [ ] Strong password requirements enforced
- [ ] SQL injection prevention via parameterized queries (Supabase handles this)
- [ ] File upload size limits configured
- [ ] Audit logs capturing critical actions

---

## Quick Reference

### Production URLs
- **App**: `https://<your-project>.vercel.app`
- **Supabase Dashboard**: https://supabase.com/dashboard

### Key Endpoints
- Homepage: `/`
- Browse Cars: `/cars`
- Login: `/login`
- Signup: `/signup`
- Password Reset: `/forgot-password`
- Auth Callback: `/auth/callback`
- Business Portal: `/biz/fleet`
- Admin Portal: `/admin/users`

### Support Contacts
- Vercel Support: https://vercel.com/support
- Supabase Support: https://supabase.com/dashboard/support/new

---

## Emergency Rollback

If something goes wrong:

1. In Vercel Dashboard → **Deployments**
2. Find the last working deployment
3. Click **⋯** → **Promote to Production**
4. Deployment will be live in ~30 seconds

---

**You're ready to deploy! 🚀**

Follow Parts 1-4 in order, then run all smoke tests before announcing to users.
