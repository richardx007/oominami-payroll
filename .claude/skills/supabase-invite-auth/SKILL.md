---
name: supabase-invite-auth
description: Admin-managed user onboarding and password reset for a Next.js App Router app on Supabase Auth (SSR, PKCE), where admins pre-register users and there is NO public sign-up and NO service-role key. Covers (1) invite flow — admin creates an employee row, user receives an email, clicks a link, and sets their own password; and (2) admin-triggered password reset — admin resets a specified user's password and the user sets a new one from an email link. Explains three pitfalls that all present as "the email link is broken / lands on login / expired": the PKCE code_verifier device mismatch, the requirement to fix THREE email templates (not two — Confirm signup is easy to forget and only bites first-time invites), and single-use tokens getting silently consumed by email security scanners/link-prefetchers before the real user clicks. Gives the token_hash + verifyOtp fix, the required Supabase dashboard settings, and a confirm-page pattern that gates token consumption behind a real button click. Use whenever adding/debugging invite-based registration, admin-triggered password reset, "reset/invite link lands on login page or shows expired", magic-link set-password, or exchangeCodeForSession-vs-verifyOtp decisions in a Supabase SSR project.
---

# Supabase invite-based auth + admin password reset (Next.js App Router, SSR/PKCE)

For apps where **admins manage users** — no public sign-up, no service-role key on the
server. Two flows:

1. **Invite / first registration** — admin pre-registers a user row; the user gets a magic
   link and sets their own password.
2. **Admin-triggered password reset** — admin resets a *specified* user's password; the user
   sets a new one from an email link.

## Three pitfalls, one symptom

All three below produce the *same* user-visible symptom — "the email link is broken": it
either lands on the normal login page, or shows an "invalid/expired link" error. **Don't guess
which one it is — check the Supabase auth logs first** (see "Diagnosing" below). Fixing the
wrong one and declaring victory is how this bug keeps coming back across sessions.

1. **PKCE device mismatch** — the classic one, explained in detail below.
2. **Only fixed 2 of the 3 required email templates** — "Confirm signup" is easy to forget and
   only breaks *first-time* invites, so a second re-invite of the same address can look fine.
3. **Single-use token consumed by an email security scanner/link-prefetcher** before the real
   user clicks — happens even after templates are fixed correctly, because verifying on a bare
   GET is inherently vulnerable to automated prefetching.

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

2. **Dashboard — all THREE email templates must use `{{ .TokenHash }}`** (see below), not the
   default `{{ .ConfirmationURL }}`. Otherwise the link routes through `/auth/v1/verify` as a
   `pkce_` token and re-breaks. The callback's `token_hash` + `verifyOtp` branch then handles
   `magiclink`, `signup`, and `recovery` alike. The `code` + `exchangeCodeForSession` branch
   becomes dead/legacy — you can drop it.

## Pitfall 3: single-use tokens consumed by email prefetch/scanners (verify behind a button, not on GET)

`verifyOtp`/`exchangeCodeForSession` **consume** the token — it can only ever succeed once. If
your `/auth/callback` route calls it immediately on `GET`, **anything that fetches the URL before
the human clicks it also consumes it**: corporate mail security gateways ("Safe Links"-style),
antivirus link scanners, and some webmail providers' link-preview features all issue a plain GET
to every link in an email, with no user interaction. The user then taps the link a few seconds
or minutes later, the token is already gone, and they land on the login page or an
"expired"/"invalid" error — **even though your PKCE and template setup is otherwise correct.**

Real-world confirmation from Supabase audit logs (`get_logs`, service=`auth`): the *same*
`token_hash` hit `/verify` twice within ~2 minutes — the first succeeded (200), the second failed
with `403` / `"One-time token not found"`. The first hit wasn't the user; it was a scanner.

**Fix: never verify on a bare `GET`. Make `/auth/callback` a no-op redirect that forwards the
query params to a confirmation page, and only call `verifyOtp` when a real button is pressed**
(`assets/confirm-page.tsx`, a `"use client"` page). Automated prefetchers don't execute JS or
click buttons, so they can no longer burn the token. This is strictly additive on top of the
PKCE/implicit fix above — do both.

