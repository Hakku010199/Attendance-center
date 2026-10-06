# Email setup — Supabase Auth + Resend (Center Portal)

Supabase Auth owns ALL tokens, sessions, and confirmation/recovery URLs.
Resend ONLY delivers the messages. No custom tokens, no custom users table,
no secrets in the browser, no database changes.

```
React signUp()/resetPasswordForEmail()
  → Supabase Auth generates token + URL
  → Supabase Auth sends via Resend Custom SMTP
  → Resend → user inbox
```

---

## 1. Create a Resend API key (server-side only)

1. Sign up at https://resend.com → **API Keys** → **Create API Key**.
2. Copy the `re_...` key.
3. Add it as a server env var — NEVER with a `VITE_` prefix:
   - **Vercel:** Project → Settings → Environment Variables → `RESEND_API_KEY=re_...`
   - **Local dev-only test endpoint:** add `RESEND_API_KEY=re_...` to `.env.local`
     (gitignored). The Vite frontend never reads it — only `api/*` routes do.

## 2. Get the Resend SMTP credentials

Resend Dashboard → **SMTP** (resend.com/smtp). You will see:

| Field      | Value                          |
|------------|--------------------------------|
| Host       | `smtp.resend.com`              |
| Port       | `465` (SSL) or `587` (TLS)    |
| Username   | `resend`                       |
| Password   | your `re_...` API key          |

## 3. Enable Custom SMTP in Supabase (this connects Auth emails to Resend)

Supabase Dashboard → your project → **Project Settings → Authentication →
SMTP Settings** → enable **Custom SMTP** and fill in:

- **Sender email:** for now `onboarding@resend.dev`
  (after verifying a domain, change to `noreply@mydomain.com`)
- **Sender name:** `Center Portal`
- **Host:** `smtp.resend.com`, **Port:** `465`
- **Username:** `resend`, **Password:** your `re_...` API key

Click **Save**, then **Send test email** to your own address.

> LIMITATION without a domain: `onboarding@resend.dev` can ONLY deliver to
> the email address you used to sign up for Resend. All other recipients
> are rejected by Resend. After verifying a domain, all users receive mail.

## 4. Set the redirect URLs in Supabase

Authentication → **URL Configuration**:

- **Site URL:** `http://localhost:5175` (dev) / your Vercel URL (prod)
- **Redirect URLs (allowlist):** add BOTH
  - `http://localhost:5175/auth/callback`
  - `http://localhost:5175/reset-password`
  - plus the same two paths on your production domain

## 5. Paste the email templates

Authentication → **Email Templates** → **Confirm signup** — Subject:

```
Confirm your Center Portal account
```

Body (Supabase generates `{{ .ConfirmationURL }}` — never build it yourself):

```html
<h2>Welcome to Center Portal</h2>
<p>Your account has been created successfully.</p>
<p>Please confirm your email address to continue.</p>
<p><a href="{{ .ConfirmationURL }}">Confirm Email</a></p>
<p>If you did not create this account, you can safely ignore this email.</p>
```

**Recovery** template — Subject `Reset your Center Portal password`:

```html
<h2>Reset your password</h2>
<p>We received a request to reset your Center Portal password.</p>
<p><a href="{{ .ConfirmationURL }}">Reset Password</a></p>
<p>If you did not request this, you can safely ignore this email.</p>
```

(Recovery templates use `{{ .ConfirmationURL }}` as the recovery link variable.)

## 6. `RESEND_FROM_EMAIL` — change later without touching code

The app reads the sender ONLY in `api/_lib/emailConfig.js`:

- Unset/empty → `Center Portal <onboarding@resend.dev>` (dev/test mode)
- Later → set server env `RESEND_FROM_EMAIL="Center Portal <noreply@mydomain.com>"`

When you verify a domain: update `RESEND_FROM_EMAIL` + the Supabase SMTP
sender email to match. No application code changes needed.

## 7. Dev-only test endpoint (server-side, does NOT replace Auth emails)

`POST /api/test-email` with JSON `{ "to": "you@example.com" }`:

```bash
curl -X POST http://localhost:5175/api/test-email \
  -H "Content-Type: application/json" \
  -d '{"to":"your-resend-signup-address@example.com"}'
```

- Verifies `RESEND_API_KEY` + sender only. Returns `{ ok, id, from }`.
- Disabled in production unless `ALLOW_TEST_EMAIL=true` is set.
- Requires running under Vercel (`vercel dev`) or a deployed preview —
  plain `vite dev` does not serve `api/*`. See §9.

## 8. Local development

```bash
npm install
# .env — frontend-safe only:
#   VITE_SUPABASE_URL=...
#   VITE_SUPABASE_PUBLISHABLE_KEY=...
npm run dev        # frontend only (api/* NOT served)
# — or —
npx vercel dev     # frontend + api/test-email served together
npm run build
```

## 9. Verify Resend activity

- Resend Dashboard → **Emails** — every sent message, status, recipient.
- Supabase Dashboard → **Auth → Users** — user created / `email_confirmed_at` set.
- Supabase Dashboard → **Auth → Logs** — SMTP delivery errors if any.
