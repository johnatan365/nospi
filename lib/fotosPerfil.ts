// Las fotos del perfil de quien esta usando la app.
//
// POR QUE EXISTE
// Hasta octubre de 2026 cada persona tenia UNA foto, guardada en
// users.profile_photo_url, y subir una nueva BORRABA todo lo que hubiera en su
// carpeta de storage. Ahora puede tener hasta seis y la primera es la de
// perfil, asi que ese borrado a ciegas habria eliminado las demas.
//
// La columna users.profile_photo_url sigue existiendo y sigue siendo la foto
// principal: un disparador en la base la copia sola desde la foto de orden 0.
// Gracias a eso los chats, la dinamica, el admin y los correos no se enteraron
// de nada.
import { supabase } from '@/lib/supabase';
import { leerImagenParaSubir, FotoVaciaError } from '@/lib/subirFoto';
import { compressProfilePhoto } from '@/lib/imageCompress';

export const MAX_FOTOS = 6;

export interface FotoPerfil {
  id: string;
  url: string;
  orden: number;
  storage_path: string | null;
}

export class LimiteFotosError extends Error {
  constructor() {
    super(`Puedes tener hasta ${MAX_FOTOS} fotos. Quita una para agregar otra.`);
    this.name = 'LimiteFotosError';
  }
}

/**
 * Cuantas fotos tiene, sin traerlas.
 * La pantalla de perfil lo necesita para escribir "2 de 6" debajo del nombre
 * sin tener que abrir la hoja primero.
 */
export async function contarMisFotos(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('user_photos')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) return 0;
  return count ?? 0;
}

export async function cargarMisFotos(userId: string): Promise<FotoPerfil[]> {
  const { data, error } = await supabase
    .from('user_photos')
    .select('id, url, orden, storage_path')
    .eq('user_id', userId)
    .order('orden', { ascending: true });
  if (error) throw error;
  return (data || []) as FotoPerfil[];
}

/**
 * Sube una imagen y la agrega al final de la lista.
 * Lanza FotoVaciaError si el archivo no se pudo leer -- antes eso se subia
 * igual, en 0 bytes, y la persona quedaba con una foto que no se veia nunca.
 */
export async function agregarFoto(
  userId: string,
  uri: string,
  yaTiene: number,
): Promise<FotoPerfil> {
  if (yaTiene >= MAX_FOTOS) throw new LimiteFotosError();

  const comprimida = await compressProfilePhoto(uri);

  // Se lee ANTES de tocar storage: si la imagen no se puede leer, no se sube
  // nada y lo que la persona ya tenia sigue intacto. Se lee del archivo ya
  // comprimido, nunca del base64 que devolvio el selector: ese es el original
  // de 5 MB y subirlo anularia la compresion que acabamos de hacer.
  const bytes = await leerImagenParaSubir(comprimida.uri);

  const timestamp = Date.now();
  const storagePath = `${userId}/${userId}-${timestamp}.jpg`;

  const { error: errorSubida } = await supabase.storage
    .from('profile-photos')
    .upload(storagePath, bytes, { contentType: 'image/jpeg', cacheControl: '3600', upsert: true });
  if (errorSubida) throw errorSubida;

  const { data: urlData } = supabase.storage.from('profile-photos').getPublicUrl(storagePath);

  const { data, error } = await supabase
    .from('user_photos')
    .insert({ user_id: userId, url: urlData.publicUrl, storage_path: storagePath, orden: yaTiene })
    .select('id, url, orden, storage_path')
    .single();

  if (error) {
    // Si la fila no entro, el archivo subido no le sirve a nadie: se quita
    // para no dejar basura acumulandose en storage.
    await supabase.storage.from('profile-photos').remove([storagePath]).catch(() => {});
    throw error;
  }

  return data as FotoPerfil;
}

/** Quita una foto y recompacta el orden para que no queden huecos. */
export async function quitarFoto(foto: FotoPerfil): Promise<void> {
  const { error } = await supabase.from('user_photos').delete().eq('id', foto.id);
  if (error) throw error;

  // Renumerar es cosa del servidor: la restriccion unica de (user_id, orden)
  // es diferida y solo funciona si todos los cambios van juntos.
  await supabase.rpc('compactar_mis_fotos');

  if (foto.storage_path) {
    await supabase.storage.from('profile-photos').remove([foto.storage_path]);
  }
}

/** Deja las fotos en el orden en que vienen. La primera pasa a ser la de perfil. */
export async function guardarOrden(fotos: FotoPerfil[]): Promise<void> {
  const { error } = await supabase.rpc('reordenar_mis_fotos', { p_ids: fotos.map((f) => f.id) });
  if (error) throw error;
}

/** Mueve una foto a la primera posicion, que es la que se usa como foto de perfil. */
export function moverAlFrente(fotos: FotoPerfil[], id: string): FotoPerfil[] {
  const elegida = fotos.find((f) => f.id === id);
  if (!elegida) return fotos;
  return [elegida, ...fotos.filter((f) => f.id !== id)];
}

export { FotoVaciaError };
