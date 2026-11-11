# Supabase setup for AgriPlus

This guide configures Supabase Auth, the database/security schema, and the protected admin area. The frontend uses only the Supabase project URL and publishable (or legacy anon) key. **Never add a service-role key to a `VITE_` variable, the browser, or source control.**

## 1. Create a Supabase project

Create a project in the Supabase dashboard and keep its database password private. The free plan is sufficient to start, but usage limits, backups, SMTP, and SMS-provider requirements depend on Supabase's current plan and policies.

## 2. Configure local environment

From the `AgriPlus` project directory, copy `.env.example` to `.env`. Set:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Use the project's publishable key (or legacy anon key). The browser-facing key is not a secret; database access must remain protected by the migration's Row Level Security policies. Keep Gemini credentials server-side as they are today. Restart `npm run dev` after changing environment variables.

For the API server's secure admin operations, also set these **server-only** values in the ignored local `.env` file:

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SECRET_OR_SERVICE_ROLE_KEY
SUPER_ADMIN_EMAIL=the_verified_owner_email
```

Find the service-role/secret key in **Supabase → Project Settings → API Keys**. Do not copy it into chat, frontend code, a `VITE_` variable, or source control. `SUPER_ADMIN_EMAIL` must be the exact email for the single platform owner account, and the owner must verify that email in Supabase Auth. Restart `npm run dev` after changing server environment values.

## 3. Apply database migrations

The first migration, `supabase/migrations/202611080001_initial_platform.sql`, creates the initial profile, farm data, calendar, notifications, community, audit, and storage schema. The follow-up `supabase/migrations/202611080002_admin_dashboard.sql` adds account status, presence heartbeats, login-attempt records, append-only audit logs, and RLS enforcement for suspended accounts.

Preferred workflow with the Supabase CLI:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Alternatively, open the Supabase SQL Editor, paste the complete migration file, and run it once. Do not apply it repeatedly as a manually pasted script; use the CLI for subsequent migrations.

If you already applied the initial migration manually, run **only** `202611080002_admin_dashboard.sql` in the SQL Editor now. If neither migration has been applied, run 001 and then 002 in that order. Do not rerun 001 on a project where it has already been applied.

Admin authorization relies on the trusted `app_metadata.role = "admin"` JWT claim. The first visit to `/admin/login` lets the server assign that role only to the verified email matching `SUPER_ADMIN_EMAIL`; ordinary user metadata cannot grant admin privileges. The API server verifies every admin request with Supabase Auth and the service-role key kept server-side. Admin account status changes require a recent sign-in, and database policies also deny farm-data access to suspended accounts.

### Open the admin dashboard

1. Register the platform owner using the `SUPER_ADMIN_EMAIL` address in the normal AgriPlus app and verify its email. If that account already exists, use it.
2. Set `SUPABASE_SERVICE_ROLE_KEY` and `SUPER_ADMIN_EMAIL` in the server's environment and restart the API server.
3. Open `http://localhost:5173/admin/login` and sign in with the owner's verified email/password. The server verifies the owner email and initializes its trusted admin role.
4. The farmer dashboard remains at `/dashboard`; the admin dashboard is separate at `/admin`.

After a rejected login, the form reports whether the entered email matches `SUPER_ADMIN_EMAIL`. If it matches, Supabase cannot distinguish an incorrect password from an account that is missing or not email-verified; confirm the user in the same project's Auth → Users, then use **Forgot password?** if needed.

To reset the owner's password, choose **Forgot password?** on `/admin/login` and enter the verified owner email. Supabase accepts reset requests without confirming whether the address belongs to an account or whether an email was delivered; this prevents account enumeration. If no email arrives, check spam, confirm the exact address exists and is verified in Supabase Auth and matches `SUPER_ADMIN_EMAIL`, allow the exact `/reset-password` URL in **Authentication → URL Configuration**, then inspect the Supabase Auth logs and email/SMTP settings. Supabase's default email service is intended for testing and may restrict delivery; configure a custom SMTP provider for reliable delivery to owner accounts. After setting a password, return to `/admin/login`.

The initial admin area includes database-backed overview counts, heartbeat-based online counts, paginated/searchable user directory with suspension/reactivation, community post moderation, report review, immediate in-app announcements, CSV export of the visible user page, and protected audit/login history. The farmer app and routes are preserved.

