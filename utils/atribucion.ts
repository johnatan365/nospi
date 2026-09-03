import { Platform } from 'react-native';

// Atribucion de canal, compartida por TODAS las rutas que crean un perfil.
//
// El script de public/index.html guarda en localStorage de donde llego el
// visitante en su PRIMERA visita (utm_source, ttclid/fbclid, referrer y la
// marca de la puerta 2). Estas funciones leen ese blob al crear el perfil.
//
// Por que vive aca y no dentro de app/index.tsx: el 3 de septiembre de 2026 se
// descubrio que habia TRES rutas que crean usuarios —app/index.tsx y las dos
// pantallas de perfil, que crean un perfil de rescate cuando alguien llega sin
// tenerlo— y solo la primera guardaba atribucion. Las otras dos dejaban
// utm_source en NULL y nunca marcaban solo_suscripcion. Con la funcion en un
// solo sitio, agregar una ruta nueva es acordarse de una linea, no de un
// archivo entero.
//
// REGLA: esto nunca debe devolver {}. Si lo hace, el usuario queda con
// utm_source NULL y desaparece del panel de Origen.

export interface Atribucion {
  utm_source: string;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  click_id: string | null;
  referrer: string | null;
  first_landing_at: string;
  solo_suscripcion: boolean;
}

function atribucionVacia(fuente: string): Atribucion {
  return {
    utm_source: fuente,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    click_id: null,
    referrer: null,
    first_landing_at: new Date().toISOString(),
    solo_suscripcion: false,
  };
}

export function leerAtribucion(): Atribucion {
  // En nativo no hay landing con parametros, asi que el script de
  // public/index.html nunca corre. Se etiqueta por tienda para al menos saber
  // que la persona entro por la app y no perderla en NULL.
  if (Platform.OS !== 'web') {
    return { ...atribucionVacia(Platform.OS === 'ios' ? 'app_ios' : 'app_android'), utm_medium: 'app' };
  }
  try {
    const raw = localStorage.getItem('nospi_attr');
    // El script de la landing SIEMPRE escribe algo (minimo 'directo'), asi que
    // si el blob no esta es que no corrio: navegadores internos de Instagram o
    // WhatsApp con storage particionado, modo privado, o storage limpiado entre
    // la visita y el registro. Se marca 'sin_captura' y no 'directo' para poder
    // separar "sabemos que llego directo" de "perdimos el dato".
    if (!raw) return atribucionVacia('sin_captura');
    const a = JSON.parse(raw);
    return {
      utm_source: a.utm_source || 'sin_captura',
      utm_medium: a.utm_medium || null,
      utm_campaign: a.utm_campaign || null,
      utm_content: a.utm_content || null,
      click_id: a.click_id || null,
      referrer: a.referrer || null,
      first_landing_at: a.first_landing_at || new Date().toISOString(),
      // PUERTA 2: marca de que entro por /?plan=sub. Ver PUERTA-2.md.
      solo_suscripcion: a.solo_suscripcion === true,
    };
  } catch (e) {
    return atribucionVacia('sin_captura');
  }
}
