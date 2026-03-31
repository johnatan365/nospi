import React, { useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { Platform } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { authClient } from "@/lib/auth";

export default function AuthPopupScreen() {
  const { provider } = useLocalSearchParams<{ provider: string }>();

  useEffect(() => {
    if (Platform.OS !== "web") return;

    if (!provider || !"[\"apple\", \"google\"]".includes(provider)) {
      window.opener?.postMessage({ type: "oauth-error", error: "Invalid provider" }, window.location.origin);
      return;
    }

    authClient.signIn.social({
      provider: provider as any,
      callbackURL: `${window.location.origin}/auth-callback`,
    });
  }, [provider]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.text}>Redirecting to sign in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  text: {
    marginTop: 20,
    fontSize: 16,
    color: "#333",
  },
});
