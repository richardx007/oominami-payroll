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

Supabase SSR defaults to **PKCE flow**. `signInWithOtp` / `resetPasswordForEmail` generate a
`code_verifier` stored in a cookie **in the browser that made the call**. The email link later
carries a `?code=`, and `exchangeCodeForSession(code)` needs that same verifier.

- **Invite works** with `?code=` + `exchangeCodeForSession` **only because the user calls
  `signInWithOtp` from their own browser** (client component) — the verifier is in *their*
  cookies.
- **Admin-triggered reset breaks** with `?code=`: `resetPasswordForEmail` runs **server-side in
  the admin's request**, so the verifier lands in the *admin's* cookies. When the user clicks
  the link, the exchange has no verifier → fails → redirect to `/login`. Symptom reported as
  *"reset link opens the normal login page and password errors"*, with a URL like
  `/login?code=...`.

**Fix for admin-initiated reset: use `token_hash` + `verifyOtp`, not `code` +
`exchangeCodeForSession`.** `verifyOtp` needs no verifier, so it works from any browser. This
requires editing the **Reset-password email template** (see below) — it is not code-only.

Do **not** try to fix admin reset by setting the server client to `flowType: 'implicit'`: it
does not reliably change the generated link format, and implicit delivers tokens in the URL
**hash**, which server middleware/route handlers never see (they'd bounce a protected
`/set-password` to `/login` before client JS runs).

## Pieces

Copy from `assets/`, adapting import paths (`@/lib/...`) to your project:

| File | Role |
|------|------|
| `assets/callback-route.ts` | `/auth/callback` — handles **both** `token_hash`+`verifyOtp` (reset) **and** `code`+`exchangeCodeForSession` (invite). Public route. |
| `assets/register-page.tsx` | `/register` client page — user enters email, `signInWithOtp` (verifier in *their* browser), redirect `→ /auth/callback?setup=1`. |
| `assets/set-password-page.tsx` | `/set-password` client page — `getUser()` guard, then `updateUser({ password })`. |
| `assets/employee-actions.ts` | Server actions: `inviteEmployee` (SMTP email → `/register`) and `resetEmployeePassword` (`resetPasswordForEmail` → `/auth/callback?setup=1`). |
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
3. **Authentication → Emails → Reset password** template body must use `{{ .TokenHash }}`, **not**
   `{{ .ConfirmationURL }}`:
   ```html
   <p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&setup=1">パスワードを再設定する</a></p>
   ```
   Click **Save changes**. (A greyed-out Save button means *already saved*, not an error.)
   > If left as the default `{{ .ConfirmationURL }}`, the link becomes
   > `.../auth/v1/verify?token=pkce_...&redirect_to=...` (PKCE) and admin reset fails.
   > `Reset template` reverts it to the default and re-breaks reset.

Template changes are **instant** (no deploy). App code changes deploy normally. Old emails sent
before a template change keep the old link — always test with a **freshly sent** email.

## Verification

- Reset email link starts with `https://<your-app>/auth/callback?token_hash=...&type=recovery&setup=1`
  (app domain), **not** `https://<ref>.supabase.co/auth/v1/verify?...`.
- Clicking it lands on `/set-password` (not `/login`); user sets password; redirected in logged-in.
- Invite email → `/register` → magic link → `/set-password` still works via the `code` branch.

## Notes / gotchas

- Guard `resetEmployeePassword`: require admin; reject users with no `auth_user_id`
  (invite them first) and retired/inactive users.
- Show the "reset" button only for **registered + active** users; show "invite" for un-registered.
- The `token_hash` may be `pkce_`-prefixed even here; `verifyOtp` accepts it — that is expected.
- No service-role key is used anywhere; everything runs with the anon/publishable key + user session.