The service-role key is powerful: do not run the Node API on an untrusted machine or expose it in browser-delivered configuration. Production deployment must host the Express API securely and supply these values as server secrets. A static Vite deployment alone does not provide the admin API.

## 4. Authentication providers

### Email/password

In **Authentication → Providers**, enable Email and require email confirmation. Configure the confirmation and recovery redirect URLs:

- Local: `http://localhost:5173/dashboard`
- Production: `https://YOUR_DOMAIN/dashboard`
- Local recovery: `http://localhost:5173/reset-password`
- Production recovery: `https://YOUR_DOMAIN/reset-password`

Set the production site URL and redirect allowlist in **Authentication → URL Configuration**. For production, configure an SMTP provider; Supabase's built-in email service has delivery and rate limits and is for testing.

### Google OAuth

Enable Google in **Authentication → Providers → Google**. Create OAuth credentials in Google Cloud Console and add Supabase's callback URL shown on that settings page as an authorized redirect URI. Add the Google client ID/secret to the Supabase provider form, then allow both local and production app callback URLs in Supabase URL Configuration. OAuth secrets stay in Supabase, not in this app's `.env`.

### Phone/SMS

Enable Phone auth and configure a supported SMS provider and sender/template in Supabase. Without an SMS provider and its credentials, phone OTP/password authentication cannot work. The app supports phone + password sign-in, SMS OTP sign-in/recovery, and phone verification from **Profile**. Registration verifies email first and stores the submitted phone as unverified until the farmer completes the SMS verification step in their profile.

## 5. Storage

The migration creates the private `community-images` bucket with a 5 MB limit and JPEG/PNG/WebP content-type restrictions. Object access is restricted to authenticated users; uploads must use a user-ID folder. The community feed uploads up to four images per post and renders expiring signed URLs.

## 6. Vercel deployment

In **Vercel → Project → Settings → Environment Variables**, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for Preview and Production. Add only server-side secrets such as `GEMINI_API_KEY` as non-`VITE_` variables in the server deployment. Redeploy after setting or changing environment variables.

Configure Supabase's production Site URL and redirect allowlist with the exact deployed domain. Apply every migration before deploying code that uses it.

## Implemented platform features

- Central Supabase browser client and persisted Auth session.
- Email/password registration and login, Google OAuth initiation, SMS OTP sign-in, email recovery, password reset, and account sign-out.
- Auth gate when Supabase environment variables are present; without them the existing app remains available in browser-local mode with a notice.
- Initial PostgreSQL schema and RLS policies for profiles, AI history, crop/livestock records, diagnoses, calendar events, notifications, community posts/comments/reactions/reports, activity, and admin audit data.
- Private community image bucket policies and a restricted public community profile view.
- Supabase-backed crop and livestock creation/listing/health updates, calendar event CRUD/status/recurrence, notification history/read/delete/preferences, and community feed/posts/comments/reactions/reports.
- Post/reply editing and deletion, deduplicated helpful reactions, private image uploads, community notification triggers, and realtime refresh for calendar, community and notifications when Realtime is enabled.
- Profile editing, timezone/language/AI-language/notification preferences, password change, phone verification, email recovery, and SMS-based recovery.
- Separate protected admin sign-in and dashboard backed by server-only Supabase service-role operations.
- Admin metrics, real user presence heartbeats, user search/status management, community report review and post moderation, in-app announcement delivery, CSV export, and append-only admin audit/login history.

## Remaining limitations and verification

The new admin migration must be applied and the API's server-only environment configured before admin sign-in works. End-to-end admin behavior has not been tested against the live project. AI conversation and diagnosis history are not cloud-backed, so AI request statistics only include saved user messages and may be zero. Admin analytics currently show operational counts/recent activity rather than full trend charts. Account deletion, editing farmer/farm records, comment moderation, pinning, warnings, scheduled announcements, selected-user targeting, delivery/open tracking, Excel/PDF export, and platform-settings controls are not implemented. Announcements currently go to all accounts or a matching profile region and are delivered immediately in-app. Calendar reminders still run on the client; push, email, and SMS delivery are not configured. Realtime admin updates are not implemented; use Refresh. Validate migrations, RLS, auth-provider setup, and role assignment with a test project/account before production.

Never expose personal farm data or authorize privileged actions solely in frontend code. Test ownership and admin policies against at least two users before production use.
