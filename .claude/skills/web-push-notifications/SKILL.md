---
name: web-push-notifications
description: Implement or debug OS-level browser push notifications (Web Push / VAPID) — the kind that arrive via the OS notification center even when the tab/app is closed, as opposed to in-app toasts. Covers the full stack — generating VAPID keys, the RFC 8291 encryption, a Service Worker push handler, client-side subscription UI, and a server-side send endpoint — with a Next.js + Supabase + Cloudflare Workers (@opennextjs/cloudflare) reference architecture that avoids Node-only dependencies. Use this whenever the user wants to "send a push notification", "notify admins/users even when the app is closed", "alert on some backend condition" (a cron-detected condition, a threshold, a missed action), or mentions VAPID, Service Worker `push`/`pushManager`, `PushSubscription`, or `Notification.requestPermission`. Also reach for this whenever debugging a Web Push failure of any kind — "notification never arrives", "subscribe button spins forever", "atob invalid base64", "Invalid EC key in JSON Web Key", "InvalidAccessError" on `pushManager.subscribe`, or a push send endpoint returning 401/403/404/410/500 — even outside this exact stack, since the failure modes and diagnosis method generalize.
---

# Web Push Notifications (VAPID + RFC 8291, Next.js/Supabase/Cloudflare)

Web Push delivers OS notification-center alerts to a specific subscribed device, without a
third-party push provider (Firebase, OneSignal, …) — the browser's own push service (Apple,
Google, Mozilla) relays it. It requires: (1) a VAPID keypair identifying your server, (2) a
per-device "subscription" the browser creates and your server stores, (3) a Service Worker that
turns an incoming push event into a shown notification, and (4) a send step that encrypts a
payload per RFC 8291 and POSTs it to the subscription's endpoint with a VAPID auth header.

Every piece of this looks simple in isolation and fails silently in combination. This skill exists
because a real implementation (detecting missed clock-ins/outs and paging an admin) went through
a full day of debugging across encryption bugs, key mismatches, a platform-runtime gotcha, and a
UI state that lied about what had actually been registered — each with an opaque or misleading
symptom. Read the gotchas section before touching any of this; it will save you the same day.

## When NOT to reach for this

If "notification" means an in-app banner/toast shown while the tab is open, you don't need any of
this — that's just component state. Web Push is specifically for reaching a device when your app
isn't in the foreground (or isn't open at all). It also assumes the browser/OS combination supports
it: **iOS/iPadOS Safari only supports Web Push for a PWA added to the home screen — a plain Safari
tab cannot subscribe, at all, no workaround.** Detect and message this rather than let the user
stare at a silently-failing button.

## Architecture used here (adapt the split, keep the boundary)

```
   detector (cron/DB)                 send endpoint (your app)              browser
   ────────────────────               ────────────────────────              ────────────────
   figure out WHAT to send    ──POST──▶  ONLY: encrypt (RFC 8291) +   ──▶   Service Worker
   + WHO to send it to                    sign (VAPID) + fetch()            `push` event
   (has the business data)                                                  → showNotification
```

The critical design decision: **the send endpoint should do nothing but crypto and `fetch`.** It
should not need to query your database to figure out who to notify. In this reference app that's
not a style preference but a hard requirement — the app has no `service_role` key (RLS-only
architecture), so the Next.js server literally cannot read the subscriptions table on its own. A
Postgres function (`collect_punch_alerts()`, `assets/supabase/20260804060000_push_notifications.sql`)
does the detection AND looks up the subscriber rows, then a tiny wrapper
(`run_punch_alert_job()`, `assets/supabase/20260804070000_punch_alert_cron.sql`) on a `pg_cron`
schedule POSTs the whole bundle (`{alerts, subscriptions}`) to the send endpoint.

Even if your stack *does* have a service-role-equivalent key, keep this separation anyway: it means
your crypto code has zero DB dependency, which makes it independently testable (see below), and it
means "what triggers a notification" stays a business-logic decision, not a networking one. Only
change the transport (a queue, a different scheduler, a webhook) — never let the send endpoint grow
a database query.

