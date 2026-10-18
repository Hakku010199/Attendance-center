# Email setup — Supabase Auth + Resend (RollBeeCall)

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
  (after verifying a domain, change to `noreply@rollbeecall.online`)
- **Sender name:** `rollbeecall.online`
- **Host:** `smtp.resend.com`, **Port:** `465`
- **Username:** `resend`, **Password:** your `re_...` API key

Click **Save**, then **Send test email** to your own address.

> LIMITATION without a domain: `onboarding@resend.dev` can ONLY deliver to
> the email address you used to sign up for Resend. All other recipients
> are rejected by Resend. After verifying a domain, all users receive mail.

## 4. Set the redirect URLs in Supabase

Authentication → **URL Configuration**:

- **Site URL:** `https://rollbeecall.online`
- **Redirect URLs (allowlist):**
  - `https://rollbeecall.online/**`
  - `https://rollbeecall.online/auth/callback`
  - `https://rollbeecall.online/reset-password`
  - `http://localhost:5173/**`
  - `http://localhost:5173/auth/callback`
  - `http://localhost:5173/reset-password`
  - `http://localhost:5175/**`

## 5. Disable signup confirmation emails (Registration without email confirmation)

To allow users to register and use RollBeeCall immediately without needing or waiting for a confirmation email:

1. Supabase Dashboard → your project → **Authentication → Providers → Email**.
2. Under **Email Provider Settings**, find **Confirm email** (Enable email confirmations).
3. **Turn OFF** **Confirm email**.
4. Click **Save**.

> **Note**: Disabling "Confirm email" applies ONLY to user sign-ups (`signUp`).
> The **Password Reset** function (`resetPasswordForEmail`) is completely separate and remains 100% active.

## 6. Paste the password reset email template

Since signup confirmation emails are disabled, only the **Recovery** template is needed for password resets:

Supabase Dashboard → Authentication → **Email Templates** → **Reset Password** (or **Recovery**):
- **Subject:** `Reset your rollbeecall.online password`
- **Body:**

```html
<h2>Reset your rollbeecall.online password</h2>
<p>We received a request to reset your rollbeecall.online password.</p>
<p><a href="{{ .ConfirmationURL }}">Reset Password</a></p>
<p>If you did not request this, you can safely ignore this email.</p>
```

(Recovery templates use `{{ .ConfirmationURL }}` as the secure recovery link variable.)

## 7. `RESEND_FROM_EMAIL` — change later without touching code

The app reads the sender ONLY in `api/_lib/emailConfig.js`:

- Unset/empty → `rollbeecall.online <onboarding@resend.dev>` (dev/test mode)
- Later → set server env `RESEND_FROM_EMAIL="rollbeecall.online <noreply@rollbeecall.online>"`

When you verify a domain: update `RESEND_FROM_EMAIL` + the Supabase SMTP
sender email to match. No application code changes needed.

## 8. Dev-only test endpoint (server-side, does NOT replace Auth emails)

`POST /api/test-email` with JSON `{ "to": "you@example.com" }`:

```bash
curl -X POST http://localhost:5175/api/test-email \
  -H "Content-Type: application/json" \
  -d '{"to":"your-resend-signup-address@example.com"}'
```

- Verifies `RESEND_API_KEY` + sender only. Returns `{ ok, id, from }`.
- Disabled in production unless `ALLOW_TEST_EMAIL=true` is set.
- Requires running under Vercel (`vercel dev`) or a deployed preview —
  plain `vite dev` does not serve `api/*`. See §10.

## 9. Local development

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

## 10. Verify Resend activity

- Resend Dashboard → **Emails** — every sent message, status, recipient.
- Supabase Dashboard → **Auth → Users** — user created / `email_confirmed_at` set.
- Supabase Dashboard → **Auth → Logs** — SMTP delivery errors if any.
