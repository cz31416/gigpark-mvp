"use client";

import { createClient } from "@/lib/supabase/client";
import React, { useEffect, useState } from "react";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    const init = async () => {
        try {
        const url = new URL(window.location.href);

        // 1. Handle PKCE flow (MOST IMPORTANT)
        const code = url.searchParams.get("code");
        if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);

            if (error) {
            console.error("exchange error:", error);
            setMessage("This password reset link is invalid or expired.");
            return;
            }

            setReady(true);
            return;
        }

        // 2. Fallback: hash-based recovery (older flow)
        const hashParams = new URLSearchParams(
            window.location.hash.replace(/^#/, "")
        );
        const type = hashParams.get("type");

        if (type === "recovery") {
            setReady(true);
            return;
        }

        // 3. Fallback: existing session
        const {
            data: { session },
        } = await supabase.auth.getSession();

        if (session) {
            setReady(true);
            return;
        }

        setMessage("This password reset link is invalid or expired.");
        } catch (err) {
        console.error(err);
        setMessage("This password reset link is invalid or expired.");
        }
    };

    init();

    // also listen for recovery event (important)
    const {
        data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
        setMessage("");
        }
    });

    return () => {
        subscription.unsubscribe();
    };
    }, []);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");

    if (!password || password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      setMessage("Password updated successfully. You can now log in.");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      console.error("Password update error:", err);
      setMessage("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="text-2xl font-semibold">Set new password</div>
        <div className="mt-2 text-sm text-zinc-600">
          Enter your new password below.
        </div>

        {!ready ? (
          <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            {message || "Checking reset link..."}
          </div>
        ) : (
          <form onSubmit={handleUpdatePassword} className="mt-6 grid gap-4">
            <label className="grid gap-1">
              <span className="text-xs text-zinc-500">New password</span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs text-zinc-500">Confirm new password</span>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-300"
            >
              {loading ? "Updating..." : "Update password"}
            </button>
          </form>
        )}

        {message && ready && (
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}