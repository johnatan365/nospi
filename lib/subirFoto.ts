// Lectura de una imagen local para subirla a Supabase Storage.
//
// POR QUE EXISTE ESTE ARCHIVO
// En React Native, `await (await fetch(uri)).blob()` sobre un archivo local
// (file://, ph://, content://) devuelve un Blob VACIO en las versiones
// recientes de Expo. El `arrayBuffer()` queda en 0 bytes, Supabase ACEPTA la
// subida sin devolver error, se guarda la URL publica y todo parece correcto.
// El resultado es una foto de perfil que no se ve nunca.
//
// El dano medido el 6 de octubre de 2026: 53 fotos de 421 quedaron en 0 bytes,
// y la proporcion venia creciendo mes a mes — 0% en julio, 3,6% en agosto,
// 20,4% en septiembre y 45,2% en los primeros dias de octubre. Las tres
// pantallas que suben foto (registro, perfil Android/web y perfil iOS) tenian
// cada una su propia version del codigo y solo una leia bien el archivo.
//
// Aqui queda UNA sola forma de hacerlo, para las tres:
//   - en nativo se lee el archivo con expo-file-system en base64, que si trae
//     los bytes de verdad
//   - en web se usa fetch + blob, que ahi si funciona
//   - y SIEMPRE se verifica que el resultado no este vacio antes de subir
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';

/** Error con mensaje ya listo para mostrarle a la persona. */
export class FotoVaciaError extends Error {
  constructor() {
    super('No pudimos leer la imagen que elegiste. Intenta con otra foto de tu galería.');
    this.name = 'FotoVaciaError';
  }
}

/**
 * Lee una imagen local y devuelve sus bytes listos para subir.
 * Lanza FotoVaciaError si el archivo no se pudo leer o quedo vacio, en vez de
 * devolver 0 bytes en silencio.
 */
export async function leerImagenParaSubir(uri: string, base64Data?: string | null): Promise<ArrayBuffer> {
  let bytes: ArrayBuffer;

  if (base64Data) {
    // El selector de imagenes ya nos dio el base64: es el camino mas directo.
    bytes = base64ABytes(base64Data);
  } else if (Platform.OS === 'web') {
    const res = await fetch(uri);
    if (!res.ok) throw new FotoVaciaError();
    bytes = await res.arrayBuffer();
  } else {
    // Nativo: NUNCA fetch().blob() sobre un file:// — ver el comentario de arriba.
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    bytes = base64ABytes(base64);
  }

  // La red de seguridad que faltaba. Sin esto, un archivo vacio se sube igual,
  // Supabase lo acepta y la persona queda con una foto que no se ve.
  if (!bytes || bytes.byteLength === 0) throw new FotoVaciaError();
  return bytes;
}

function base64ABytes(base64: string): ArrayBuffer {
  const limpio = base64.includes(',') ? base64.split(',')[1] : base64;
  const binario = atob(limpio);
  const out = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) out[i] = binario.charCodeAt(i);
  return out.buffer;
}
