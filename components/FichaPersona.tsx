import React, { useEffect, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, Pressable, useWindowDimensions,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { avatarPorGenero } from '@/components/AvatarNospi';

// Ficha de una persona: sus fotos, nombre, edad, ciudad, intereses y como es.
//
// Existe aparte porque el nombre y la foto de alguien aparecen en varios
// sitios -- la lista de confirmados de la sala, la de la dinamica, el chat --
// y en todos se espera poder tocarlos para ver quien es. Tenerla en un solo
// lugar evita que una pantalla la muestre y otra no.
//
// NO muestra correo ni telefono a proposito, aunque el servidor los tuviera a
// mano: para hablarle a alguien esta el chat de la app.
//
// QUE CAMBIO (octubre 2026)
// Antes era una foto redonda de 108 px, el nombre y la edad. Con eso, abrir la
// ficha de alguien no decia casi nada y la gente dejaba de tocarla. Ahora la
// foto ocupa todo el ancho, se pueden pasar varias, y debajo van los intereses
// y los rasgos de personalidad, que ya estaban guardados y nunca se mostraban.
// Tambien la ciudad, util porque la videollamada es nacional y conocer de
// donde es la otra persona da tema de conversacion.

export interface PersonaFicha {
  user_id: string;
  name: string;
  profile_photo_url?: string | null;
  /** Todas sus fotos, la primera es la de perfil. Si no viene, se usa profile_photo_url. */
  fotos?: string[] | null;
  edad?: number | null;
  interests?: string[] | null;
  personality_traits?: string[] | null;
  city?: string | null;
  gender?: string | null;
  en_linea?: boolean;
}

/** Acepta tanto un arreglo como el jsonb crudo que a veces llega como texto. */
function aLista(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x.trim()) as string[];
  if (typeof v === 'string' && v.trim().startsWith('[')) {
    try { return aLista(JSON.parse(v)); } catch { return []; }
  }
  return [];
}

