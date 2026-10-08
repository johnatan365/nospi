// Paso de preferencias: va ENTRE el detalle del evento y la pantalla de pago.
//
// Pregunta dos cosas:
//   1. En que idiomas acepta hablar en la mesa (siempre).
//   2. En que zona le gustaria que fuera (SOLO presenciales; en una
//      videollamada no tiene sentido).
//
// Por que el idioma es seleccion MULTIPLE y no un si/no: el bilingue marca los
// dos y queda disponible para cualquiera de las dos mesas. Esa gente es la que
// sostiene la mesa mixta; con un si/no se perderia.
//
// Por que la zona lleva un campo libre "Otra": en vez de adivinar una lista de
// barrios, la gente escribe el suyo. Es el mismo mecanismo de
// city_search_misses — dato de demanda para decidir donde abrir.
//
// Por que el aviso de "esto no define donde sera el evento": si alguien marca
// una zona donde Nospi no hace nada y despues le toca al otro lado de la
// ciudad, se siente enganado. Decirlo de frente cuesta una linea.
//
// Por que por evento y no una vez en el perfil: alguien puede querer practicar
// ingles un jueves y no el siguiente, o tener el carro una semana y la otra no.
//
// Como viaja el dato: igual que la casilla de los bolos — se guarda en
// AsyncStorage al continuar y payment-callback lo escribe en la cita cuando el
// pago vuelve. No se inventa un camino nuevo.

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Platform, KeyboardAvoidingView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/IconSymbol';
import { nospiColors } from '@/constants/Colors';
import { useIdioma } from '@/contexts/IdiomaContext';
import { toqueFuerte, aviso } from '@/lib/haptics';

export const CLAVE_IDIOMAS_PENDIENTES = 'pending_idiomas_mesa';
export const CLAVE_ZONAS_PENDIENTES = 'pending_zonas_preferidas';
export const CLAVE_ZONA_OTRA_PENDIENTE = 'pending_zona_otra';

const LARGO_MAX_ZONA_OTRA = 40;

