import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

// Reduce las fotos de perfil ANTES de subirlas.
//
// Por que: hasta ahora se subian casi tal cual salian de la camara. El promedio
// era 1 MB y habia fotos de 5 MB, cuando la app nunca muestra mas de ~1.200
// pixeles de ancho (el avatar son 120 puntos, y a pantalla completa cabe el
// ancho del telefono). Se estaba guardando -- y descargando en cada visita --
// una foto cinco veces mas grande de lo que alguien llega a ver.
//
// 1080 x 1080 es MAS de lo que la pantalla mas grande de la app puede mostrar,
// asi que no se nota ninguna diferencia, ni abriendola en grande.

/** Lado maximo de la foto de perfil ya procesada. */
export const PROFILE_PHOTO_MAX_SIZE = 1080;

/** Calidad JPEG. 0.85 es indistinguible del original a simple vista. */
const PROFILE_PHOTO_QUALITY = 0.85;

export interface CompressedImage {
  uri: string;
  width: number;
  height: number;
}

/**
 * Devuelve la foto reducida a 1080 px de lado maximo, en JPEG.
 * Si algo falla, devuelve la original: es preferible subir una foto pesada
 * a dejar a la persona sin poder cambiarse el avatar.
 */
export async function compressProfilePhoto(uri: string): Promise<CompressedImage> {
  try {
    const result = await manipulateAsync(
      uri,
      // Solo se toca el ancho: la altura se ajusta sola y no se deforma. La
      // foto de perfil ya viene recortada en cuadrado por el selector.
      [{ resize: { width: PROFILE_PHOTO_MAX_SIZE } }],
      { compress: PROFILE_PHOTO_QUALITY, format: SaveFormat.JPEG }
    );
    return { uri: result.uri, width: result.width, height: result.height };
  } catch (e) {
    console.warn('No se pudo reducir la foto, se sube la original:', e);
    return { uri, width: 0, height: 0 };
  }
}
