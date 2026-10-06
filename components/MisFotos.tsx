import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform,
  Modal, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import {
  cargarMisFotos, agregarFoto, quitarFoto, guardarOrden, moverAlFrente,
  FotoPerfil, MAX_FOTOS, LimiteFotosError, FotoVaciaError,
} from '@/lib/fotosPerfil';
import { avatarPorGenero } from '@/components/AvatarNospi';

// La rejilla de "Mis fotos" del perfil.
//
// POR QUE ES UN COMPONENTE Y NO CODIGO DENTRO DE CADA PANTALLA
// Las tres pantallas que subian foto (registro, perfil Android/web y perfil
// iOS) tenian cada una su propia copia del codigo de subida. Solo una leia
// bien el archivo, y por eso 53 fotos acabaron pesando 0 bytes sin que nadie
// se enterara. Con la rejilla en un solo sitio, arreglar algo aqui lo arregla
// en todas partes.
//
// La foto NO es obligatoria y aqui no se insiste con eso. Solo se explica para
// que sirve, que es lo que de verdad convence: en los eventos la gente mira el
// perfil de su grupo antes de llegar.

function avisar(titulo: string, mensaje: string) {
  if (Platform.OS === 'web') window.alert(`${titulo}\n\n${mensaje}`);
  else Alert.alert(titulo, mensaje);
}

/** Separacion entre casillas, en pixeles. Se usa en el calculo y en el estilo. */
const SEPARACION = 8;

