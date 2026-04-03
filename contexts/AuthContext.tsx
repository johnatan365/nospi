/**
 * AuthContext — thin wrapper over SupabaseContext.
 *
 * Social OAuth (Google / Apple) uses Supabase + expo-web-browser so the
 * native in-app browser (ASWebAuthenticationSession) handles the flow and
 * deep-links back to nospi://auth/callback when done.
 *
 * The Better Auth / Specular backend is NOT used here — that URL is dead.
 */

import React, {
  createContext,
  useContext,
  ReactNode,
} from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";
import { useSupabase } from "@/contexts/SupabaseContext";
import { User } from "@supabase/supabase-js";

// Warm up the browser on Android so the first open is instant.
WebBrowser.maybeCompleteAuthSession();

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthContextType {
  /** Supabase User object (null when signed out) */
  user: User | null;
  /** True while the initial session is being resolved */
  loading: boolean;
  /** Alias for loading — kept for backward compat */
  isLoading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name?: string) => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  /** No-op kept for backward compat — session is managed by SupabaseContext */
  fetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse tokens / code out of a deep-link URL and set the Supabase session.
 * Supabase can return either:
 *   - Fragment tokens:  nospi://auth/callback#access_token=...&refresh_token=...
 *   - Query code:       nospi://auth/callback?code=...
 */
async function handleOAuthCallback(url: string): Promise<void> {
  console.log("[AuthContext] handleOAuthCallback url:", url);

  const params: Record<string, string> = {};

  // Try fragment first (implicit flow), then query string (PKCE flow)
  const fragment = url.includes("#") ? url.split("#")[1] : "";
  const query = url.includes("?") ? url.split("?")[1].split("#")[0] : "";
  const raw = fragment || query;

  raw.split("&").forEach((pair) => {
    const [k, v] = pair.split("=");
    if (k && v) params[decodeURIComponent(k)] = decodeURIComponent(v);
  });

  console.log("[AuthContext] OAuth callback params keys:", Object.keys(params));

  if (params.access_token && params.refresh_token) {
    console.log("[AuthContext] Setting session from access_token + refresh_token");
    const { error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (error) console.error("[AuthContext] setSession error:", error.message);
  } else if (params.code) {
    console.log("[AuthContext] Exchanging code for session");
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) console.error("[AuthContext] exchangeCodeForSession error:", error.message);
  } else {
    console.warn("[AuthContext] OAuth callback: no tokens or code found in URL");
  }
}

/**
 * Poll supabase.auth.getSession() until a session is confirmed or timeout.
 */
async function waitForSession(maxWaitMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      console.log("[AuthContext] waitForSession: session confirmed");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Session did not establish in time");
}

/**
 * Open the Supabase OAuth URL in an in-app browser and wait for the redirect.
 * Resolves only after the session is confirmed in Supabase.
 */
