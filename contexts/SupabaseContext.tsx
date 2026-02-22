
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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
    console.log('SupabaseProvider: Initializing auth state');
    
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('SupabaseProvider: Initial session loaded', session ? 'User logged in' : 'No session');
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        console.log('SupabaseProvider: Auth state changed', event, session ? 'User logged in' : 'No session');
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => {
      console.log('SupabaseProvider: Cleaning up auth listener');
      subscription.unsubscribe();
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
