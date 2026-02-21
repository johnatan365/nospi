
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

// Helper function to ensure user profile exists in the users table
async function ensureUserProfile(user: User | null) {
  if (!user) {
    console.log('ensureUserProfile: No user provided, skipping');
    return;
  }

  try {
    console.log('ensureUserProfile: Checking if profile exists for user:', user.id);
    
    // 1. Check if profile already exists in users table
    const { data: existingProfile, error: selectError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (selectError && selectError.code === 'PGRST116') {
      // Profile does not exist (PGRST116 = no rows found), create it
      console.log('ensureUserProfile: Profile not found, creating new profile for user:', user.id);
      
      // Extract data from user metadata (populated by OAuth providers)
      const fullName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Usuario';
      const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || null;
      
      // Calculate age from birthdate if available, otherwise default to 25
      const birthdate = user.user_metadata?.birthdate || null;
      let age = 25; // Default age
      if (birthdate) {
        const today = new Date();
        const birthDate = new Date(birthdate);
        age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
      }

      const { error: insertError } = await supabase.from('users').insert({
        id: user.id,
        email: user.email || '',
        name: fullName,
        birthdate: birthdate || '1999-01-01', // Default birthdate if not provided
        age: age,
        gender: 'no binario', // Default gender
        interested_in: 'ambos', // Default interested in
        age_range_min: 18,
        age_range_max: 60,
        country: 'Colombia', // Default country
        city: 'Medellín', // Default city
        phone: user.phone || '', // Phone from auth if available
        profile_photo_url: avatarUrl,
        interests: [],
        personality_traits: [],
        compatibility_percentage: 0,
        notification_preferences: {
          whatsapp: false,
          email: true,
          sms: false,
          push: true,
        },
        // CRITICAL: Do NOT set onboarding_completed here - let the onboarding flow set it
        onboarding_completed: false,
      });

      if (insertError) {
        console.error('ensureUserProfile: Error creating profile:', insertError);
      } else {
        console.log('✅ ensureUserProfile: Profile created successfully for user:', user.id);
      }
    } else if (selectError) {
      console.error('ensureUserProfile: Error fetching profile:', selectError);
    } else {
      console.log('ensureUserProfile: Profile already exists for user:', user.id);
    }
  } catch (e) {
    console.error('ensureUserProfile: Unexpected error:', e);
  }
}

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('SupabaseProvider: Initializing auth state');
    
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      console.log('SupabaseProvider: Initial session loaded', session ? 'User logged in' : 'No session');
      setSession(session);
      setUser(session?.user ?? null);
      
      // CRITICAL: Ensure profile exists after session is loaded
      if (session?.user) {
        await ensureUserProfile(session.user);
      }
      
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        console.log('SupabaseProvider: Auth state changed', event, session ? 'User logged in' : 'No session');
        setSession(session);
        setUser(session?.user ?? null);
        
        // CRITICAL: Ensure profile exists when user signs in
        if (event === 'SIGNED_IN' && session?.user) {
          console.log('SupabaseProvider: User signed in, ensuring profile exists');
          await ensureUserProfile(session.user);
        }
        
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
