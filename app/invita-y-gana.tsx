import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Share,
  Linking,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, Stack } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';

// Pantalla "Invita y gana".
//
// Cada usuario tiene su propio codigo (users.referral_code, 7 caracteres) y su
// propio link: https://nospi.co/r/<codigo>. Quien entra por ese link se registra
// normal, sin escribir ningun codigo: la landing arrastra el codigo en
// utm_content y el disparador trg_vincular_referido_por_utm arma el referido
// solo. Cuando el amigo paga su primer evento, al que invito le entra el saldo
// automaticamente (trg_acreditar_referido).
//
// Aqui solo mostramos el link y los numeros. Toda la logica vive en la base.

const BASE_LINK = 'https://nospi.co/r/';

interface DatosReferidos {
  codigo: string | null;
  premio_cop: number;
  invitados: number;
  pagaron: number;
  ganado_cop: number;
}

function formatearCop(valor: number): string {
  try {
    return '$' + Math.round(valor || 0).toLocaleString('es-CO');
  } catch {
    return '$' + Math.round(valor || 0);
  }
}

export default function InvitaYGanaScreen() {
  const router = useRouter();
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState<DatosReferidos | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('mis_referidos');
      if (err) throw err;
      const d: any = data || {};
      if (!d.ok) {
        setError('No pudimos cargar tu link. Vuelve a entrar a la app e inténtalo de nuevo.');
        setDatos(null);
        return;
      }
      setDatos({
        codigo: d.codigo || null,
        premio_cop: Number(d.premio_cop) || 15000,
        invitados: Number(d.invitados) || 0,
        pagaron: Number(d.pagaron) || 0,
        ganado_cop: Number(d.ganado_cop) || 0,
      });
    } catch (e: any) {
      console.error('[invita-y-gana] error cargando referidos:', e);
      setError('No pudimos cargar tu link. Revisa tu conexión e inténtalo de nuevo.');
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const link = datos?.codigo ? BASE_LINK + datos.codigo : '';

  const mensaje = link
    ? `Te invito a Nospi: cenas y planes para conocer gente nueva, cara a cara. Entra por mi link 👉 ${link}`
    : '';

  const [copiado, setCopiado] = useState(false);

  const avisarCopiado = useCallback(() => {
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2200);
  }, []);

  const compartir = useCallback(async () => {
    if (!link) return;
    // En web no existe el Share nativo. Usamos el del navegador si esta, y si
    // no, copiamos el link al portapapeles.
    if (Platform.OS === 'web') {
      try {
        const nav: any = typeof navigator !== 'undefined' ? navigator : null;
        if (nav?.share) {
          await nav.share({ title: 'Nospi', text: mensaje, url: link });
          return;
        }
        if (nav?.clipboard?.writeText) {
          await nav.clipboard.writeText(link);
          avisarCopiado();
          return;
        }
      } catch (e) {
        // El usuario cancelo el compartir del navegador, o no dio permiso al
        // portapapeles. No es un error que valga la pena mostrar.
      }
      return;
    }
    try {
      await Share.share(
        Platform.OS === 'ios'
          ? { message: mensaje, url: link }
          : { message: mensaje }
      );
    } catch (e) {
      console.error('[invita-y-gana] error compartiendo:', e);
    }
  }, [link, mensaje, avisarCopiado]);

  const compartirWhatsApp = useCallback(async () => {
    if (!link) return;
    const texto = encodeURIComponent(mensaje);
    if (Platform.OS === 'web') {
      try {
        await Linking.openURL('https://wa.me/?text=' + texto);
      } catch {
        await compartir();
      }
      return;
    }
    const url = 'whatsapp://send?text=' + texto;
    try {
      const puede = await Linking.canOpenURL(url);
      if (puede) {
        await Linking.openURL(url);
      } else {
        await compartir();
      }
    } catch {
      await compartir();
    }
  }, [link, mensaje, compartir]);

  const premio = datos ? formatearCop(datos.premio_cop) : '';

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient
        colors={['#1a0010', '#880E4F', '#AD1457']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <SafeAreaView style={styles.safe}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}
              style={styles.backBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="chevron-back" size={26} color={nospiColors.white} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Invita y gana</Text>
            <View style={styles.backBtn} />
          </View>

          {cargando ? (
            <View style={styles.centro}>
              <ActivityIndicator size="large" color={nospiColors.white} />
            </View>
          ) : error ? (
            <View style={styles.centro}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={cargar} activeOpacity={0.85}>
                <Text style={styles.retryBtnText}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.lead}>
                Pásale tu link a un amigo. Cuando entre por ahí y pague su primer evento,
                te entran <Text style={styles.leadBold}>{premio} de saldo</Text> para el tuyo.
              </Text>

              {/* El link */}
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Tu link</Text>
                <View style={styles.linkBox}>
                  <Text style={styles.linkText} numberOfLines={1} ellipsizeMode="middle">
                    {link || '—'}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.btn, styles.btnWhatsapp]}
                  onPress={compartirWhatsApp}
                  activeOpacity={0.85}
                  disabled={!link}
                >
                  <Ionicons name="logo-whatsapp" size={20} color={nospiColors.white} />
                  <Text style={styles.btnText}>Enviar por WhatsApp</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btn, styles.btnSecundario]}
                  onPress={compartir}
                  activeOpacity={0.85}
                  disabled={!link}
                >
                  <Ionicons name="share-outline" size={20} color="#880E4F" />
                  <Text style={[styles.btnText, styles.btnTextSecundario]}>Compartir o copiar</Text>
                </TouchableOpacity>

                {copiado && (
                  <Text style={styles.copiado}>Link copiado ✓</Text>
                )}

                <Text style={styles.linkNota}>
                  Tu amigo no tiene que escribir ningún código. Con abrir el link basta.
                </Text>
              </View>

              {/* Numeros */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Cómo vas</Text>
                <View style={styles.statsRow}>
                  <View style={styles.stat}>
                    <Text style={styles.statNum}>{datos?.invitados ?? 0}</Text>
                    <Text style={styles.statLabel}>se{'\n'}registraron</Text>
                  </View>
                  <View style={styles.statDiv} />
                  <View style={styles.stat}>
                    <Text style={styles.statNum}>{datos?.pagaron ?? 0}</Text>
                    <Text style={styles.statLabel}>ya{'\n'}fueron</Text>
                  </View>
                  <View style={styles.statDiv} />
                  <View style={styles.stat}>
                    <Text style={[styles.statNum, styles.statNumGanado]}>
                      {formatearCop(datos?.ganado_cop ?? 0)}
                    </Text>
                    <Text style={styles.statLabel}>ganados{'\n'}en saldo</Text>
                  </View>
                </View>
                {(datos?.ganado_cop ?? 0) > 0 && (
                  <Text style={styles.note}>
                    Ese saldo ya está en tu cuenta. Se descuenta solo en tu próxima reserva.
                  </Text>
                )}
              </View>

              {/* Pasos */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Cómo funciona</Text>

                <View style={styles.paso}>
                  <View style={styles.pasoNum}><Text style={styles.pasoNumText}>1</Text></View>
                  <Text style={styles.pasoText}>
                    Le mandas tu link a alguien que creas que la pasaría bien.
                  </Text>
                </View>

                <View style={styles.paso}>
                  <View style={styles.pasoNum}><Text style={styles.pasoNumText}>2</Text></View>
                  <Text style={styles.pasoText}>
                    Entra por ahí y se registra normal. No escribe ningún código.
                  </Text>
                </View>

                <View style={styles.paso}>
                  <View style={styles.pasoNum}><Text style={styles.pasoNumText}>3</Text></View>
                  <Text style={styles.pasoText}>
                    Cuando pague su primer evento, te entran {premio} de saldo. Sin límite de
                    amigos.
                  </Text>
                </View>

                <Text style={styles.note}>
                  Solo cuenta la primera compra de cada amigo, y solo si pagó. El saldo no se
                  retira en efectivo: se usa dentro de Nospi.
                </Text>
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </LinearGradient>
    </>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'android' ? 12 : 4,
    paddingBottom: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: nospiColors.white },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  errorText: { fontSize: 15, color: nospiColors.white, textAlign: 'center', lineHeight: 22 },
  retryBtn: {
    backgroundColor: nospiColors.white,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 24,
  },
  retryBtnText: { color: '#880E4F', fontSize: 15, fontWeight: '800' },
  scroll: { paddingHorizontal: 20, paddingBottom: 48 },
  lead: {
    fontSize: 15,
    lineHeight: 22,
    color: '#f7e8ef',
    marginBottom: 18,
  },
  leadBold: { fontWeight: '800', color: nospiColors.white },
  card: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
  },
  cardLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#8a6b7a',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: nospiColors.purpleDark,
    marginBottom: 14,
  },
  linkBox: {
    backgroundColor: '#FCE4EC',
    borderWidth: 1.5,
    borderColor: 'rgba(136,14,79,0.25)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  linkText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#880E4F',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 26,
    paddingVertical: 14,
    marginBottom: 10,
  },
  btnWhatsapp: { backgroundColor: '#25D366' },
  btnSecundario: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(136,14,79,0.35)',
  },
  btnText: { fontSize: 15.5, fontWeight: '800', color: nospiColors.white },
  btnTextSecundario: { color: '#880E4F' },
  linkNota: { fontSize: 12.5, color: '#6b5560', marginTop: 4, lineHeight: 18 },
  copiado: { fontSize: 13.5, fontWeight: '800', color: '#14632C', textAlign: 'center', marginBottom: 6 },
  statsRow: { flexDirection: 'row', alignItems: 'flex-start' },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statDiv: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(136,14,79,0.12)' },
  statNum: { fontSize: 26, fontWeight: '800', color: '#880E4F' },
  statNumGanado: { fontSize: 20 },
  statLabel: { fontSize: 12, color: '#6b5560', textAlign: 'center', lineHeight: 16 },
  paso: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  pasoNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#880E4F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pasoNumText: { color: nospiColors.white, fontWeight: '800', fontSize: 13 },
  pasoText: { flex: 1, fontSize: 14, lineHeight: 21, color: '#4a3a42' },
  note: { fontSize: 12.5, color: '#6b5560', marginTop: 8, lineHeight: 18 },
});
