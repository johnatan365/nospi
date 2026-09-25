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
// Si en el celular no tiene la app de Meet, el propio enlace de Google decide:
// lo manda a instalarla o lo deja entrar desde el navegador. Nospi no pregunta.

function esWebCelular(): boolean {
  return Platform.OS === 'web' && typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

export async function abrirMeet(link: string): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (esWebCelular()) {
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
