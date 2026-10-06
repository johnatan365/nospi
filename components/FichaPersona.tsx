import React, { useEffect, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, Pressable, useWindowDimensions,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { avatarPorGenero } from '@/components/AvatarNospi';
import { supabase } from '@/lib/supabase';

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
  /** La frase que la persona escribio sobre si misma. */
  bio?: string | null;
  en_linea?: boolean;
}

/** Quita las claves vacias para que el servidor rellene sin borrar. */
function limpiar(o: Partial<PersonaFicha> | null): Partial<PersonaFicha> {
  if (!o) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out as Partial<PersonaFicha>;
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
  pie,
}: {
  persona: PersonaFicha | null;
  onClose: () => void;
  /**
   * Contenido propio de la pantalla que la abre, justo encima de "Cerrar".
   * El chat lo usa para el aviso de solicitud y el boton de escribir por
   * privado. Existe para que no haga falta una segunda ficha hecha a mano:
   * antes el chat tenia la suya y por eso ahi solo se veia UNA foto.
   */
  pie?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [indice, setIndice] = useState(0);

  // Al abrir la ficha de otra persona se vuelve a la primera foto: si no, se
  // quedaba en la foto 3 de la anterior y se veia un hueco.
  useEffect(() => { setIndice(0); }, [persona?.user_id]);

  // El perfil completo se pide al abrir la ficha, no en las listas.
  //
  // Las listas de participantes traen lo justo para pintar avatares. Si cada
  // campo nuevo del perfil tuviera que viajar en todas ellas, agregar uno
  // obligaria a crear otra version de cada funcion del servidor. Pidiendolo
  // aqui, una sola consulta y solo de la persona que se abrio, cualquier campo
  // que se agregue aparece en TODAS las pantallas sin tocar ninguna.
  const [extra, setExtra] = useState<Partial<PersonaFicha> | null>(null);
  useEffect(() => {
    const uid = persona?.user_id;
    setExtra(null);
    if (!uid) return;
    let vivo = true;
    supabase
      .rpc('get_perfil_publico', { p_user_id: uid })
      .then(({ data }) => {
        const f = Array.isArray(data) ? data[0] : null;
        if (vivo && f) setExtra(f as Partial<PersonaFicha>);
      });
    return () => { vivo = false; };
  }, [persona?.user_id]);

  // Lo que ya traia la pantalla manda; el servidor rellena lo que falte. Asi la
  // ficha se pinta de una con lo que haya y se completa sola al llegar.
  const p: PersonaFicha | null = persona && { ...persona, ...limpiar(extra) };

  const fotos = (() => {
    const lista = aLista(p?.fotos);
    if (lista.length) return lista;
    return p?.profile_photo_url ? [p.profile_photo_url] : [];
  })();

  const intereses = aLista(p?.interests);
  const rasgos = aLista(p?.personality_traits);
  const porDefecto = avatarPorGenero(p?.gender);
  const frase = (p?.bio || '').trim();

  // La foto ocupa el ancho de la pantalla y algo mas de alto que de ancho:
  // los retratos se ven mejor asi y deja sitio al nombre sin taparle la cara.
  const altoFoto = Math.min(Math.round(width * 1.05), 420);
  const hayVarias = fotos.length > 1;

  const subtitulo = [
    typeof p?.edad === 'number' ? `${p.edad} años` : null,
    p?.city?.trim() || null,
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
                {/* Sin interrogante: si no hay nombre se deja solo el texto,
                    que dice mas y no parece un error de la app. */}
                {!!(p?.name || '').trim() && (
                  <Text style={estilos.sinFotoInicial}>
                    {p!.name.trim().charAt(0).toUpperCase()}
                  </Text>
                )}
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

            {/* Media pantalla a cada lado para pasar fotos, MAS flechas y un
                contador que se vean.
                Solo con las zonas invisibles, quien no conoce el gesto cree que
                hay una sola foto y nunca descubre las demas. Las flechas dicen
                "esto se mueve" y el "1/4" dice cuantas faltan. */}
            {hayVarias && (
              <>
                <Pressable
                  style={[estilos.zonaToque, { left: 0 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Foto anterior"
                  onPress={() => setIndice((i) => (i - 1 + fotos.length) % fotos.length)}
                >
                  <View style={[estilos.flecha, { marginLeft: 10 }]}>
                    <Text style={estilos.flechaTexto}>‹</Text>
                  </View>
                </Pressable>
                <Pressable
                  style={[estilos.zonaToque, estilos.zonaDerecha, { right: 0 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Foto siguiente"
                  onPress={() => setIndice((i) => (i + 1) % fotos.length)}
                >
                  <View style={[estilos.flecha, { marginRight: 10 }]}>
                    <Text style={estilos.flechaTexto}>›</Text>
                  </View>
                </Pressable>

                <View style={estilos.contador} pointerEvents="none">
                  <Text style={estilos.contadorTexto}>
                    {Math.min(indice, fotos.length - 1) + 1}/{fotos.length}
                  </Text>
                </View>
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
                  {p?.name || 'Alguien'}
                </Text>
              </View>
              {!!subtitulo && <Text style={estilos.subtitulo}>{subtitulo}</Text>}
            </View>

            {/* Puntico verde de "en linea": arriba a la derecha de la foto,
                como en WhatsApp. Antes iba junto al nombre, abajo. */}
            {p?.en_linea && (
              <View style={estilos.puntoEnLinea} pointerEvents="none" />
            )}
          </View>

          <View style={estilos.cuerpo}>
            {!!frase && <Text style={estilos.frase}>{frase}</Text>}

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

            {!intereses.length && !rasgos.length && !frase && (
              <Text style={estilos.vacio}>
                Todavía no ha contado sus intereses. Pregúntale en el evento 😉
              </Text>
            )}

            {pie}

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
    flex: 1, height: 3.5, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.45)',
    // Sombra para que las barras se vean tambien sobre una foto clara: sin
    // esto, en una foto de playa o de cielo desaparecian del todo.
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
  },
  barritaActiva: { backgroundColor: '#FFFFFF' },

  zonaToque: {
    position: 'absolute', top: 0, bottom: 0, width: '45%',
    justifyContent: 'center', alignItems: 'flex-start',
  },
  zonaDerecha: { alignItems: 'flex-end' },
  flecha: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.32)',
    alignItems: 'center', justifyContent: 'center',
  },
  flechaTexto: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', lineHeight: 24 },
  contador: {
    position: 'absolute', top: 20, right: 12,
    backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 11,
    paddingHorizontal: 9, paddingVertical: 3,
  },
  contadorTexto: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '700' },

  degradado: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '52%' },
  sobreFoto: { position: 'absolute', left: 20, right: 20, bottom: 16 },
  filaNombre: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nombre: {
    fontSize: 26, fontWeight: '800', color: '#FFFFFF', flexShrink: 1,
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  puntoEnLinea: {
    position: 'absolute', top: 16, right: 16,
    width: 18, height: 18, borderRadius: 9, backgroundColor: '#4ADE80',
    borderWidth: 3, borderColor: '#FFFFFF',
  },
  subtitulo: {
    fontSize: 15, color: 'rgba(255,255,255,0.92)', marginTop: 2, fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },

  cuerpo: { paddingHorizontal: 20, paddingTop: 18 },
  frase: {
    fontSize: 15.5, lineHeight: 22, color: '#374151', marginBottom: 16,
    fontStyle: 'italic',
  },
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
