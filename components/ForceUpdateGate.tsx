import React from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Linking,
} from "react-native";
import Constants from "expo-constants";
import { useAppConfig } from "@/contexts/AppConfigContext";

// ---------------------------------------------------------------------------
// ForceUpdateGate — actualización obligatoria.
//
// Lee `min_app_version` de app_config (tabla key/value en Supabase) y la
// compara con la versión instalada (Constants.expoConfig.version, que viene
// de app.json "version"). Si la versión instalada es MENOR a la mínima,
// muestra una pantalla que bloquea el uso de la app y obliga a actualizar
// desde la tienda. Si no, deja pasar a la app normal (children).
//
// Reglas de seguridad (FAIL-OPEN): ante cualquier duda, NO bloquea.
//   - En web (admin app.nospi.co) nunca bloquea: no hay "tienda".
//   - Mientras la config está cargando, no bloquea.
//   - Si min_app_version viene vacía, '0.0.0' o no se puede parsear, no bloquea.
//   - Si la comparación lanza cualquier error, no bloquea.
//
// IMPORTANTE (bootstrap): este bloqueo SOLO empieza a funcionar en los
// usuarios que ya tengan instalada una build que contenga este código. Las
// builds viejas no traen el gate, así que a esas personas no se les puede
// forzar nada por este medio (actualizan de forma natural). Para forzar una
// actualización en el futuro: subir a las tiendas una build nueva y luego
// poner `min_app_version` = esa versión nueva en el admin. Nunca poner una
// versión mínima MAYOR a la que ya está publicada, porque dejaría a todos
// bloqueados sin salida.
// ---------------------------------------------------------------------------

const STORE_URL_IOS = "https://apps.apple.com/co/app/nospi/id6761556688";
const STORE_URL_ANDROID =
  "https://play.google.com/store/apps/details?id=app.nospi.mobile";

const BG = "#1a0010";
const PRIMARY = "#880E4F";

// Devuelve true si `current` es una versión ANTERIOR a `min` (semver simple:
// compara los grupos numéricos separados por puntos). Cualquier parte no
// numérica se trata como 0. Igual o mayor => false (no está desactualizada).
function isOutdated(current: string, min: string): boolean {
  if (!min) return false;
  const c = String(current).split(".").map((n) => parseInt(n, 10));
  const m = String(min).split(".").map((n) => parseInt(n, 10));
  const len = Math.max(c.length, m.length);
  for (let i = 0; i < len; i++) {
    const cv = Number.isFinite(c[i]) ? c[i] : 0;
    const mv = Number.isFinite(m[i]) ? m[i] : 0;
    if (cv < mv) return true;
    if (cv > mv) return false;
  }
  return false;
}

function openStore() {
  const url = Platform.OS === "ios" ? STORE_URL_IOS : STORE_URL_ANDROID;
  Linking.openURL(url).catch(() => {
    // Si por alguna razón no abre la tienda, intentamos el link web genérico.
    Linking.openURL(STORE_URL_ANDROID).catch(() => {});
  });
}

function ForceUpdateScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Image
          source={require("../assets/icon.png")}
          style={styles.logo}
          resizeMode="cover"
        />
        <Text style={styles.title}>Actualiza Nospi</Text>
        <Text style={styles.body}>
          Sacamos una versión nueva con mejoras importantes. Para seguir usando
          la app necesitas actualizarla; solo te toma un momento.
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={openStore}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>Actualizar ahora</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function ForceUpdateGate({ children }: { children: React.ReactNode }) {
  const { appConfig, loading } = useAppConfig();

  let block = false;
  try {
    if (Platform.OS !== "web" && !loading) {
      const currentVersion = Constants.expoConfig?.version || "0.0.0";
      const minVersion = (appConfig?.min_app_version || "0.0.0").trim();
      if (minVersion && minVersion !== "0.0.0") {
        block = isOutdated(currentVersion, minVersion);
      }
    }
  } catch {
    // Fail-open: cualquier error => no bloquear.
    block = false;
  }

  if (block) {
    return <ForceUpdateScreen />;
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
  },
  logo: {
    width: 96,
    height: 96,
    borderRadius: 24,
    marginBottom: 28,
  },
  title: {
    color: "#ffffff",
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 14,
  },
  body: {
    color: "#e6d7de",
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
    marginBottom: 32,
  },
  button: {
    backgroundColor: PRIMARY,
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 30,
    width: "100%",
    alignItems: "center",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
  },
});

export default ForceUpdateGate;