```ts
// /auth/callback — no verification here, just forward the params
export async function GET(request: Request) {
  const { search, origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/auth/confirm${search}`);
}
```

```tsx
// /auth/confirm — verifies only when the user clicks "Continue"
async function handleContinue() {
  const supabase = createClient(); // browser client
  const { error } = tokenHash && type
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    : await supabase.auth.exchangeCodeForSession(code!);
  if (!error) {
    await supabase.rpc("link_employee_account");
    router.push(setup === "1" || type === "recovery" ? "/set-password" : "/");
  }
}
```

Because verification now happens **client-side after a click** rather than server-side on GET,
`/set-password` must stay reachable pre-session-refresh the same way; middleware `publicPaths`
must include `/auth` (both `/auth/callback` and `/auth/confirm`).

Don't title the confirm page from the `setup` param alone — `setup=1` is `true` for **both**
registration and password reset, so `setup === "1" ? "Reset password" : ...` mislabels first-time
registration as a password reset. Branch on `type` instead: `type === "recovery"` → reset copy,
anything else (`magiclink`/`signup`) → registration copy.

## Pieces

Copy from `assets/`, adapting import paths (`@/lib/...`) to your project:

| File | Role |
|------|------|
| `assets/callback-route.ts` | `/auth/callback` — **no verification**, just redirects all query params to `/auth/confirm`. Public route. |
| `assets/confirm-page.tsx` | `/auth/confirm` client page — "Continue" button gates `verifyOtp`/`exchangeCodeForSession`. This is what actually consumes the token, only on a real click. Titles by `type`, not by `setup`. |
| `assets/register-page.tsx` | `/register` page — user enters email, submits to a **Server Action** that sends `signInWithOtp` via an **implicit** client (NOT a client-component call), redirect `→ /auth/callback?setup=1`. |
| `assets/set-password-page.tsx` | `/set-password` client page — `getUser()` guard, then `updateUser({ password })`. |
| `assets/employee-actions.ts` | Server actions: `inviteEmployee` (SMTP email → `/register`) and `resetEmployeePassword` (`resetPasswordForEmail` via **implicit** client → `/auth/callback?setup=1`). |
| `assets/middleware.ts` | `updateSession` with `publicPaths` including `/login`, `/register`, `/auth`. |

## Required Supabase dashboard settings (NOT code — do these too)

1. **Authentication → URL Configuration → Site URL** = production origin, e.g.
   `https://your-app.example.com` (no trailing slash). `{{ .SiteURL }}` in templates resolves to
   this.
2. **Authentication → URL Configuration → Redirect URLs** must allow the callback, e.g.
   `https://your-app.example.com/auth/callback` (or a wildcard `https://your-app.example.com/**`).
3. **Authentication → Emails — ALL THREE templates** must use `{{ .TokenHash }}`, **not**
   `{{ .ConfirmationURL }}`. There are three, not two — **"Confirm signup" is the one everyone
   forgets** because it's easy to test password reset and re-invite of an *existing* user, declare
   victory, and never trigger the one code path that uses it.
   - **Magic Link** (used by `signInWithOtp` when the email **already has** an `auth.users` row —
     i.e. re-inviting someone, or any later magic-link sign-in):
     ```html
     <p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=magiclink&setup=1">ログイン / 初回登録を続ける</a></p>
     ```
   - **Confirm signup** (used by `signInWithOtp({ shouldCreateUser: true })` the **very first
     time** a given email is invited — no `auth.users` row exists yet, so Supabase treats it as a
     brand-new signup and sends *this* template instead of Magic Link):
     ```html
     <p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup&setup=1">確認メールのリンクを続ける</a></p>
     ```
   - **Reset password**:
     ```html
     <p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&setup=1">パスワードを再設定する</a></p>
     ```
   Click **Save changes** on each of the three. (A greyed-out Save button means *already saved*,
   not an error.)
   > If left as the default `{{ .ConfirmationURL }}`, the link becomes
   > `.../auth/v1/verify?token=pkce_...&redirect_to=...` (PKCE, fails on other devices) **or**, for
   > "Confirm signup" specifically, a bare `.../auth/v1/verify?...` link that Supabase itself
   > verifies on GET — reintroducing pitfall 3 (prefetch consumption) even if you already deployed
   > the confirm-page fix, because the link never touches your app's `/auth/callback` at all.
   > "Reset template" reverts a template to the default and re-breaks it.
   >
   > **Why this is so easy to miss during testing:** deleting a test user's app-side row does
   > *not* delete their `auth.users` record (this pattern never uses the service-role key, so
   > nothing can). Re-inviting the *same* test email after "deleting" them therefore still finds
   > an existing `auth.users` row and goes through Magic Link, not Confirm signup — so retesting
   > with the same address looks fine and hides the bug. **Always do the final verification pass
   > with a genuinely new email address that has never been invited before.**