async function openOAuthBrowser(provider: "google" | "apple"): Promise<void> {
  // Hardcoded to match the Android intentFilter (host="auth", path="/callback")
  // and iOS CFBundleURLTypes. Linking.createURL('/auth/callback') would produce
  // nospi:///auth/callback (triple-slash, no host) which does NOT match.
  const redirectUrl = "nospi://auth/callback";
  console.log("[AuthContext] OAuth redirectUrl:", redirectUrl);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectUrl,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    console.error("[AuthContext] signInWithOAuth error:", error?.message);
    throw new Error(error?.message || "Failed to get OAuth URL");
  }

  console.log("[AuthContext] Opening browser for provider:", provider);
  const result = await WebBrowser.openAuthSessionAsync(
    data.url,
    redirectUrl,
    { showInRecents: false }
  );
  console.log("[AuthContext] Browser result type:", result.type);

  if (result.type === "success" && result.url) {
    await handleOAuthCallback(result.url);
    // Wait for Supabase to confirm the session before resolving so callers
    // can navigate immediately without hitting a race condition.
    await waitForSession();
  } else if (result.type === "cancel" || result.type === "dismiss") {
    throw new Error("Authentication cancelled");
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  // Delegate session state entirely to SupabaseContext.
  const { user, loading, signOut: supabaseSignOut } = useSupabase();

  // ── Email auth ──────────────────────────────────────────────────────────────

  const signInWithEmail = async (email: string, password: string) => {
    console.log("[AuthContext] signInWithEmail:", email);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error("[AuthContext] signInWithEmail error:", error.message);
      throw error;
    }
    console.log("[AuthContext] signInWithEmail success");
  };

  const signUpWithEmail = async (email: string, password: string, name?: string) => {
    console.log("[AuthContext] signUpWithEmail:", email);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (error) {
      console.error("[AuthContext] signUpWithEmail error:", error.message);
      throw error;
    }
    console.log("[AuthContext] signUpWithEmail success");
  };

  // ── Social auth ─────────────────────────────────────────────────────────────

  const signInWithGoogle = async () => {
    console.log("[AuthContext] signInWithGoogle pressed");
    if (Platform.OS === "web") {
      console.log("[AuthContext] signInWithGoogle: web — using Supabase OAuth redirect");
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        console.error("[AuthContext] signInWithGoogle web error:", error.message);
        throw error;
      }
      // Supabase redirects the browser — no further action needed
      return;
    }
    await openOAuthBrowser("google");
  };

  const signInWithApple = async () => {
    console.log("[AuthContext] signInWithApple pressed");

    if (Platform.OS === "ios") {
      // Check if running in Expo Go — native Apple Sign In doesn't work there
      // because the id_token audience is host.exp.Exponent, not our bundle ID
      const isExpoGo = Constants.appOwnership === "expo";

      if (!isExpoGo) {
        // Standalone build — use native Apple Sign In modal
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const AppleAuthentication = require("expo-apple-authentication");
          const credential = await AppleAuthentication.signInAsync({
            requestedScopes: [
              AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
              AppleAuthentication.AppleAuthenticationScope.EMAIL,
            ],
          });
          if (!credential.identityToken) {
            throw new Error("No identity token received from Apple");
          }
          console.log("[AuthContext] Apple native credential received, signing in with Supabase");
          const { error } = await supabase.auth.signInWithIdToken({
            provider: "apple",
            token: credential.identityToken,
          });
          if (error) {
            console.error("[AuthContext] Apple signInWithIdToken error:", error.message);
            throw error;
          }
          console.log("[AuthContext] Apple sign-in success");
          return;
        } catch (err: any) {
          // If it's a cancellation, rethrow so the UI can handle it
          if (err?.code === "ERR_REQUEST_CANCELED" || err?.code === "ERR_CANCELED") {
            throw err;
          }
          // For other errors (e.g. audience mismatch), fall through to browser flow
          console.warn("[AuthContext] Native Apple Sign In failed, falling back to browser flow:", err?.message);
        }
      } else {
        console.log("[AuthContext] Running in Expo Go — using browser OAuth flow for Apple");
      }

      // Fallback: browser-based OAuth (works in Expo Go and as backup)
      await openOAuthBrowser("apple");
      return;
    }

    if (Platform.OS === "web") {
      console.log("[AuthContext] signInWithApple: web — using Supabase OAuth redirect");
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "apple",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        console.error("[AuthContext] signInWithApple web error:", error.message);
        throw error;
      }
      return;
    }

    // Android — use browser flow
    await openOAuthBrowser("apple");
  };

  // ── Sign out ────────────────────────────────────────────────────────────────

  const signOut = async () => {
    console.log("[AuthContext] signOut");
    await supabaseSignOut();
  };

  // ── fetchUser — no-op, SupabaseContext manages session reactively ───────────

  const fetchUser = async () => {
    console.log("[AuthContext] fetchUser called (no-op — session managed by SupabaseContext)");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isLoading: loading,
        signInWithEmail,
        signUpWithEmail,
        signInWithApple,
        signInWithGoogle,
        signOut,
        fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
