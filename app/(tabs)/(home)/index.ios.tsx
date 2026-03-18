
import { HeaderRightButton, HeaderLeftButton } from "@/components/HeaderButtons";
import { StyleSheet, View, Text, ActivityIndicator, TouchableOpacity, ScrollView } from "react-native";
import React, { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { useSupabase } from "@/contexts/SupabaseContext";
import { testSupabaseConnection } from "@/lib/supabase";
import { testDatabaseConnection } from "@/utils/supabaseApi";
import { IconSymbol } from "@/components/IconSymbol";
import { LinearGradient } from "expo-linear-gradient";

const ACCENT = '#880E4F';
const HEADING = '#1a0010';
const BODY = '#333333';
const MUTED = '#555555';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 20,
  },
  header: {
    marginBottom: 30,
    marginTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 8,
    color: HEADING,
  },
  subtitle: {
    fontSize: 16,
    color: MUTED,
  },
  statusCard: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  statusIcon: {
    marginRight: 16,
  },
  statusContent: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  statusMessage: {
    fontSize: 14,
  },
  infoCard: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
    color: HEADING,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: MUTED,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "500",
    color: BODY,
  },
  buttonWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  buttonGradient: {
    borderRadius: 12,
  },
  button: {
    padding: 16,
    alignItems: "center",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    color: '#FFFFFF',
  },
  successCard: {
    padding: 20,
    borderRadius: 16,
    marginTop: 20,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
  },
  successTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
    color: "#10b981",
  },
  successText: {
    fontSize: 14,
    marginBottom: 8,
    color: "#10b981",
  },
});

export default function HomeScreen() {
  const { user, loading: authLoading } = useSupabase();
  const [connectionStatus, setConnectionStatus] = useState<{
    connected: boolean;
    error?: string;
  } | null>(null);
  const [dbStatus, setDbStatus] = useState<{
    connected: boolean;
    error?: string;
    tableExists?: boolean;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    console.log("HomeScreen: Component mounted");
    checkConnection();
  }, []);

  const checkConnection = async () => {
    console.log("HomeScreen: Testing Supabase connection");
    setTesting(true);

    const authResult = await testSupabaseConnection();
    setConnectionStatus(authResult);

    const dbResult = await testDatabaseConnection();
    setDbStatus(dbResult);

    setTesting(false);
    console.log("HomeScreen: Connection test results", { authResult, dbResult });
  };

  const isAuthConnected = connectionStatus?.connected ?? false;
  const isDbConnected = dbStatus?.connected ?? false;
  const isFullyConnected = isAuthConnected && isDbConnected;

  const statusColor = isFullyConnected ? "#10b981" : "#ef4444";
  const statusBgColor = isFullyConnected ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)";
  const statusText = isFullyConnected ? "Connected" : "Not Connected";
  const statusIcon = isFullyConnected ? "checkmark.circle.fill" : "exclamationmark.circle.fill";

  const authConnectedText = isAuthConnected ? "✓ Connected" : "✗ Failed";
  const dbConnectedText = isDbConnected ? "✓ Connected" : "✗ Failed";
  const tableExistsText = dbStatus?.tableExists ? "✓ Created" : "✗ Missing";
  const authStatusText = user ? "Authenticated" : "Not authenticated";
  const userIdText = user?.id ? `${user.id.substring(0, 8)}...` : "None";
  const userEmailText = user?.email || "None";

  return (
    <React.Fragment>
      <Stack.Screen
        options={{
          title: "Supabase Connection",
          headerRight: () => <HeaderRightButton />,
          headerLeft: () => <HeaderLeftButton />,
        }}
      />
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Supabase Status</Text>
          <Text style={styles.subtitle}>Connection and configuration</Text>
        </View>

        {testing || authLoading ? (
          <View style={[styles.statusCard, { backgroundColor: '#F9FAFB' }]}>
            <ActivityIndicator size="large" color={ACCENT} style={styles.statusIcon} />
            <View style={styles.statusContent}>
              <Text style={[styles.statusTitle, { color: HEADING }]}>Testing Connection...</Text>
              <Text style={[styles.statusMessage, { color: MUTED }]}>Please wait</Text>
            </View>
          </View>
        ) : (
          <View style={[styles.statusCard, { backgroundColor: statusBgColor }]}>
            <IconSymbol
              ios_icon_name={statusIcon}
              android_material_icon_name={isFullyConnected ? "check-circle" : "error"}
              size={40}
              color={statusColor}
              style={styles.statusIcon}
            />
            <View style={styles.statusContent}>
              <Text style={[styles.statusTitle, { color: statusColor }]}>{statusText}</Text>
              <Text style={[styles.statusMessage, { color: statusColor }]}>
                {isFullyConnected
                  ? "Supabase is ready to use"
                  : connectionStatus?.error || dbStatus?.error || "Unable to connect"}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Connection Details</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Auth Connection</Text>
            <Text style={[styles.infoValue, { color: isAuthConnected ? "#10b981" : "#ef4444" }]}>
              {authConnectedText}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Database Connection</Text>
            <Text style={[styles.infoValue, { color: isDbConnected ? "#10b981" : "#ef4444" }]}>
              {dbConnectedText}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Notes Table</Text>
            <Text style={[styles.infoValue, { color: dbStatus?.tableExists ? "#10b981" : "#ef4444" }]}>
              {tableExistsText}
            </Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>User Information</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Auth Status</Text>
            <Text style={styles.infoValue}>{authStatusText}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>User ID</Text>
            <Text style={styles.infoValue}>{userIdText}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{userEmailText}</Text>
          </View>
        </View>

        <View style={styles.buttonWrapper}>
          <LinearGradient
            colors={['#1a0010', '#880E4F', '#AD1457']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.buttonGradient}
          >
            <TouchableOpacity
              style={styles.button}
              onPress={() => { console.log('HomeScreen: Test Connection Again pressed'); checkConnection(); }}
              disabled={testing}
            >
              <Text style={styles.buttonText}>Test Connection Again</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>

        {isFullyConnected && (
          <View style={styles.successCard}>
            <Text style={styles.successTitle}>✓ Successfully Connected!</Text>
            <Text style={styles.successText}>• Supabase client initialized</Text>
            <Text style={styles.successText}>• Database connection verified</Text>
            <Text style={styles.successText}>• Notes table created with RLS policies</Text>
            <Text style={styles.successText}>• Ready to build your app!</Text>
          </View>
        )}
      </ScrollView>
    </React.Fragment>
  );
}
