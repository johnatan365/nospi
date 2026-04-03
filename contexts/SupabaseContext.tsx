
import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Session, User, AuthChangeEvent } from '@supabase/supabase-js';

interface SupabaseContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const SupabaseContext = createContext<SupabaseContextType | undefined>(undefined);

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Track whether we've received a definitive auth event.
  // CRITICAL: getSession() returning null must NOT settle auth during OAuth —
  // the Supabase session is established asynchronously after the OAuth redirect,
  // so a null result from getSession() just means "not yet", not "no session".
  // We only settle on: SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, or a non-null
  // getSession() result. The safety timeout handles the hung case.
  const authSettledRef = useRef(false);

  useEffect(() => {
    console.log('SupabaseProvider: Initializing auth state');

    // Listen for auth changes FIRST so we don't miss the SIGNED_IN event
    // that fires right after the OAuth redirect is processed.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, newSession: Session | null) => {
        console.log('SupabaseProvider: Auth state changed', event, newSession ? 'session present' : 'no session');

        if (event === 'INITIAL_SESSION') {
          if (newSession) {
            // We have a session immediately (email login, returning user) — settle now.
            console.log('SupabaseProvider: INITIAL_SESSION with session — settling');
            setSession(newSession);
            setUser(newSession.user);
            authSettledRef.current = true;
            setLoading(false);
          } else {
            // No session on INITIAL_SESSION — could be first launch OR mid-OAuth.
            // Do NOT settle here. Wait for SIGNED_IN or the safety timeout.
            console.log('SupabaseProvider: INITIAL_SESSION null — waiting for SIGNED_IN or timeout');
            setSession(null);
            setUser(null);
            // Do NOT call setLoading(false) here.
          }
          return;
        }

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          console.log('SupabaseProvider:', event, '— settling with session');
          setSession(newSession);
          setUser(newSession?.user ?? null);
          authSettledRef.current = true;
          setLoading(false);
          return;
        }

        if (event === 'SIGNED_OUT') {
          console.log('SupabaseProvider: SIGNED_OUT — settling with no session');
          setSession(null);
          setUser(null);
          authSettledRef.current = true;
          setLoading(false);
          return;
        }

        // Any other event (USER_UPDATED, etc.) — update state but don't change loading.
        setSession(newSession);
        setUser(newSession?.user ?? null);
      }
    );

    // Safety valve: if after 8 s we still haven't settled (OAuth exchange taking
    // very long, or network issue), clear loading so the app doesn't hang forever.
    const safetyTimer = setTimeout(() => {
      if (!authSettledRef.current) {
        console.warn('SupabaseProvider: Safety timeout — clearing loading after 8s');
        authSettledRef.current = true;
        setLoading(false);
      }
    }, 8000);

    // Refresh session when app comes back to foreground.
    // This prevents Google OAuth users from losing their session after Safari.
    const handleAppState = AppState.addEventListener('change', async (state) => {
      if (state === 'active') {
        console.log('SupabaseProvider: App became active, refreshing session');
        const { data: { session: refreshedSession } } = await supabase.auth.getSession();
        if (refreshedSession) {
          setSession(refreshedSession);
          setUser(refreshedSession.user);
          if (!authSettledRef.current) {
            authSettledRef.current = true;
            setLoading(false);
          }
        }
      }
    });

    return () => {
      console.log('SupabaseProvider: Cleaning up auth listener');
      subscription.unsubscribe();
      handleAppState.remove();
      clearTimeout(safetyTimer);
    };
  }, []);

  const signOut = async () => {
    try {
      console.log('SupabaseProvider: Signing out user');
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Sign out error:', error.message);
        throw error;
      }
      console.log('SupabaseProvider: User signed out successfully');
    } catch (error) {
      console.error('Sign out failed:', error);
      throw error;
    }
  };

  const value = {
    session,
    user,
    loading,
    signOut,
  };

  return (
    <SupabaseContext.Provider value={value}>
      {children}
    </SupabaseContext.Provider>
  );
}

export function useSupabase() {
  const context = useContext(SupabaseContext);
  if (context === undefined) {
    throw new Error('useSupabase must be used within a SupabaseProvider');
  }
  return context;
}
