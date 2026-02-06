
import { useTheme } from "@react-navigation/native";
import { HeaderRightButton, HeaderLeftButton } from "@/components/HeaderButtons";
import { StyleSheet, View, Text, ActivityIndicator, TouchableOpacity, ScrollView } from "react-native";
import React, { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { useSupabase } from "@/contexts/SupabaseContext";
import { testSupabaseConnection } from "@/lib/supabase";
import { IconSymbol } from "@/components/IconSymbol";

const styles = StyleSheet.create({
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
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.7,
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
    opacity: 0.7,
  },
  infoCard: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 14,
    opacity: 0.7,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "500",
  },
  button: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  instructionsCard: {
    padding: 20,
    borderRadius: 16,
    marginTop: 20,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  instructionStep: {
    fontSize: 14,
    marginBottom: 8,
    opacity: 0.8,
  },
});

export default function HomeScreen() {
  const { colors } = useTheme();
  const { user, loading: authLoading } = useSupabase();
  const [connectionStatus, setConnectionStatus] = useState<{
    connected: boolean;
    error?: string;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    console.log("HomeScreen: Component mounted");
    checkConnection();
  }, []);

  const checkConnection = async () => {
    console.log("HomeScreen: Testing Supabase connection");
    setTesting(true);
    const result = await testSupabaseConnection();
    setConnectionStatus(result);
    setTesting(false);
    console.log("HomeScreen: Connection test result", result);
  };

  const isConnected = connectionStatus?.connected ?? false;
  const statusColor = isConnected ? "#10b981" : "#ef4444";
  const statusBgColor = isConnected ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)";
  const statusText = isConnected ? "Connected" : "Not Connected";
  const statusIcon = isConnected ? "checkmark.circle.fill" : "exclamationmark.circle.fill";

  return (
    <React.Fragment>
      <Stack.Screen
        options={{
          title: "Supabase Connection",
          headerRight: () => <HeaderRightButton />,
          headerLeft: () => <HeaderLeftButton />,
        }}
      />
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>
            Supabase Status
          </Text>
          <Text style={[styles.subtitle, { color: colors.text }]}>
            Connection and configuration
          </Text>
        </View>

        {testing || authLoading ? (
          <View style={[styles.statusCard, { backgroundColor: colors.card }]}>
            <ActivityIndicator size="large" color={colors.primary} style={styles.statusIcon} />
            <View style={styles.statusContent}>
              <Text style={[styles.statusTitle, { color: colors.text }]}>
                Testing Connection...
              </Text>
              <Text style={[styles.statusMessage, { color: colors.text }]}>
                Please wait
              </Text>
            </View>
          </View>
        ) : (
          <View style={[styles.statusCard, { backgroundColor: statusBgColor }]}>
            <IconSymbol
              ios_icon_name={statusIcon}
              android_material_icon_name={isConnected ? "check-circle" : "error"}
              size={40}
              color={statusColor}
              style={styles.statusIcon}
            />
            <View style={styles.statusContent}>
              <Text style={[styles.statusTitle, { color: statusColor }]}>
                {statusText}
              </Text>
              <Text style={[styles.statusMessage, { color: statusColor }]}>
                {isConnected
                  ? "Supabase is ready to use"
                  : connectionStatus?.error || "Unable to connect"}
              </Text>
            </View>
          </View>
        )}

        <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.infoTitle, { color: colors.text }]}>
            Configuration
          </Text>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.text }]}>
              Auth Status
            </Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>
              {user ? "Authenticated" : "Not authenticated"}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.text }]}>
              User ID
            </Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>
              {user?.id ? `${user.id.substring(0, 8)}...` : "None"}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.text }]}>
              Email
            </Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>
              {user?.email || "None"}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={checkConnection}
          disabled={testing}
        >
          <Text style={[styles.buttonText, { color: "#ffffff" }]}>
            Test Connection Again
          </Text>
        </TouchableOpacity>

        <View style={[styles.instructionsCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.infoTitle, { color: colors.text }]}>
            Setup Instructions
          </Text>
          <Text style={[styles.instructionStep, { color: colors.text }]}>
            1. Create a Supabase project at supabase.com
          </Text>
          <Text style={[styles.instructionStep, { color: colors.text }]}>
            2. Get your project URL and anon key from Settings → API
          </Text>
          <Text style={[styles.instructionStep, { color: colors.text }]}>
            3. Add them to app.json under extra:
          </Text>
          <Text style={[styles.instructionStep, { color: colors.text, fontFamily: "monospace" }]}>
            {`"extra": {`}
          </Text>
          <Text style={[styles.instructionStep, { color: colors.text, fontFamily: "monospace", marginLeft: 16 }]}>
            {`"supabaseUrl": "your-url",`}
          </Text>
          <Text style={[styles.instructionStep, { color: colors.text, fontFamily: "monospace", marginLeft: 16 }]}>
            {`"supabaseAnonKey": "your-key"`}
          </Text>
          <Text style={[styles.instructionStep, { color: colors.text, fontFamily: "monospace" }]}>
            {`}`}
          </Text>
          <Text style={[styles.instructionStep, { color: colors.text }]}>
            4. Restart the app to apply changes
          </Text>
        </View>
      </ScrollView>
    </React.Fragment>
  );
}
