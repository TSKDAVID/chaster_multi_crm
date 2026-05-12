import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { useStore } from "ra-core";

import { ThemeProviderContext, type Theme } from "./theme-context";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
};

const STORE_KEY = "theme.accounts";

/** Anonymous / logged-out preference bucket inside the map */
const ANON_KEY = "__anon__";

function isValidTheme(t: unknown): t is Theme {
  return t === "light" || t === "dark" || t === "system";
}

function mergeThemes(
  prev: Record<string, Theme>,
  key: string,
  value: Theme,
): Record<string, Theme> {
  if (prev[key] === value) return prev;
  return { ...prev, [key]: value };
}

/**
 * Theme provider: light / dark / system, persisted per signed-in account in the
 * admin store (`theme.accounts`) and synced to Supabase Auth `user_metadata.ui_theme`
 * so the choice survives new browsers and devices for the same login.
 */
export function ThemeProvider({
  children,
  defaultTheme = "system",
}: ThemeProviderProps) {
  /** Legacy single-key storage from older builds — migrate once into `STORE_KEY`. */
  const [legacyTheme] = useStore<Theme | undefined>("theme", undefined);

  const [accountThemes, setAccountThemes] = useStore<Record<string, Theme>>(
    STORE_KEY,
    {},
  );
  const themesRef = useRef(accountThemes);
  themesRef.current = accountThemes;

  const [session, setSession] = useState<Session | null>(null);
  /** First `getSession` finished — avoids migrating legacy theme into the wrong bucket before session is known. */
  const [authHydrated, setAuthHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const sb = getSupabaseClient();
    void sb.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setSession(data.session ?? null);
        setAuthHydrated(true);
      }
    });
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, nextSession) => {
      if (!cancelled) setSession(nextSession);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const effectiveKey = session?.user?.id ?? ANON_KEY;

  const theme = useMemo(() => {
    const stored = accountThemes[effectiveKey];
    if (stored && isValidTheme(stored)) return stored;
    return defaultTheme;
  }, [accountThemes, defaultTheme, effectiveKey]);

  const persistTimerRef = useRef<ReturnType<typeof setTimeout>>();

  /** Migrate legacy global `theme` key into per-account map once (after auth hydration). */
  useEffect(() => {
    if (!authHydrated) return;
    if (legacyTheme === undefined || !isValidTheme(legacyTheme)) return;
    const uid = session?.user?.id;
    const key = uid ?? ANON_KEY;
    if (themesRef.current[key] !== undefined) return;
    setAccountThemes(mergeThemes(themesRef.current, key, legacyTheme));
  }, [
    authHydrated,
    legacyTheme,
    session?.user?.id,
    setAccountThemes,
  ]);

  const setTheme = useCallback(
    (next: Theme) => {
      setAccountThemes(
        mergeThemes(themesRef.current, effectiveKey, next),
      );

      const user = session?.user;
      if (!user) return;

      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        void getSupabaseClient().auth.updateUser({
          data: { ui_theme: next },
        });
      }, 400);
    },
    [effectiveKey, session?.user, setAccountThemes],
  );

  /** Apply server-stored preference when local entry for this account is unset (e.g. new device). */
  useEffect(() => {
    if (!authHydrated) return;
    const uid = session?.user?.id;
    if (!uid) return;
    const meta = session.user.user_metadata?.ui_theme;
    if (!isValidTheme(meta)) return;
    if (themesRef.current[uid] !== undefined) return;

    setAccountThemes(mergeThemes(themesRef.current, uid, meta));
  }, [
    authHydrated,
    session?.user?.id,
    session?.user?.user_metadata?.ui_theme,
    setAccountThemes,
  ]);

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}
