
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

  // Track whether we've received a definitive auth event so we don't clear
  // loading prematurely on INITIAL_SESSION with a null session during OAuth.
  const authSettledRef = useRef(false);

  useEffect(() => {
    console.log('SupabaseProvider: Initializing auth state');

    // Listen for auth changes FIRST so we don't miss the SIGNED_IN event
    // that fires right after the OAuth redirect is processed.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        console.log('SupabaseProvider: Auth state changed', event, session ? 'User logged in' : 'No session');

        // INITIAL_SESSION with a null session during OAuth means the session
        // hasn't been exchanged yet — don't clear loading, wait for SIGNED_IN.
        if (event === 'INITIAL_SESSION' && session === null && !authSettledRef.current) {
          console.log('SupabaseProvider: INITIAL_SESSION with null session — waiting for SIGNED_IN');
          // Still update state but keep loading=true so tabs don't render yet.
          // We'll clear loading after a short safety timeout below.
          setSession(null);
          setUser(null);
          return;
        }

        setSession(session);
        setUser(session?.user ?? null);
        authSettledRef.current = true;
        setLoading(false);
      }
    );

    // Get initial session — this resolves quickly for email/password (session
    // already in AsyncStorage) and also covers the case where onAuthStateChange
    // never fires SIGNED_IN (e.g. no session at all on first launch).
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('SupabaseProvider: getSession resolved', session ? 'User logged in' : 'No session');
      if (!authSettledRef.current) {
        // onAuthStateChange hasn't fired a definitive event yet — use this result.
        setSession(session);
        setUser(session?.user ?? null);
        authSettledRef.current = true;
        setLoading(false);
      }
    });

    // Safety valve: if after 5 s we still haven't settled (e.g. OAuth exchange
    // is taking very long), clear loading so the app doesn't hang forever.
    const safetyTimer = setTimeout(() => {
      if (!authSettledRef.current) {
        console.warn('SupabaseProvider: Safety timeout — clearing loading after 5s');
        authSettledRef.current = true;
        setLoading(false);
      }
    }, 5000);

    // Refrescar sesión cuando la app vuelve al primer plano
    // Esto evita que usuarios de Google pierdan sesión al volver de Safari
    const handleAppState = AppState.addEventListener('change', async (state) => {
      if (state === 'active') {
        await supabase.auth.getSession();
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
