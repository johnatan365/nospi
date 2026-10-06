import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Image as ExpoImage } from 'expo-image';

// La foto de alguien, con un respaldo digno cuando no la ha subido.
//
// POR QUE EXISTE
// La foto de perfil no es obligatoria al registrarse, a proposito: pedirla de
// entrada espanta gente. El resultado es que una buena parte de los perfiles
// no tiene foto, y hasta ahora esos salian como un circulo gris con una
// inicial o un emoji de muneco. Se veia como un error de la app, no como una
// decision.
//
// Ahora sale el personaje de Nospi segun el genero. Es el mismo que ya se usa
// en Instagram, asi que la gente lo reconoce, y un perfil sin foto deja de
// parecer un perfil roto.
//
// Para "no binario" NO se escoge ninguno de los dos a dedo: se muestra la
// inicial. Asignarle un personaje con genero a alguien que dijo que no se
// identifica con ninguno seria justo lo contrario de lo que pidio.

const AVATAR_MUJER = require('@/assets/images/avatares/avatar-nospi-mujer.png');
const AVATAR_HOMBRE = require('@/assets/images/avatares/avatar-nospi-hombre.png');

export function avatarPorGenero(gender?: string | null) {
  const g = (gender || '').trim().toLowerCase();
  if (g === 'mujer') return AVATAR_MUJER;
  if (g === 'hombre') return AVATAR_HOMBRE;
  return null;
}

export function AvatarNospi({
  url,
  gender,
  nombre,
  size = 44,
  radio,
  style,
  transition = 120,
}: {
  url?: string | null;
  gender?: string | null;
  nombre?: string | null;
  size?: number;
  /** Por defecto es un circulo. Se pasa otro valor para esquinas menos redondas. */
  radio?: number;
  style?: StyleProp<ViewStyle>;
  transition?: number;
}) {
  const borderRadius = radio ?? size / 2;
  const base = { width: size, height: size, borderRadius };

  if (url) {
    return (
      <ExpoImage
        source={{ uri: url }}
        style={[base, style]}
        cachePolicy="memory-disk"
        transition={transition}
        contentFit="cover"
      />
    );
  }

  const porDefecto = avatarPorGenero(gender);
  if (porDefecto) {
    return (
      <ExpoImage
        source={porDefecto}
        style={[base, style]}
        cachePolicy="memory-disk"
        transition={0}
        contentFit="cover"
      />
    );
  }

  const inicial = (nombre || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <View style={[base, estilos.inicialCaja, style]}>
      <Text style={[estilos.inicialTexto, { fontSize: Math.max(12, size * 0.4) }]}>{inicial}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  inicialCaja: { backgroundColor: '#F8BBD9', alignItems: 'center', justifyContent: 'center' },
  inicialTexto: { color: '#880E4F', fontWeight: '700' },
});