Why the detector lives in Postgres specifically in this app, and why the cron job only POSTs when
there's actually something to send: **Cloudflare Workers' free tier caps CPU time at ~10ms**, and a
previous bulk-send feature in this same app blew through that (`Error 1102`) by doing heavy work
per-request on the Worker. Pushing detection into the database and only invoking the Worker when
there's a real payload keeps the Worker's job trivial (encrypt + fetch, no loops over "is there
anything to check").

## Setup (in order)

### 1. Generate a VAPID keypair

```bash
node scripts/generate-vapid-keys.mjs   # assets/generate-vapid-keys.mjs — no deps beyond Node's crypto
```

or with plain `openssl` if Node isn't available where the keys are generated:

```bash
openssl ecparam -name prime256v1 -genkey -noout -out vapid.pem
# public key (87 chars, base64url, feed straight to pbcopy — see gotcha below)
openssl ec -in vapid.pem -pubout -outform DER 2>/dev/null | tail -c 65 | base64 | tr -d '=\n' | tr '/+' '_-' | pbcopy
# private key (43 chars, base64url)
openssl ec -in vapid.pem -outform DER 2>/dev/null | tail -c +8 | head -c 32 | base64 | tr -d '=\n' | tr '/+' '_-' | pbcopy
```

**Public and private key MUST come from the same run.** Re-running the generator for "just the
private key" produces a fresh, unrelated keypair — see Gotcha 6.

### 2. Wire up the pieces

| File | Copy to | Purpose |
|---|---|---|
| `assets/web-push.ts` | `src/lib/web-push.ts` | RFC 8291 encryption + RFC 8292 VAPID JWT, pure Web Crypto |
| `assets/web-push.test.ts` | `src/lib/web-push.test.ts` | RFC 8291 official test vector — run this before trusting anything else |
| `assets/route.ts` | `src/app/api/notify/<name>/route.ts` | Send endpoint — adapt the `Alert`/payload shape, keep the auth+error handling |
| `assets/push.ts` | `src/app/pwa/push.ts` | Client-side subscribe/unsubscribe with timeouts |
| `assets/supabase/*.sql` | `supabase/migrations/` | Detection + cron scheduling pattern — replace the business logic, keep the shape |

Also needed, not bundled here (this project already has one): a Service Worker with a `push` and
`notificationclick` listener — see the `pwa-auto-update` skill's `generate-sw.mjs` and add:

```js
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, tag: data.tag }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url ?? "/"));
});
```

Keep this Service Worker **free of a `fetch` handler** unless you deliberately want offline caching
— see `pwa-auto-update` for why a fetch-intercepting SW is dangerous on Cloudflare/opennext specifically.

### 3. Configure environment variables — mind the split

| Variable | Contains secret? | Where it lives |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | No | `wrangler.jsonc` `vars` (see Gotcha 7) |
| `VAPID_SUBJECT` (a `mailto:` or `https:` contact) | No | `wrangler.jsonc` `vars` |
| `VAPID_PRIVATE_KEY` | **Yes** | Platform secret store (Cloudflare dashboard "Secret", not "Plaintext") |
| A shared secret for the cron→send-endpoint call (e.g. `NOTIFY_SECRET`) | **Yes** | Platform secret store |

### 4. Test end to end before trusting the UI

Don't rely on "the button says registered" — see Gotcha 4. After wiring the pieces, manually
trigger the detector/send path once (e.g. call the SQL function directly, or curl the send endpoint
with a synthetic payload) and check the send endpoint's JSON response for `sent`/`failed`/`failures`
before touching the UI at all. If the crypto and the send path work, the UI is a formality; if you
build the UI first, every crypto/config bug looks like a UI bug.

## Design notes / gotchas (learned the hard way)

1. **Test the crypto against the RFC 8291 official test vector, not against "did a notification
   arrive."** `web-push.test.ts` feeds fixed keys/salt/plaintext through the encryption function and
   asserts the exact expected ciphertext byte-for-byte. Without this, a crypto bug just looks like
   "nothing arrived" — there's no error, no stack trace, nothing to grep for. With it, you find out
   in milliseconds, locally, with zero network involved. Run this test *first* whenever a push isn't
   arriving and you suspect the encryption layer at all.

2. **Don't use the npm `web-push` package if you're deploying to Cloudflare Workers (or any
   non-Node edge runtime).** It shells out to Node's `http`/`https`/`crypto` modules, which aren't
   guaranteed to exist. `web-push.ts` reimplements VAPID (RFC 8292, ES256 JWT) and payload encryption
   (RFC 8291, `aes128gcm`) using only `crypto.subtle` and `fetch`, so it runs identically in the
   browser, Node, or a Worker.

3. **Do not set `export const runtime = "edge"` on the send-endpoint route under
   `@opennextjs/cloudflare`.** This produced a bare `500 Internal Server Error` (no body, no logs) in
   production — the Edge Runtime bundle opennext produces is not what actually executes on the
   Worker in this setup. None of this app's other API routes declare a runtime; don't be the first.
   More generally: **never let a route you don't fully control return a bare 500.** Wrap the body in
   try/catch and return the exception's message as JSON. This endpoint is reachable only via a
   shared-secret header, so leaking exception text back in the response is safe and is exactly what
   let every subsequent bug in this list get diagnosed in one round-trip instead of by guessing.

4. **A subscription can look "registered" in the UI while being absent on the server — reconcile,
   don't trust either side alone.** The sequence "browser subscribe succeeds → save-to-server call
   fails" is not rare (a stale deploy, a network blip), and if your UI's "registered" state comes
   only from `pushManager.getSubscription()` (browser-side truth), it'll happily show "registered"
   forever while the server has zero record and will never send anything. `push.ts`'s pattern: fetch
   the server's subscription list, compare against the browser's actual subscription by `endpoint`,
   and if they disagree, re-POST to the server (self-healing) rather than just displaying whichever
   side answered first.

5. **Every async step of subscribing needs its own timeout with a distinguishable message, because
   several of the underlying Promises can hang forever with no rejection.** `navigator.serviceWorker.
   ready` in particular will simply never resolve if the SW registration is in a bad state — no
   error, no timeout, the calling code just hangs, and the "Subscribe" button spins forever with
   nothing to debug. `push.ts` races every step (registration, activation, `pushManager.subscribe`,
   the server save) against a timeout and labels the failure by step name ("Service Workerの登録",
   "購読の作成", …), so a stuck button tells you *which* step stalled instead of just that something did.

6. **A VAPID keypair must be regenerated as a pair — never rotate just one half.** Running the
   keygen again "to get a fresh private key" (e.g. after suspecting a leak) silently produces an
   unrelated public key too; if you update the private key in your secret store without also
   updating the public key everywhere it's referenced, `crypto.subtle.importKey` on the mismatched
   pair throws **`Invalid EC key in JSON Web Key`** — a real error this project hit. Regenerate both
   halves together, update both together, in the same change.

7. **When copying a generated key from a terminal by hand, don't trust what looks selected.**
   zsh appends a reverse-video `%` to any output that doesn't end in a newline (which `openssl`'s key
   output doesn't) purely to mark "no trailing newline" — it is not part of the value, but it's easy
   to select-and-copy it along with the key. This produced a real
   **`atob() called with invalid base64-encoded data`** failure in production, hours after the key
   had "worked" everywhere except the one push send. Prefer piping straight to `pbcopy` (see the
   openssl commands above) over eyeballing and selecting terminal output for any secret. As
   defense-in-depth, also `.trim()` every secret read from an env var server-side — dashboard paste
   fields are a second, independent source of stray leading/trailing whitespace.

8. **Rotating VAPID keys invalidates every existing subscription, even though the subscriber's own
   encryption keys (`p256dh`/`auth`) still work fine.** A push subscription is bound at creation time
   to the specific VAPID public key (`applicationServerKey`) passed to `pushManager.subscribe()` —
   the push service (Apple/Google/Mozilla) checks that the JWT's signing key matches what the
   subscription was created with, independent of payload encryption. After any key rotation, wipe
   server-side subscription rows and have every device unsubscribe + resubscribe; don't expect old
   subscriptions to "just still work" with a new key.

9. **On Cloudflare Workers specifically: a `vars` block in `wrangler.jsonc` silently overwrites/
   deletes plaintext dashboard environment variables on every deploy, but never touches Secrets.**
   This means the split isn't just "secret vs. not-secret" for storage-location purposes — a
   non-secret value like the VAPID *public* key must still live in `wrangler.jsonc`'s `vars` (not
   set via the dashboard) if you want it to survive a deploy. Only values registered as dashboard
   **Secrets** persist independently of the `vars` block.

