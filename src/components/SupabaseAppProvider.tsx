"use client";

import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";

type SupabaseAppContextValue = {
  supabase: SupabaseClient | null;
  session: Session | null;
  authReady: boolean;
};

const SupabaseAppContext = createContext<SupabaseAppContextValue>({
  supabase: null,
  session: null,
  authReady: false,
});

export function useSupabaseApp() {
  return useContext(SupabaseAppContext);
}

export function SupabaseAppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const supabase = useMemo(() => {
    if (!isSupabaseConfigured()) return null;
    return createSupabaseBrowserClient();
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      let nextSession = data.session ?? null;
      if (!nextSession) {
        const { data: anonData, error } = await supabase.auth.signInAnonymously();
        if (error) {
          console.error("Supabase anonymous sign-in failed:", error.message);
        } else {
          nextSession = anonData.session ?? null;
        }
      }
      if (!cancelled) {
        setSession(nextSession);
        setAuthReady(true);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  if (!authReady) {
    return <p className="muted">Loading session…</p>;
  }

  const value: SupabaseAppContextValue = { supabase, session, authReady };

  return <SupabaseAppContext.Provider value={value}>{children}</SupabaseAppContext.Provider>;
}
