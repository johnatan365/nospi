
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

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    console.log('SupabaseProvider: Initializing auth state');

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        console.log('SupabaseProvider: Auth state changed', event, session ? 'session present' : 'no session');

        if (event === 'INITIAL_SESSION') {
          if (session) {
            // Sesión existente (email login o sesión guardada) → resolver inmediatamente
            console.log('SupabaseProvider: INITIAL_SESSION with session — settling immediately');
            setSession(session);
            setUser(session.user);
            setLoading(false);
          } else {
            // Sin sesión todavía — puede ser OAuth en progreso
            // Esperar hasta 800ms por SIGNED_IN antes de resolver como "no logueado"
            console.log('SupabaseProvider: INITIAL_SESSION null — waiting 500ms for SIGNED_IN (OAuth)');
            timeoutRef.current = setTimeout(() => {
              console.log('SupabaseProvider: OAuth wait timeout — user is not logged in');
              setLoading(false);
            }, 500);
          }
        } else if (event === 'SIGNED_IN') {
          // Cancelar el timeout si estaba esperando
          console.log('SupabaseProvider: SIGNED_IN — updating session');
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
        } else if (event === 'SIGNED_OUT') {
          console.log('SupabaseProvider: SIGNED_OUT — clearing session');
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          setSession(null);
          setUser(null);
          setLoading(false);
        } else if (event === 'TOKEN_REFRESHED') {
          console.log('SupabaseProvider: TOKEN_REFRESHED — updating session');
          setSession(session);
          setUser(session?.user ?? null);
          // No cambiar loading
        } else {
          // Any other event (USER_UPDATED, etc.) — update state only.
          setSession(session);
          setUser(session?.user ?? null);
        }
      }
    );

    // Refresh session when app comes back to foreground.
    const handleAppState = AppState.addEventListener('change', async (state) => {
      if (state === 'active') {
        console.log('SupabaseProvider: App became active, refreshing session');
        const { data: { session: refreshedSession } } = await supabase.auth.getSession();
        if (refreshedSession) {
          setSession(refreshedSession);
          setUser(refreshedSession.user);
        }
      }
    });

    return () => {
      console.log('SupabaseProvider: Cleaning up auth listener');
      subscription.unsubscribe();
      handleAppState.remove();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
