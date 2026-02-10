# Pre-Deployment Checklist

## ✅ Before Starting Deployment

- [ ] All code changes committed and pushed to `main` branch
- [ ] Latest commit includes the pricing fixes and multi-day scheduler
- [ ] `.env.example` is updated (no real secrets)
- [ ] No console.logs or debug code in production

## ✅ Supabase Setup (Part 1)

### Database
- [ ] All migrations applied (use `supabase/all_migrations.sql`)
- [ ] Tables verified in Supabase Dashboard → Database → Tables
- [ ] RLS policies enabled on all tables
- [ ] Storage buckets created: `car-images`

### Authentication
- [ ] Email/Password provider enabled
- [ ] Email confirmation setting decided (ON/OFF)
- [ ] Email templates reviewed
- [ ] ⚠️ **SKIP URL Configuration for now** (come back after Vercel deployment)

## ✅ Vercel Deployment (Part 2)

### Initial Setup
- [ ] GitHub repo connected to Vercel
- [ ] Framework detected as Next.js
- [ ] Root directory set to `./`
- [ ] Node.js version 20.x

### Environment Variables Added
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `TZ=America/Chicago` (optional)

### Deployment
- [ ] Click "Deploy" and wait for build
- [ ] Build successful (green checkmark)
- [ ] **Copy production URL**: `https://_____________.vercel.app`

## ✅ Post-Deployment Configuration (Part 3)

### Supabase Auth URLs (CRITICAL)
Go back to Supabase Dashboard → Authentication → URL Configuration

- [ ] **Site URL** set to: `https://_____________.vercel.app`
- [ ] **Redirect URLs** added:
  - [ ] `http://localhost:3000/**`
  - [ ] `https://_____________.vercel.app/**`
  - [ ] `https://_____________.vercel.app/auth/callback`
- [ ] Changes saved

### Admin & Test Accounts
- [ ] Admin user created: `forzarentalsadmin@proton.me`
- [ ] Admin role assigned via SQL
- [ ] Test business account created
- [ ] Business role assigned and linked to test business

## ✅ Smoke Tests (Part 4)

### Public Access
- [ ] Homepage loads
- [ ] Car listing page works
- [ ] Car detail page shows
- [ ] Booking without login redirects to login

### Authentication
- [ ] Signup works
- [ ] Confirmation email received (if enabled)
- [ ] Email confirmation link works
- [ ] Login works
- [ ] Password reset email received
- [ ] Password reset works
- [ ] Logout works

### Customer Features
- [ ] Browse cars as logged-in customer
- [ ] Select time slot (same-day booking)
- [ ] Select multi-day booking (2+ days)
- [ ] Pricing calculation shows correctly
- [ ] Book car successfully
- [ ] Credits deducted
- [ ] Booking shows in `/bookings` with correct timezone
- [ ] Booking shows correct duration badge

### Business Features
- [ ] Login as business user
- [ ] Access `/biz/fleet`
- [ ] View fleet cars
- [ ] Add car unit works
- [ ] Upload car image works
- [ ] Image displays correctly
- [ ] View bookings at `/biz/bookings`

### Admin Features
- [ ] Login as admin
- [ ] Access `/admin/users`
- [ ] View all users
- [ ] Access `/admin/bookings`
- [ ] Grant credits works

## ✅ Monitoring Setup

- [ ] Health check endpoint works: `/api/health`
- [ ] Vercel logs accessible
- [ ] Supabase logs accessible
- [ ] No critical errors in logs

## ✅ Final Checks

- [ ] All smoke tests passed
- [ ] No hardcoded `localhost` URLs
- [ ] Images loading from Supabase storage
- [ ] All role badges showing correctly
- [ ] Timezone displaying as "Central Time (Chicago)"
- [ ] Multi-day bookings showing duration badges
- [ ] Discount badges showing when applicable
- [ ] Day-rate caps applying correctly

## 🎉 Ready for MVP Launch!

Once all items are checked:
1. Share production URL with initial testers
2. Monitor logs for first 24 hours
3. Collect feedback
4. Iterate!

---

## 🚨 Emergency Contacts

- **Vercel Support**: https://vercel.com/support
- **Supabase Support**: https://supabase.com/dashboard/support/new
- **Rollback**: Vercel Dashboard → Deployments → Promote previous deployment

---

## 📝 Post-Launch TODO

After MVP is stable (1-2 weeks):

- [ ] Set up custom domain
- [ ] Enable Vercel Analytics
- [ ] Configure Sentry for error tracking
- [ ] Implement Resend for branded emails
- [ ] Set up automated database backups
- [ ] Add monitoring alerts
- [ ] Create user documentation
- [ ] Plan v2 features based on feedback