export function MisFotos({
  userId,
  gender,
  onCambio,
  conEncabezado = true,
}: {
  userId: string;
  gender?: string | null;
  /** Avisa a la pantalla de perfil para refrescar la foto de arriba y el contador. */
  onCambio?: (urlPrincipal: string | null, cuantas: number) => void;
  /** Se apaga cuando la rejilla va dentro de la hoja, que ya trae su propio titulo. */
  conEncabezado?: boolean;
}) {
  const [fotos, setFotos] = useState<FotoPerfil[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [anchoRejilla, setAnchoRejilla] = useState(0);

  const recargar = useCallback(async () => {
    try {
      const lista = await cargarMisFotos(userId);
      setFotos(lista);
      onCambio?.(lista[0]?.url ?? null, lista.length);
    } catch {
      // Si no se pueden cargar, la rejilla queda vacia y se puede reintentar
      // subiendo: no tiene sentido asustar con una alerta al abrir el perfil.
    } finally {
      setCargando(false);
    }
  }, [userId, onCambio]);

  useEffect(() => { recargar(); }, [recargar]);

  const elegirYSubir = async () => {
    if (fotos.length >= MAX_FOTOS) {
      avisar('Ya tienes 6 fotos', 'Quita una para poder agregar otra.');
      return;
    }

    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      avisar('Permiso requerido', 'Necesitamos permiso para acceder a tus fotos.');
      return;
    }

    const elegida = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (elegida.canceled || !elegida.assets?.[0]) return;

    setOcupado(true);
    try {
      const nueva = await agregarFoto(userId, elegida.assets[0].uri, fotos.length);
      const lista = [...fotos, nueva];
      setFotos(lista);
      onCambio?.(lista[0]?.url ?? null, lista.length);
    } catch (e) {
      if (e instanceof FotoVaciaError || e instanceof LimiteFotosError) {
        avisar('No pudimos subir la foto', e.message);
      } else {
        avisar('No pudimos subir la foto', 'Revisa tu conexión e intenta de nuevo.');
      }
    } finally {
      setOcupado(false);
    }
  };

  const confirmarQuitar = (foto: FotoPerfil) => {
    const hacer = async () => {
      setOcupado(true);
      try {
        await quitarFoto(foto);
        const lista = fotos.filter((f) => f.id !== foto.id);
        setFotos(lista);
        onCambio?.(lista[0]?.url ?? null, lista.length);
      } catch {
        avisar('No pudimos quitarla', 'Intenta de nuevo en un momento.');
      } finally {
        setOcupado(false);
      }
    };

    const texto = foto.orden === 0 && fotos.length > 1
      ? 'Es tu foto principal. La siguiente pasará a ocupar su lugar.'
      : '¿Seguro que quieres quitar esta foto?';

    if (Platform.OS === 'web') {
      if (window.confirm(`Quitar foto\n\n${texto}`)) hacer();
    } else {
      Alert.alert('Quitar foto', texto, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Quitar', style: 'destructive', onPress: hacer },
      ]);
    }
  };

  const hacerPrincipal = async (foto: FotoPerfil) => {
    const nuevoOrden = moverAlFrente(fotos, foto.id);
    const previo = fotos;
    setFotos(nuevoOrden.map((f, i) => ({ ...f, orden: i })));
    onCambio?.(nuevoOrden[0]?.url ?? null, nuevoOrden.length);
    setOcupado(true);
    try {
      await guardarOrden(nuevoOrden);
    } catch {
      setFotos(previo);
      onCambio?.(previo[0]?.url ?? null, previo.length);
      avisar('No pudimos cambiarla', 'Intenta de nuevo en un momento.');
    } finally {
      setOcupado(false);
    }
  };

  const porDefecto = avatarPorGenero(gender);
  const huecos = Math.max(0, MAX_FOTOS - fotos.length);

  // Las casillas se miden en pixeles y no en porcentaje.
  //
  // Con width:'31.5%' + flexWrap, la fila de arriba quedaba mas alta que la de
  // abajo: en una fila que envuelve, los hijos se estiran al alto de la fila,
  // y el aspectRatio no alcanza a mandar. Midiendo el ancho real y fijando
  // ancho y alto exactos, las seis quedan identicas siempre.
  const ladoCasilla = anchoRejilla > 0 ? (anchoRejilla - SEPARACION * 2) / 3 : 0;
  const dimCasilla = { width: ladoCasilla, height: Math.round(ladoCasilla / 0.82) };

  return (
    <View style={e.caja}>
      {conEncabezado && (
        <>
          <View style={e.encabezado}>
            <Text style={e.titulo}>Mis fotos</Text>
            <Text style={e.contador}>{fotos.length}/{MAX_FOTOS}</Text>
          </View>
          <Text style={e.ayuda}>
            La primera es tu foto de perfil. Las personas de tu grupo ven tu perfil
            antes del evento.
          </Text>
        </>
      )}

      {cargando ? (
        <ActivityIndicator color="#880E4F" style={{ marginVertical: 24 }} />
      ) : (
        <View
          style={e.rejilla}
          onLayout={(ev) => setAnchoRejilla(ev.nativeEvent.layout.width)}
        >
          {ladoCasilla === 0 ? null : fotos.map((foto, i) => (
            <View key={foto.id} style={[e.casilla, dimCasilla]}>
              <ExpoImage
                source={{ uri: foto.url }}
                style={e.fotoCasilla}
                cachePolicy="memory-disk"
                contentFit="cover"
                transition={120}
              />
              {i === 0 ? (
                <View style={e.etiquetaPrincipal}>
                  <Text style={e.etiquetaPrincipalTexto}>PRINCIPAL</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={e.botonPrincipal}
                  onPress={() => hacerPrincipal(foto)}
                  disabled={ocupado}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Usar esta como foto de perfil"
                >
                  <Text style={e.botonPrincipalTexto}>Hacer principal</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={e.quitar}
                onPress={() => confirmarQuitar(foto)}
                disabled={ocupado}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Quitar esta foto"
              >
                <Text style={e.quitarTexto}>×</Text>
              </TouchableOpacity>
            </View>
          ))}

          {(ladoCasilla === 0 ? [] : Array.from({ length: huecos })).map((_, i) => (
            <TouchableOpacity
              key={`hueco-${i}`}
              style={[e.casilla, e.casillaVacia, dimCasilla]}
              onPress={elegirYSubir}
              disabled={ocupado}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Agregar una foto"
            >
              {ocupado && i === 0 ? (
                <ActivityIndicator color="#AD1457" />
              ) : fotos.length === 0 && i === 0 && porDefecto ? (
                /* En el primer hueco de quien no tiene ninguna foto se ve el
                   personaje de Nospi: es lo que los demas estan viendo ahora
                   mismo en su lugar, y entenderlo motiva mas que un texto. */
                <>
                  <ExpoImage source={porDefecto} style={e.avatarHueco} contentFit="contain" />
                  <Text style={e.masTexto}>Subir la primera</Text>
                </>
              ) : (
                <>
                  <Text style={e.mas}>+</Text>
                  <Text style={e.masTexto}>Agregar</Text>
                </>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const e = StyleSheet.create({
  caja: { marginTop: 8 },
  encabezado: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titulo: { fontSize: 17, fontWeight: '700', color: '#1F2937' },
  contador: { fontSize: 13, color: '#9CA3AF', fontWeight: '600' },
  ayuda: { fontSize: 13, color: '#6B7280', marginTop: 4, marginBottom: 12, lineHeight: 18 },

  rejilla: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: SEPARACION, minHeight: 10 },
  casilla: {
    borderRadius: 14, overflow: 'hidden',
    backgroundColor: '#FCE4EC', position: 'relative',
  },
  casillaVacia: {
    alignItems: 'center', justifyContent: 'center', gap: 2,
    borderWidth: 1.5, borderColor: '#F8BBD9', borderStyle: 'dashed', backgroundColor: '#FFF7FA',
  },
  fotoCasilla: { width: '100%', height: '100%' },
  avatarHueco: { width: '62%', height: '46%' },
  mas: { fontSize: 26, color: '#AD1457', fontWeight: '300', lineHeight: 30 },
  masTexto: { fontSize: 11, color: '#AD1457', fontWeight: '600', textAlign: 'center' },

  etiquetaPrincipal: {
    position: 'absolute', left: 6, bottom: 6,
    backgroundColor: '#880E4F', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
  },
  etiquetaPrincipalTexto: { color: '#FFFFFF', fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },

  botonPrincipal: {
    position: 'absolute', left: 5, right: 5, bottom: 5,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingVertical: 4, alignItems: 'center',
  },
  botonPrincipalTexto: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },

  quitar: {
    position: 'absolute', top: 5, right: 5,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  quitarTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', lineHeight: 17 },
});

// ─────────────────────────────────────────────────────────────────────────────
// La hoja que se abre al tocar la foto de perfil.
//
// POR QUE EN UNA HOJA Y NO COMO UNA SECCION MAS DEL PERFIL
// Puesta como seccion suelta mas abajo, hay que acordarse de bajar a buscarla.
// La gente que quiere cambiar su foto hace lo obvio: tocar su foto. Entonces
// eso es lo que la abre. El lapiz que habia antes no decia que se pudiera
// tener mas de una; el contador "2 de 6" si lo dice sin explicar nada.
export function MisFotosHoja({
  visible,
  onClose,
  userId,
  gender,
  onCambio,
}: {
  visible: boolean;
  onClose: () => void;
  userId: string;
  gender?: string | null;
  onCambio?: (urlPrincipal: string | null, cuantas: number) => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={h.fondo} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          style={[h.hoja, { paddingBottom: insets.bottom + 18 }]}
          activeOpacity={1}
          onPress={() => {}}
        >
          <View style={h.agarradera} />
          <Text style={h.titulo}>Mis fotos</Text>
          <Text style={h.ayuda}>
            Puedes subir hasta {MAX_FOTOS}. La primera es tu foto de perfil, y las demás
            las ven las personas de tu grupo antes del evento.
          </Text>

          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            <MisFotos userId={userId} gender={gender} onCambio={onCambio} conEncabezado={false} />
          </ScrollView>

          <TouchableOpacity style={h.listo} onPress={onClose} activeOpacity={0.85}>
            <Text style={h.listoTexto}>Listo</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const h = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  hoja: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingTop: 10, paddingHorizontal: 20,
  },
  agarradera: {
    width: 38, height: 4, borderRadius: 2, backgroundColor: '#E5E0E3',
    alignSelf: 'center', marginBottom: 14,
  },
  titulo: { fontSize: 20, fontWeight: '800', color: '#1F2937' },
  ayuda: { fontSize: 13.5, color: '#6B7280', lineHeight: 19, marginTop: 4, marginBottom: 6 },
  listo: {
    marginTop: 18, backgroundColor: '#880E4F', borderRadius: 24,
    paddingVertical: 13, alignItems: 'center',
  },
  listoTexto: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
