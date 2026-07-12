---
name: supabase-invite-auth
description: Admin-managed user onboarding and password reset for a Next.js App Router app on Supabase Auth (SSR, PKCE), where admins pre-register users and there is NO public sign-up and NO service-role key. Covers (1) invite flow — admin creates an employee row, user receives an email, clicks a magic link, and sets their own password; and (2) admin-triggered password reset — admin resets a specified user's password and the user sets a new one from an email link. Explains the PKCE code_verifier pitfall that breaks admin-server-initiated resets and the token_hash + verifyOtp fix, plus the required Supabase dashboard settings (Redirect URLs, Reset-password email template). Use whenever adding/​debugging invite-based registration, admin-triggered password reset, "reset link lands on login page / password error", magic-link set-password, or exchangeCodeForSession-vs-verifyOtp decisions in a Supabase SSR project.
---

# Supabase invite-based auth + admin password reset (Next.js App Router, SSR/PKCE)

For apps where **admins manage users** — no public sign-up, no service-role key on the
server. Two flows:

1. **Invite / first registration** — admin pre-registers a user row; the user gets a magic
   link and sets their own password.
2. **Admin-triggered password reset** — admin resets a *specified* user's password; the user
   sets a new one from an email link.

## The core pitfall (read this first)

Supabase SSR defaults to **PKCE flow**. `signInWithOtp` (registration magic link) /
`resetPasswordForEmail` (password reset) generate a `code_verifier` stored in a cookie **in the
browser that made the call**. Any email link they produce — whether `?code=` or a `pkce_`-prefixed
`token_hash` — can then only be completed **on that same browser**.

**The killer fact: users open the email on a different device/browser than the one that requested
it.** They fill the form in mobile Safari (or an admin triggers it from a laptop), then tap the
link in the Mail app's in-app browser. That context has no `code_verifier` cookie, so both
`exchangeCodeForSession(code)` and `verifyOtp(pkce_… token_hash)` fail → redirect to `/login`.
This breaks **registration magic links AND password resets** — do not assume "the user requested
it themselves so the verifier is present." It usually isn't.

Symptom: tapping the email link lands on the normal login page. URL looks like
`.../auth/v1/verify?token=pkce_...&type=magiclink&redirect_to=.../auth/callback?setup=1`
(default `{{ .ConfirmationURL }}` template) or `.../auth/callback?token_hash=pkce_...&type=recovery`.

**The fix has two halves — both required, neither alone is enough:**

1. **Code — send every auth email from a `flowType: 'implicit'` server client.** Implicit mints a
   **non-`pkce_`, device-independent `token_hash`** that `verifyOtp` verifies standalone, with no
   verifier cookie anywhere. Add an options arg to your server `createClient({ flowType })` and use
   it for **all three senders**: registration (`signInWithOtp`), admin-triggered reset
   (`resetPasswordForEmail`), and login-page self-service reset. Do the send **server-side** (a
   Server Action), not from a client component. Keep the *default* PKCE client for normal session
   management — only the email *senders* switch to implicit. Implicit's URL-hash-token concern does
   not apply: the email carries `token_hash` as a **query param** and the callback reads it
   server-side; nothing depends on the URL hash.

2. **Dashboard — both email templates must use `{{ .TokenHash }}`** (see below), not the default
   `{{ .ConfirmationURL }}`. Otherwise the link routes through `/auth/v1/verify` as a `pkce_` token
   and re-breaks. The callback's `token_hash` + `verifyOtp` branch then handles both `magiclink`
   (registration) and `recovery` (reset). The `code` + `exchangeCodeForSession` branch becomes
   dead/legacy — you can drop it.

## Pieces

Copy from `assets/`, adapting import paths (`@/lib/...`) to your project:

| File | Role |
|------|------|
| `assets/callback-route.ts` | `/auth/callback` — verifies `token_hash`+`verifyOtp` for **both** `magiclink` (registration) and `recovery` (reset). Public route. (`code`+`exchangeCodeForSession` branch is legacy once templates use TokenHash.) |
| `assets/register-page.tsx` | `/register` page — user enters email, submits to a **Server Action** that sends `signInWithOtp` via an **implicit** client (NOT a client-component call), redirect `→ /auth/callback?setup=1`. |
| `assets/set-password-page.tsx` | `/set-password` client page — `getUser()` guard, then `updateUser({ password })`. |
| `assets/employee-actions.ts` | Server actions: `inviteEmployee` (SMTP email → `/register`) and `resetEmployeePassword` (`resetPasswordForEmail` via **implicit** client → `/auth/callback?setup=1`). |
| `assets/middleware.ts` | `updateSession` with `publicPaths` including `/login`, `/register`, `/auth`. |

### Callback route — the key logic

```ts
const tokenHash = searchParams.get("token_hash");
const type = searchParams.get("type") as EmailOtpType | null;
const code = searchParams.get("code");

if (tokenHash && type) {
  ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error; // reset
} else if (code) {
  ok = !(await supabase.auth.exchangeCodeForSession(code)).error;              // invite
}
if (ok) {
  await supabase.rpc("link_employee_account");            // link auth user ↔ app row
  if (setup === "1" || type === "recovery") return redirect("/set-password");
  return redirect("/");
}
return redirect("/login?error=auth");
```

Because the callback establishes the session **server-side** before redirecting, `/set-password`
can stay a **protected** route (no need to make it public).

## Required Supabase dashboard settings (NOT code — do these too)

1. **Authentication → URL Configuration → Site URL** = production origin, e.g.
   `https://your-app.example.com` (no trailing slash). `{{ .SiteURL }}` in templates resolves to
   this.
2. **Authentication → URL Configuration → Redirect URLs** must allow the callback, e.g.
   `https://your-app.example.com/auth/callback` (or a wildcard `https://your-app.example.com/**`).
3. **Authentication → Emails — BOTH templates** must use `{{ .TokenHash }}`, **not**
   `{{ .ConfirmationURL }}`. It is easy to fix only "Reset password" and forget "Magic Link";
   then password reset works but **first-time registration** still breaks the same way.
   - **Magic Link** (used by `signInWithOtp` / registration):
     ```html
     <p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=magiclink&setup=1">ログイン / 初回登録を続ける</a></p>
     ```
   - **Reset password**:
     ```html
     <p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&setup=1">パスワードを再設定する</a></p>
     ```
   Click **Save changes** on each. (A greyed-out Save button means *already saved*, not an error.)
   > If left as the default `{{ .ConfirmationURL }}`, the link becomes
   > `.../auth/v1/verify?token=pkce_...&redirect_to=...` (PKCE) and that flow fails on other devices.
   > "Reset template" reverts a template to the default and re-breaks it.

Template changes are **instant** (no deploy). App code changes deploy normally. Old emails sent
before a template change keep the old link — always test with a **freshly sent** email.

## Verification

- **Both** email links start with `https://<your-app>/auth/callback?token_hash=...&setup=1`
  (app domain, `type=magiclink` for registration / `type=recovery` for reset), **not**
  `https://<ref>.supabase.co/auth/v1/verify?...`. A `pkce_` prefix on the `token_hash` means a
  sender is still on the PKCE client — fix that before anything else.
- **Test on a different device** than the one that requested the email (open the link on your
  phone). Same-browser testing hides the entire PKCE bug.
- Clicking lands on `/set-password` (not `/login`); user sets password; ends up logged in.

## Notes / gotchas

- Guard `resetEmployeePassword`: require admin; reject users with no `auth_user_id`
  (invite them first) and retired/inactive users.
- Show the "reset" button only for **registered + active** users; show "invite" for un-registered.
- Every auth email (registration magic link, admin reset, self-service reset) must be sent from a
  `flowType: 'implicit'` **server-side** client so the `token_hash` is plain and device-independent.
- Email delivery stops after a few test sends → auth **email rate limit**, not your code. Wait
  ~30–60 min or raise Authentication → Rate Limits. Surface real send errors instead of always
  showing "sent", or you'll chase a delivery ghost.
- No service-role key is used anywhere; everything runs with the anon/publishable key + user session.
