import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, Stack } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { nospiColors } from '@/constants/Colors';
import { useIdioma } from '@/contexts/IdiomaContext';

// Pantalla "Política de asistencia" (visible para el usuario).
// Diseño Opción 2 (semáforo): tema Nospi (vino -> magenta), tarjetas blancas,
// escala de amonestaciones en 3 niveles de color, y una tarjeta de soporte
// para quien tuvo un fallo tecnico. Se abre desde Perfil, desde la pantalla
// post-compra y desde los enlaces de correo/WhatsApp.
export default function PoliticaAsistenciaScreen() {
  const { t } = useIdioma();
  const router = useRouter();

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
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}
              style={styles.backBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="chevron-back" size={26} color={nospiColors.white} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('pol.titulo')}</Text>
            <View style={styles.backBtn} />
          </View>

          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.lead}>
              {t('pol.lead')} <Text style={{ color: '#880E4F' }}>♥</Text>
              {' '}{t('pol.leadB')}
            </Text>

            {/* Cancelación */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('pol.cancelTitulo')}</Text>
              <Text style={styles.cardText}>
                {t('pol.cancel1a')}<Text style={styles.bold}>{t('pol.cancel1b')}</Text>{t('pol.cancel1c')}<Text style={styles.bold}>{t('pol.cancel1d')}</Text>{t('pol.cancel1e')}
              </Text>
              <Text style={[styles.cardText, { marginTop: 10 }]}>
                {t('pol.cancel2a')}<Text style={styles.bold}>{t('pol.cancel2b')}</Text>{t('pol.cancel2c')}<Text style={styles.bold}>{t('pol.cancel2d')}</Text>{t('pol.cancel2e')}<Text style={styles.bold}>{t('pol.cancel2f')}</Text>{t('pol.cancel2g')}
              </Text>
            </View>

            {/* Niveles / suspensiones */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('pol.faltasTitulo')}</Text>

              <View style={[styles.level, styles.level1]}>
                <View style={[styles.levelNum, styles.levelNum1]}>
                  <Text style={styles.levelNumText}>1</Text>
                </View>
                <View style={styles.levelBody}>
                  <Text style={[styles.levelName, styles.levelName1]}>{t('pol.nivel1')}</Text>
                  <Text style={[styles.levelDesc, styles.levelDesc1]}>
                    {t('pol.nivel1Desc')}
                  </Text>
                </View>
              </View>

              <View style={[styles.level, styles.level2]}>
                <View style={[styles.levelNum, styles.levelNum2]}>
                  <Text style={styles.levelNumText}>2</Text>
                </View>
                <View style={styles.levelBody}>
                  <Text style={[styles.levelName, styles.levelName2]}>{t('pol.nivel2')}</Text>
                  <Text style={[styles.levelDesc, styles.levelDesc2]}>
                    {t('pol.nivel2Desc')}
                  </Text>
                </View>
              </View>

              <View style={[styles.level, styles.level3]}>
                <View style={[styles.levelNum, styles.levelNum3]}>
                  <Text style={styles.levelNumText}>3</Text>
                </View>
                <View style={styles.levelBody}>
                  <Text style={[styles.levelName, styles.levelName3]}>{t('pol.nivel3')}</Text>
                  <Text style={[styles.levelDesc, styles.levelDesc3]}>
                    {t('pol.nivel3Desc')}
                  </Text>
                </View>
              </View>

              <Text style={styles.note}>
                {t('pol.nota')}
              </Text>
            </View>

            {/* Qué es la suspensión */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('pol.suspTitulo')}</Text>
              <Text style={styles.cardText}>
                {t('pol.susp1a')}<Text style={styles.bold}>{t('pol.susp1b')}</Text>{t('pol.susp1c')}
              </Text>
            </View>

            {/* Soporte (válvula) */}
            <View style={styles.support}>
              <Text style={styles.supportTitle}>{t('pol.soporteTitulo')}</Text>
              <Text style={styles.supportText}>
                {t('pol.soporte1a')}<Text style={styles.supportBold}>{t('pol.soporte1b')}</Text>{t('pol.soporte1c')}
              </Text>
            </View>

            <View style={{ height: 24 }} />
          </ScrollView>
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
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    color: nospiColors.white,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  lead: {
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 16,
    marginHorizontal: 4,
  },
  card: {
    backgroundColor: nospiColors.white,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: nospiColors.purpleDark,
    marginBottom: 10,
  },
  cardText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#4a3a42',
  },
  bold: {
    fontWeight: '800',
    color: '#241019',
  },
  note: {
    fontSize: 12.5,
    color: '#6b5560',
    marginTop: 10,
  },
  // Niveles
  level: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  levelBody: { flex: 1 },
  levelNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelNumText: {
    color: nospiColors.white,
    fontWeight: '800',
    fontSize: 14,
  },
  levelName: { fontSize: 14, fontWeight: '800' },
  levelDesc: { fontSize: 12.5, marginTop: 1 },
  level1: { backgroundColor: '#FFF7E6' },
  levelNum1: { backgroundColor: '#E9B949' },
  levelName1: { color: '#8a6d00' },
  levelDesc1: { color: '#8a6d00' },
  level2: { backgroundColor: '#FFEDE0' },
  levelNum2: { backgroundColor: '#F4823E' },
  levelName2: { color: '#9a4a10' },
  levelDesc2: { color: '#9a4a10' },
  level3: { backgroundColor: '#FDE7EA' },
  levelNum3: { backgroundColor: '#D7385E' },
  levelName3: { color: '#9a1030' },
  levelDesc3: { color: '#9a1030' },
  // Soporte
  support: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(240,98,146,0.35)',
    borderRadius: 18,
    padding: 16,
  },
  supportTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffd9e6',
    marginBottom: 8,
  },
  supportText: {
    fontSize: 13.5,
    lineHeight: 20,
    color: '#f3e6ec',
  },
  supportBold: {
    fontWeight: '800',
    color: nospiColors.white,
  },
});
