"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Confirmation page for every Supabase auth email link (Magic Link, Confirm signup,
 * Reset password). /auth/callback forwards here without verifying anything.
 *
 * The token is only consumed when the user presses "Continue" — a deliberate human action
 * that automated email link-scanners/prefetchers cannot perform (no JS execution, no click).
 * This closes the gap where a scanner's GET request would otherwise burn the single-use
 * token before the real user gets to it. See SKILL.md "Pitfall 3" for the full story.
 */
function ConfirmInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");
  const setup = params.get("setup");

  async function handleContinue() {
    setState("loading");
    setError(null);
    const supabase = createClient();

    let ok = false;
    if (tokenHash && type) {
      const { error: err } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });
      ok = !err;
      if (err) setError(err.message);
    } else if (code) {
      const { error: err } = await supabase.auth.exchangeCodeForSession(code);
      ok = !err;
      if (err) setError(err.message);
    } else {
      setError("Missing link parameters. Please open the email link again.");
    }

    if (!ok) {
      setState("error");
      return;
    }

    await supabase.rpc("link_employee_account");

    if (setup === "1" || type === "recovery") {
      router.push("/set-password");
    } else {
      router.push("/");
    }
    router.refresh();
  }

  const hasToken = !!((tokenHash && type) || code);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        {/*
         * ⚠️ Title by `type`, NOT by `setup`. `setup=1` is true for BOTH registration and
         * password reset, so `setup === "1" ? "Reset password" : ...` mislabels first-time
         * registration as a password reset.
         */}
        <h1 className="mb-2 text-2xl font-bold">
          {type === "recovery" ? "Reset your password" : "Confirm registration"}
        </h1>
        <p className="mb-8 text-sm text-gray-500">
          Press the button below to continue.
        </p>

        {state === "error" && (
          <p className="mb-4 text-sm text-red-600">
            This link is invalid or has expired.
            {error ? ` (${error})` : ""} Please request a new one.
          </p>
        )}

        {hasToken ? (
          <button
            onClick={handleContinue}
            disabled={state === "loading"}
            className="w-full rounded-lg bg-blue-600 py-2.5 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {state === "loading" ? "Checking..." : "Continue"}
          </button>
        ) : (
          <p className="text-sm text-red-600">
            Missing link parameters. Please open the email link again.
          </p>
        )}
      </div>
    </main>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmInner />
    </Suspense>
  );
}
