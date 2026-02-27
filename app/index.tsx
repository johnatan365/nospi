
import { Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useSupabase } from '@/contexts/SupabaseContext';
import { nospiColors } from '@/constants/Colors';

export default function Index() {
  const { user, loading } = useSupabase();
  const [initialCheckDone, setInitialCheckDone] = useState(false);

  useEffect(() => {
    console.log('Index: Checking auth state - loading:', loading, 'user:', user?.id);
    
    // Wait for initial auth check to complete
    if (!loading) {
      setInitialCheckDone(true);
    }
  }, [loading, user]);

  // Show loading while checking auth state
  if (!initialCheckDone) {
    console.log('Index: Waiting for auth check to complete...');
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={nospiColors.purpleDark} />
      </View>
    );
  }

  // If user is authenticated, redirect to events
  if (user) {
    console.log('Index: User authenticated, redirecting to events');
    return <Redirect href="/(tabs)/events" />;
  }

  // If not authenticated, redirect to welcome
  console.log('Index: No user, redirecting to welcome');
  return <Redirect href="/welcome" />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
});
