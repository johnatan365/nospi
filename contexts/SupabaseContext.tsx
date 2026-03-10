import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        // Ignorar eventos SIGNED_OUT si vinieron de un refresh fallido
        // para no cerrar sesión al volver de Safari
        if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
        } else if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setLoading(false);
        } else {
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
        }
      }
    );

    // Refrescar sesión cuando la app vuelve al primer plano
    const handleAppState = AppState.addEventListener('change', async (state) => {
      if (state === 'active') {
        try {
          const { data, error } = await supabase.auth.refreshSession();
          if (data?.session) {
            setSession(data.session);
            setUser(data.session.user);
          } else if (!error) {
            // No hay sesión activa — verificar con getSession
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
              setSession(session);
              setUser(session.user);
            }
          }
          // Si hay error de refresh, mantener la sesión actual sin cambios
        } catch (e) {
          // Mantener sesión actual
        }
      }
    });

    return () => {
      subscription.unsubscribe();
      handleAppState.remove();
    };
  }, []);

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error('Sign out failed:', error);
      throw error;
    }
  };

  return (
    <SupabaseContext.Provider value={{ session, user, loading, signOut }}>
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
