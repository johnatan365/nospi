import { Linking, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

// Abre la videollamada de un evento virtual sin sacar a la persona de Nospi.
//
// - App (iOS/Android): Linking abre la app de Meet; Nospi queda detrás y Meet
//   sigue en una ventanita al volver.
// - Web en el celular: si se abre en una pestaña nueva, el celular salta a la
//   app de Meet y al volver al navegador lo que se ve es esa pestaña en blanco.
//   Por eso se navega en la MISMA pestaña: el enlace de Meet es un enlace
//   universal, el sistema abre la app y la página de Nospi se queda como estaba.
// - Web en computador: pestaña nueva, y Nospi sigue abierto en la suya.
//
// En la web del celular no se puede saber si la persona tiene la app de Meet:
// se le pregunta una vez (debePreguntarMeet) y se guarda la respuesta. Si NO la
// tiene, el Meet se abre en otra pestaña para que Nospi no se pierda.
const CLAVE_TIENE_MEET = 'nospi_tiene_meet';

function esWebCelular(): boolean {
  return Platform.OS === 'web' && typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

function leerTieneMeet(): string | null {
  try { return typeof localStorage !== 'undefined' ? localStorage.getItem(CLAVE_TIENE_MEET) : null; } catch { return null; }
}

export function debePreguntarMeet(): boolean {
  return esWebCelular() && !leerTieneMeet();
}

export function guardarTieneMeet(tiene: boolean): void {
  try { localStorage.setItem(CLAVE_TIENE_MEET, tiene ? 'si' : 'no'); } catch { /* sin almacenamiento: se vuelve a preguntar */ }
}

export async function abrirMeet(link: string): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (esWebCelular() && leerTieneMeet() !== 'no') {
      window.location.href = link;
    } else {
      window.open(link, '_blank', 'noopener');
    }
    return;
  }
  await Linking.openURL(link);
}

// El enlace puede no venir en el objeto del evento (p. ej. una caché guardada
// antes de que existiera la columna): en ese caso se lee directo de la base.
export async function obtenerMeetLink(eventId: string, actual?: string | null): Promise<string | null> {
  if (actual) return actual;
  const { data } = await supabase.from('events').select('meet_link').eq('id', eventId).maybeSingle();
  return (data as any)?.meet_link || null;
}
