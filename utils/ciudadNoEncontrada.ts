import { supabase } from '@/lib/supabase';
import { normalizarTexto } from '@/constants/Ciudades';

// Cuando alguien busca su ciudad y no aparece nada, ese texto es el dato mas
// util que tenemos para decidir donde abrir: si veinte personas escriben el
// mismo municipio, ahi hay gente esperando. Vale mas que tener 1.122
// municipios listados sin un solo evento.
//
// Se guarda unicamente lo que escribieron. Nada identificable, y nunca bloquea
// ni demora la pantalla: si la red falla, se ignora en silencio.

// Para no guardar veinte filas de la misma persona mientras escribe letra por
// letra ("m", "me", "med"...). Vive en memoria y se pierde al cerrar la app,
// que es justo lo que queremos.
const yaRegistradas = new Set<string>();

export async function registrarCiudadNoEncontrada(
  texto: string,
  contexto: 'registro' | 'perfil' | 'eventos' = 'registro',
  userId?: string | null,
): Promise<void> {
  try {
    const limpio = String(texto || '').trim();
    // Menos de 3 letras casi siempre es alguien a mitad de escribir.
    if (limpio.length < 3 || limpio.length > 60) return;

    const normalizado = normalizarTexto(limpio);
    const llave = `${contexto}:${normalizado}`;
    if (yaRegistradas.has(llave)) return;
    yaRegistradas.add(llave);

    const { error } = await supabase.from('city_search_misses').insert({
      texto: limpio,
      texto_normalizado: normalizado,
      contexto,
      user_id: userId || null,
    });

    if (error) {
      console.log('No se pudo registrar la ciudad no encontrada:', error.message);
    }
  } catch (e) {
    // A proposito: esto nunca puede romper el registro de alguien.
    console.log('No se pudo registrar la ciudad no encontrada');
  }
}