export function FichaPersona({
  persona,
  onClose,
}: {
  persona: PersonaFicha | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [indice, setIndice] = useState(0);

  // Al abrir la ficha de otra persona se vuelve a la primera foto: si no, se
  // quedaba en la foto 3 de la anterior y se veia un hueco.
  useEffect(() => { setIndice(0); }, [persona?.user_id]);

  const fotos = (() => {
    const lista = aLista(persona?.fotos);
    if (lista.length) return lista;
    return persona?.profile_photo_url ? [persona.profile_photo_url] : [];
  })();

  const intereses = aLista(persona?.interests);
  const rasgos = aLista(persona?.personality_traits);
  const porDefecto = avatarPorGenero(persona?.gender);

  // La foto ocupa el ancho de la pantalla y algo mas de alto que de ancho:
  // los retratos se ven mejor asi y deja sitio al nombre sin taparle la cara.
  const altoFoto = Math.min(Math.round(width * 1.05), 420);
  const hayVarias = fotos.length > 1;

  const subtitulo = [
    typeof persona?.edad === 'number' ? `${persona.edad} años` : null,
    persona?.city?.trim() || null,
  ].filter(Boolean).join(' · ');

  return (
    <Modal visible={!!persona} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={estilos.fondo} activeOpacity={1} onPress={onClose}>
        {/* El paddingBottom incluye insets.bottom: sin eso, en Android el boton
            queda pegado a la barra de navegacion y casi no hay donde tocarlo. */}
        <TouchableOpacity
          style={[estilos.hoja, { paddingBottom: insets.bottom + 20 }]}
          activeOpacity={1}
          onPress={() => {}}
        >
          <View style={[estilos.marcoFoto, { height: altoFoto }]}>
            {fotos.length > 0 ? (
              <ExpoImage
                source={{ uri: fotos[Math.min(indice, fotos.length - 1)] }}
                style={estilos.foto}
                cachePolicy="memory-disk"
                transition={160}
                contentFit="cover"
              />
            ) : porDefecto ? (
              <View style={estilos.sinFoto}>
                <ExpoImage source={porDefecto} style={estilos.sinFotoAvatar} contentFit="contain" />
                <Text style={estilos.sinFotoTexto}>Todavía no ha subido fotos</Text>
              </View>
            ) : (
              <View style={estilos.sinFoto}>
                <Text style={estilos.sinFotoInicial}>
                  {(persona?.name || '?').trim().charAt(0).toUpperCase()}
                </Text>
                <Text style={estilos.sinFotoTexto}>Todavía no ha subido fotos</Text>
              </View>
            )}

            {/* Barritas tipo historia: dicen cuantas fotos hay sin tener que
                deslizar a ciegas para averiguarlo. */}
            {hayVarias && (
              <View style={estilos.barritas}>
                {fotos.map((_, i) => (
                  <View
                    key={i}
                    style={[estilos.barrita, i === indice && estilos.barritaActiva]}
                  />
                ))}
              </View>
            )}

            {/* Media pantalla a cada lado para pasar fotos. Es como funcionan
                las historias, asi que nadie tiene que aprenderlo. */}
            {hayVarias && (
              <>
                <Pressable
                  style={[estilos.zonaToque, { left: 0 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Foto anterior"
                  onPress={() => setIndice((i) => (i - 1 + fotos.length) % fotos.length)}
                />
                <Pressable
                  style={[estilos.zonaToque, { right: 0 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Foto siguiente"
                  onPress={() => setIndice((i) => (i + 1) % fotos.length)}
                />
              </>
            )}

            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.78)']}
              locations={[0, 0.55, 1]}
              style={estilos.degradado}
              pointerEvents="none"
            />

            <View style={estilos.sobreFoto} pointerEvents="none">
              <View style={estilos.filaNombre}>
                <Text style={estilos.nombre} numberOfLines={1}>
                  {persona?.name || 'Alguien'}
                </Text>
                {persona?.en_linea && <View style={estilos.puntoEnLinea} />}
              </View>
              {!!subtitulo && <Text style={estilos.subtitulo}>{subtitulo}</Text>}
            </View>
          </View>

          <View style={estilos.cuerpo}>
            {!!intereses.length && (
              <>
                <Text style={estilos.seccion}>Le gusta</Text>
                <View style={estilos.chips}>
                  {intereses.map((it) => (
                    <View key={`i-${it}`} style={estilos.chip}>
                      <Text style={estilos.chipTexto}>{it}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {!!rasgos.length && (
              <>
                <Text style={[estilos.seccion, intereses.length ? { marginTop: 16 } : null]}>
                  Cómo es
                </Text>
                <View style={estilos.chips}>
                  {rasgos.map((it) => (
                    <View key={`p-${it}`} style={[estilos.chip, estilos.chipRasgo]}>
                      <Text style={[estilos.chipTexto, estilos.chipRasgoTexto]}>{it}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {!intereses.length && !rasgos.length && (
              <Text style={estilos.vacio}>
                Todavía no ha contado sus intereses. Pregúntale en el evento 😉
              </Text>
            )}

            <TouchableOpacity style={estilos.cerrar} onPress={onClose} activeOpacity={0.85}>
              <Text style={estilos.cerrarTexto}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  hoja: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    overflow: 'hidden',
  },

  marcoFoto: { width: '100%', backgroundColor: '#FCE4EC', position: 'relative' },
  foto: { width: '100%', height: '100%' },
  sinFoto: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  sinFotoAvatar: { width: '58%', height: '58%' },
  sinFotoInicial: { fontSize: 76, fontWeight: '800', color: '#AD1457' },
  sinFotoTexto: { fontSize: 13, color: '#AD1457', fontWeight: '600' },

  barritas: {
    position: 'absolute', top: 10, left: 12, right: 12,
    flexDirection: 'row', gap: 4,
  },
  barrita: {
    flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.4)',
  },
  barritaActiva: { backgroundColor: '#FFFFFF' },

  zonaToque: { position: 'absolute', top: 0, bottom: 0, width: '45%' },

  degradado: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '52%' },
  sobreFoto: { position: 'absolute', left: 20, right: 20, bottom: 16 },
  filaNombre: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nombre: {
    fontSize: 26, fontWeight: '800', color: '#FFFFFF', flexShrink: 1,
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  puntoEnLinea: {
    width: 11, height: 11, borderRadius: 6, backgroundColor: '#4ADE80',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)',
  },
  subtitulo: {
    fontSize: 15, color: 'rgba(255,255,255,0.92)', marginTop: 2, fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },

  cuerpo: { paddingHorizontal: 20, paddingTop: 18 },
  seccion: {
    fontSize: 12, fontWeight: '700', color: '#9CA3AF',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { backgroundColor: '#FCE4EC', borderRadius: 16, paddingVertical: 7, paddingHorizontal: 13 },
  chipTexto: { fontSize: 13, color: '#880E4F', fontWeight: '600' },
  chipRasgo: { backgroundColor: '#F3F4F6' },
  chipRasgoTexto: { color: '#4B5563' },
  vacio: { fontSize: 14, color: '#6B7280', textAlign: 'center', paddingVertical: 4 },

  cerrar: {
    marginTop: 22, backgroundColor: '#880E4F', borderRadius: 24,
    paddingVertical: 13, paddingHorizontal: 40, alignSelf: 'stretch', alignItems: 'center',
  },
  cerrarTexto: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
