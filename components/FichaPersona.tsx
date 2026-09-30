import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Ficha de una persona: foto, nombre, edad e intereses.
//
// Existe aparte porque el nombre y la foto de alguien aparecen en varios
// sitios -- la lista de confirmados de la sala, la de la dinamica, el chat --
// y en todos se espera poder tocarlos para ver quien es. Tenerla en un solo
// lugar evita que una pantalla la muestre y otra no.
//
// NO muestra correo ni telefono a proposito, aunque el servidor los tuviera a
// mano: para hablarle a alguien esta el chat de la app.

export interface PersonaFicha {
  user_id: string;
  name: string;
  profile_photo_url?: string | null;
  edad?: number | null;
  interests?: string[] | null;
}

export function FichaPersona({
  persona,
  onClose,
}: {
  persona: PersonaFicha | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={!!persona} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={estilos.fondo} activeOpacity={1} onPress={onClose}>
        {/* El paddingBottom incluye insets.bottom: sin eso, en Android el boton
            queda pegado a la barra de navegacion y casi no hay donde tocarlo. */}
        <TouchableOpacity
          style={[estilos.hoja, { paddingBottom: insets.bottom + 24 }]}
          activeOpacity={1}
          onPress={() => {}}
        >
          {persona?.profile_photo_url ? (
            <ExpoImage
              source={{ uri: persona.profile_photo_url }}
              style={estilos.foto}
              cachePolicy="memory-disk"
              transition={120}
            />
          ) : (
            <View style={[estilos.foto, estilos.fotoVacia]}>
              <Text style={{ fontSize: 44 }}>👤</Text>
            </View>
          )}

          <Text style={estilos.nombre}>{persona?.name || 'Alguien'}</Text>
          {typeof persona?.edad === 'number' && (
            <Text style={estilos.edad}>{persona.edad} años</Text>
          )}

          {!!persona?.interests?.length && (
            <View style={estilos.chips}>
              {persona.interests.map((it) => (
                <View key={it} style={estilos.chip}>
                  <Text style={estilos.chipTexto}>{it}</Text>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity style={estilos.cerrar} onPress={onClose} activeOpacity={0.85}>
            <Text style={estilos.cerrarTexto}>Cerrar</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  hoja: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingTop: 24, paddingHorizontal: 24, alignItems: 'center',
  },
  foto: { width: 108, height: 108, borderRadius: 54, marginBottom: 14 },
  fotoVacia: { backgroundColor: '#F3E8EF', alignItems: 'center', justifyContent: 'center' },
  nombre: { fontSize: 21, fontWeight: '700', color: '#1F2937', textAlign: 'center' },
  edad: { fontSize: 15, color: '#6B7280', marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, justifyContent: 'center', marginTop: 14 },
  chip: { backgroundColor: '#FAF5F8', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipTexto: { fontSize: 13, color: '#880E4F', fontWeight: '600' },
  cerrar: {
    marginTop: 22, backgroundColor: '#880E4F', borderRadius: 24,
    paddingVertical: 13, paddingHorizontal: 40, alignSelf: 'stretch', alignItems: 'center',
  },
  cerrarTexto: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
