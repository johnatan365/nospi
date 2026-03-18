
import { HeaderRightButton, HeaderLeftButton } from "@/components/HeaderButtons";
import { StyleSheet, View, Text, ActivityIndicator, TouchableOpacity, ScrollView } from "react-native";
import React, { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSupabase } from "@/contexts/SupabaseContext";
import { testSupabaseConnection } from "@/lib/supabase";
import { testDatabaseConnection } from "@/utils/supabaseApi";
import { IconSymbol } from "@/components/IconSymbol";
import { nospiColors } from "@/constants/Colors";

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
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
    color: nospiColors.white,
  },
  subtitle: {
    fontSize: 16,
    color: nospiColors.white,
    opacity: 0.7,
  },
  statusCard: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
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
    color: nospiColors.white,
  },
  statusMessage: {
    fontSize: 14,
    color: nospiColors.white,
    opacity: 0.7,
  },
  infoCard: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
    color: nospiColors.purpleDark,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: nospiColors.gray500,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "500",
    color: nospiColors.gray800,
  },
  button: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
    backgroundColor: nospiColors.purpleDark,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    color: nospiColors.white,
  },
  successCard: {
    padding: 20,
    borderRadius: 16,
    marginTop: 20,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
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
  const { colors } = useTheme();
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
  const statusIcon = isFullyConnected ? "check-circle" : "error";

  return (
    <React.Fragment>
      <Stack.Screen
        options={{
          title: "Supabase Connection",
          headerRight: () => <HeaderRightButton />,
          headerLeft: () => <HeaderLeftButton />,
        }}
      />
      <LinearGradient
        colors={['#1a0010', '#880E4F', '#AD1457']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>
              Supabase Status
            </Text>
            <Text style={styles.subtitle}>
              Connection and configuration
            </Text>
          </View>

          {testing || authLoading ? (
            <View style={styles.statusCard}>
              <ActivityIndicator size="large" color={nospiColors.purpleLight} style={styles.statusIcon} />
              <View style={styles.statusContent}>
                <Text style={styles.statusTitle}>
                  Testing Connection...
                </Text>
                <Text style={styles.statusMessage}>
                  Please wait
                </Text>
              </View>
            </View>
          ) : (
            <View style={[styles.statusCard, { backgroundColor: isFullyConnected ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)" }]}>
              <IconSymbol
                android_material_icon_name={statusIcon}
                size={40}
                color={statusColor}
                style={styles.statusIcon}
              />
              <View style={styles.statusContent}>
                <Text style={[styles.statusTitle, { color: statusColor }]}>
                  {statusText}
                </Text>
                <Text style={[styles.statusMessage, { color: statusColor, opacity: 1 }]}>
                  {isFullyConnected
                    ? "Supabase is ready to use"
                    : connectionStatus?.error || dbStatus?.error || "Unable to connect"}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>
              Connection Details
            </Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>
                Auth Connection
              </Text>
              <Text style={[styles.infoValue, { color: isAuthConnected ? "#10b981" : "#ef4444" }]}>
                {isAuthConnected ? "✓ Connected" : "✗ Failed"}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>
                Database Connection
              </Text>
              <Text style={[styles.infoValue, { color: isDbConnected ? "#10b981" : "#ef4444" }]}>
                {isDbConnected ? "✓ Connected" : "✗ Failed"}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>
                Notes Table
              </Text>
              <Text style={[styles.infoValue, { color: dbStatus?.tableExists ? "#10b981" : "#ef4444" }]}>
                {dbStatus?.tableExists ? "✓ Created" : "✗ Missing"}
              </Text>
            </View>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>
              User Information
            </Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>
                Auth Status
              </Text>
              <Text style={styles.infoValue}>
                {user ? "Authenticated" : "Not authenticated"}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>
                User ID
              </Text>
              <Text style={styles.infoValue}>
                {user?.id ? `${user.id.substring(0, 8)}...` : "None"}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>
                Email
              </Text>
              <Text style={styles.infoValue}>
                {user?.email || "None"}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.button}
            onPress={checkConnection}
            disabled={testing}
          >
            <Text style={styles.buttonText}>
              Test Connection Again
            </Text>
          </TouchableOpacity>

          {isFullyConnected && (
            <View style={styles.successCard}>
              <Text style={styles.successTitle}>
                ✓ Successfully Connected!
              </Text>
              <Text style={styles.successText}>
                • Supabase client initialized
              </Text>
              <Text style={styles.successText}>
                • Database connection verified
              </Text>
              <Text style={styles.successText}>
                • Notes table created with RLS policies
              </Text>
              <Text style={styles.successText}>
                • Ready to build your app!
              </Text>
            </View>
          )}
        </ScrollView>
      </LinearGradient>
    </React.Fragment>
  );
}