Template changes are **instant** (no deploy). App code changes deploy normally. Old emails sent
before a template change keep the old link — always test with a **freshly sent** email.

## Diagnosing a broken auth-email report (do this before touching code)

Supabase Auth logs (`get_logs`, service=`auth`, or Dashboard → Logs → Auth) tell you exactly which
of the three pitfalls you're looking at — read them before guessing:

- `auth_event.action` on the `/otp` or `/recover` call tells you **which template fired**:
  `user_confirmation_requested` = Confirm signup, `user_recovery_requested` = Reset password,
  no `user_*_requested` at all with a plain `login` action later = Magic Link.
- The verifying request's **method and path** tell you **who verified it**: your app's
  `POST /verify` (via `supabase.auth.verifyOtp` from your server or confirm-page) is expected;
  a bare **`GET /verify`** means the link pointed straight at Supabase's own hosted verify
  endpoint (`{{ .ConfirmationURL }}` still in play, or wrong `type`) and bypassed your app/confirm
  page entirely — pitfall 2 or 3, not pitfall 1.
- **The same `token_hash` hit twice** in the logs (one success, one
  `403`/`"One-time token not found"` a short time later) confirms pitfall 3 (prefetch consumption)
  regardless of whether pitfalls 1–2 are already fixed.

## Verification

- **All three** email links start with `https://<your-app>/auth/callback?token_hash=...&setup=1`
  (app domain, `type=magiclink`/`signup`/`recovery` matching the flow), **not**
  `https://<ref>.supabase.co/auth/v1/verify?...`. A `pkce_` prefix on the `token_hash` means a
  sender is still on the PKCE client — fix that before anything else.
- **Test on a different device** than the one that requested the email (open the link on your
  phone). Same-browser testing hides the entire PKCE bug.
- **Test with a brand-new email address that has never been invited**, not a re-invite of a
  previously-deleted test user — otherwise you silently skip the Confirm signup path (see above).
- Clicking the link lands on `/auth/confirm`, shows a "Continue" button (title reflecting `type`,
  not `setup`), and only *after* clicking lands on `/set-password` (not `/login`); user sets
  password; ends up logged in.

## Notes / gotchas

- Guard `resetEmployeePassword`: require admin; reject users with no `auth_user_id`
  (invite them first) and retired/inactive users.
- Show the "reset" button only for **registered + active** users; show "invite" for un-registered.
- Every auth email (registration magic link, admin reset, self-service reset) must be sent from a
  `flowType: 'implicit'` **server-side** client so the `token_hash` is plain and device-independent.
- `signInWithOtp({ shouldCreateUser: true })` picks Confirm-signup vs Magic-Link **based on
  whether an `auth.users` row already exists for that email** — not based on anything your app
  code decides. You cannot force one or the other; you must fix all three templates.
- Deleting a user's app-side row (e.g. an `employees` table row) does **not** delete their
  `auth.users` record when you have no service-role key — the auth account is immortal from your
  app's perspective. This is *why* re-testing an invite with a previously-used test address takes
  the Magic Link path the second time, not Confirm signup — don't let that fool you into thinking
  a fix worked when it only fixed the path you happened to retest.
- Email delivery stops after a few test sends → auth **email rate limit**, not your code. Wait
  ~30–60 min or raise Authentication → Rate Limits. Surface real send errors instead of always
  showing "sent", or you'll chase a delivery ghost.
- No service-role key is used anywhere; everything runs with the anon/publishable key + user session.