export default function IdiomaMesaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, idioma } = useIdioma();
  const { tipo } = useLocalSearchParams<{ tipo?: string }>();

  // En una videollamada la zona no aplica: la persona se conecta desde su casa.
  const esPresencial = tipo !== 'virtual';

  // Arranca premarcado el idioma en el que esta viendo la app: el que no quiere
  // pensarlo toca Continuar y sigue.
  const [idiomas, setIdiomas] = useState<string[]>([idioma]);
  const [zonas, setZonas] = useState<string[]>([]);
  const [zonaOtra, setZonaOtra] = useState('');

  const alternarIdioma = (cual: 'es' | 'en') => {
    toqueFuerte();
    setIdiomas((p) => (p.includes(cual) ? p.filter((x) => x !== cual) : [...p, cual]));
  };

  const alternarZona = (cual: string) => {
    toqueFuerte();
    setZonas((p) => {
      if (p.includes(cual)) {
        if (cual === 'otra') setZonaOtra('');
        return p.filter((x) => x !== cual);
      }
      return [...p, cual];
    });
  };

  // Si marco "Otra" y no escribio nada, el dato no sirve: esa opcion existe
  // precisamente para saber CUAL zona. Se bloquea el Continuar.
  const faltaZonaOtra = esPresencial && zonas.includes('otra') && zonaOtra.trim().length === 0;
  const puedeContinuar = idiomas.length > 0 && !faltaZonaOtra;

  const continuar = async () => {
    if (!puedeContinuar) {
      aviso();
      return;
    }
    toqueFuerte();
    try {
      await AsyncStorage.setItem(CLAVE_IDIOMAS_PENDIENTES, JSON.stringify(idiomas));
      if (esPresencial && zonas.length > 0) {
        await AsyncStorage.setItem(CLAVE_ZONAS_PENDIENTES, JSON.stringify(zonas));
        const otra = zonas.includes('otra') ? zonaOtra.trim().slice(0, LARGO_MAX_ZONA_OTRA) : '';
        if (otra) {
          await AsyncStorage.setItem(CLAVE_ZONA_OTRA_PENDIENTE, otra);
        } else {
          await AsyncStorage.removeItem(CLAVE_ZONA_OTRA_PENDIENTE);
        }
      } else {
        await AsyncStorage.removeItem(CLAVE_ZONAS_PENDIENTES);
        await AsyncStorage.removeItem(CLAVE_ZONA_OTRA_PENDIENTE);
      }
    } catch {
      // Quedarse sin pagar por no poder guardar una preferencia seria peor que
      // perder la preferencia.
    }
    if (Platform.OS === 'web') {
      router.replace('/subscription-plans');
    } else {
      router.push('/subscription-plans');
    }
  };

  // Aqui NO va el precio. Esta pantalla solo recoge preferencias; todavia no se
  // esta pagando nada. El precio aparece en la pantalla siguiente, que es donde
  // la persona escoge como paga.

  const opcionesIdioma = [
    { valor: 'es' as const, etiqueta: t('mesaIdioma.espanol') },
    { valor: 'en' as const, etiqueta: t('mesaIdioma.ingles'), sub: t('mesaIdioma.inglesSub') },
  ];

  const opcionesZona = [
    { valor: 'poblado', etiqueta: t('zona.poblado'), sub: t('zona.pobladoSub') },
    { valor: 'laureles', etiqueta: t('zona.laureles'), sub: t('zona.laurelesSub') },
    // Envigado salio de la lista: quedan solo las dos zonas donde de verdad hay
    // eventos. Quien quiera otra la escribe en "Otra", que es el dato que sirve
    // para decidir donde abrir. El texto 'zona.envigado' se deja en Textos.ts a
    // proposito: hay gente que ya la tenia guardada y el panel la sigue
    // mostrando al leer esos registros.
    { valor: 'otra', etiqueta: t('zona.otra'), sub: t('zona.otraSub') },
  ];

  const Opcion = ({
    activa, etiqueta, sub, onPress,
  }: { activa: boolean; etiqueta: string; sub?: string; onPress: () => void }) => (
    <TouchableOpacity
      style={[estilos.opcion, activa && estilos.opcionActiva]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: activa }}
      accessibilityLabel={etiqueta}
    >
      <View style={estilos.opcionTexto}>
        <Text style={estilos.opcionEtiqueta}>{etiqueta}</Text>
        {!!sub && <Text style={estilos.opcionSub}>{sub}</Text>}
      </View>
      <View style={[estilos.casilla, activa && estilos.casillaActiva]}>
        {activa && <Text style={estilos.chulo}>✓</Text>}
      </View>
    </TouchableOpacity>
  );

  return (
    <LinearGradient
      colors={['#1a0010', '#880E4F', '#AD1457']}
      style={estilos.degradado}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      {/* Flecha para volver.
          El gesto de deslizar desde el borde ya cerraba la pantalla, pero no
          todo el mundo lo conoce ni funciona igual en Android; sin algo visible
          la gente se siente atrapada. Mismo icono y mismo gesto que el resto de
          la app (router.back). */}
      <TouchableOpacity
        onPress={() => router.back()}
        style={[estilos.botonAtras, { top: insets.top + 8 }]}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel={t('comun.atras')}
      >
        <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={26} color="#FFFFFF" />
      </TouchableOpacity>

      {/* El campo de "Otra" quedaba debajo del teclado: se escribia a ciegas.
          behavior="padding" en LAS DOS plataformas, igual que en el chat y en
          la hoja de asistentes del admin. Dejarlo en undefined para Android es
          el error que ya se corrigio alla: con edge-to-edge la ventana no se
          encoge sola y el teclado sigue tapando. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView contentContainerStyle={estilos.scroll} keyboardShouldPersistTaps="handled">
        <View style={estilos.contenido}>
          <Text style={estilos.titulo}>{t(esPresencial ? 'mesaIdioma.pregunta' : 'mesaIdioma.preguntaSala')}</Text>
          <Text style={estilos.pista}>{t(esPresencial ? 'mesaIdioma.explicacion' : 'mesaIdioma.explicacionSala')}</Text>

          {opcionesIdioma.map((op) => (
            <Opcion
              key={op.valor}
              activa={idiomas.includes(op.valor)}
              etiqueta={op.etiqueta}
              sub={op.sub}
              onPress={() => alternarIdioma(op.valor)}
            />
          ))}

          {esPresencial && (
            <>
              <Text style={[estilos.titulo, estilos.tituloZona]}>{t('zona.pregunta')}</Text>
              <Text style={estilos.pista}>{t('zona.explicacion')}</Text>

              {opcionesZona.map((op) => (
                <React.Fragment key={op.valor}>
                  <Opcion
                    activa={zonas.includes(op.valor)}
                    etiqueta={op.etiqueta}
                    sub={op.sub}
                    onPress={() => alternarZona(op.valor)}
                  />
                  {op.valor === 'otra' && zonas.includes('otra') && (
                    <TextInput
                      style={estilos.campoOtra}
                      value={zonaOtra}
                      onChangeText={setZonaOtra}
                      placeholder={t('zona.otraPlaceholder')}
                      placeholderTextColor={nospiColors.gray400}
                      maxLength={LARGO_MAX_ZONA_OTRA}
                      autoFocus
                      returnKeyType="done"
                    />
                  )}
                </React.Fragment>
              ))}

              <Text style={estilos.avisoZona}>{t('zona.aviso')}</Text>
            </>
          )}

          <TouchableOpacity
            style={[estilos.boton, !puedeContinuar && estilos.botonApagado]}
            onPress={continuar}
            activeOpacity={0.85}
            disabled={!puedeContinuar}
          >
            <Text style={estilos.botonTexto}>{t('comun.continuar')}</Text>
          </TouchableOpacity>

          {idiomas.length === 0 && (
            <Text style={estilos.faltaEscoger}>{t('mesaIdioma.escogeUno')}</Text>
          )}
          {idiomas.length > 0 && faltaZonaOtra && (
            <Text style={estilos.faltaEscoger}>{t('zona.escribeCual')}</Text>
          )}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const estilos = StyleSheet.create({
  degradado: { flex: 1 },
  // Flota sobre el contenido: el scroll ya esta centrado y meter la flecha en
  // el flujo correria todo hacia abajo.
  botonAtras: {
    position: 'absolute', left: 12, zIndex: 10,
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingVertical: 40 },
  contenido: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  titulo: {
    fontSize: 25,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  tituloZona: { marginTop: 34, fontSize: 22 },
  pista: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  opcion: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginBottom: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  opcionActiva: { borderColor: nospiColors.purpleLight },
  opcionTexto: { flex: 1, minWidth: 0 },
  opcionEtiqueta: { color: nospiColors.purpleDark, fontSize: 18, fontWeight: '700' },
  opcionSub: { color: nospiColors.gray500, fontSize: 13, fontWeight: '500', marginTop: 2 },
  casilla: {
    width: 26,
    height: 26,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: nospiColors.gray300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  casillaActiva: { backgroundColor: nospiColors.purpleDark, borderColor: nospiColors.purpleDark },
  chulo: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', lineHeight: 18 },
  campoOtra: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: nospiColors.purpleLight,
    paddingVertical: 14,
    paddingHorizontal: 18,
    fontSize: 16,
    color: nospiColors.gray900,
    marginTop: -4,
    marginBottom: 11,
  },
  avisoZona: {
    fontSize: 12.5,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.8)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderLeftWidth: 3,
    borderLeftColor: 'rgba(255,255,255,0.42)',
    borderRadius: 9,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  boton: {
    marginTop: 24,
    backgroundColor: '#FFFFFF',
    paddingVertical: 17,
    borderRadius: 999,
    alignItems: 'center',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  botonApagado: { opacity: 0.5 },
  botonTexto: { color: nospiColors.purpleDark, fontSize: 17, fontWeight: '800' },
  faltaEscoger: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
  },
});