10. **`Notification.permission === "denied"` is permanent — the browser will never show the
    permission prompt again for that origin**, no matter how many times you call
    `requestPermission()`. Detect this state explicitly and show OS/browser-specific unblock
    instructions (they differ meaningfully: macOS requires enabling the app/browser in System
    Settings → Notifications *in addition to* the browser's own site permission; Safari and Chrome
    have separate settings surfaces; iOS requires the PWA-not-tab distinction from the top of this
    doc). Without this, a user who denied once has no way forward and no way to know why.

11. **Diagnosis loop that actually works:** have the send endpoint return
    `{ sent, failed, failures: [{ status, endpoint, error }] }` instead of a bare boolean. Then:
    - `status: 0` → an exception was thrown *before* `fetch()` ran (bad/mismatched key material,
      malformed base64 — check the `error` message, which should be the caught exception's `.message`)
    - `status: 401` or `403` → the push service rejected the VAPID JWT (wrong key, expired `exp`, wrong `aud`)
    - `status: 404` or `410` → the subscription is gone (user revoked, browser data cleared) — safe
      to delete server-side, don't retry
    If you're on Supabase with `pg_net` driving the cron call, `net._http_response` (the actual HTTP
    response Cloudflare/your endpoint returned) and `cron.job_run_details` (whether the SQL function
    itself ran and how many rows it found) turn "notification doesn't arrive" from a guessing game
    into a two-query root-cause in under a minute, every time.

## Files in this skill

| File | What it is |
|---|---|
| `assets/web-push.ts` | RFC 8291/8292 encryption, Web Crypto only, no Node/npm-web-push dependency |
| `assets/web-push.test.ts` | Official RFC 8291 test vector — run first when debugging anything crypto-shaped |
| `assets/route.ts` | Send endpoint: shared-secret auth, no `runtime="edge"`, try/catch → diagnosable JSON |
| `assets/push.ts` | Client subscribe/unsubscribe: per-step timeouts, `denied`-permission handling, server reconciliation |
| `assets/generate-vapid-keys.mjs` | VAPID keypair generator (Node, no deps) |
| `assets/supabase/20260804060000_push_notifications.sql` | Subscription table, dedup table, detection function pattern |
| `assets/supabase/20260804070000_punch_alert_cron.sql` | `pg_cron` + `pg_net` wrapper that only POSTs when there's something to send |
