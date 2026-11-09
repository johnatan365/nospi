// Rastro de pasos y errores de la app.
//
// Por que existe: el 8 de noviembre de 2026 una persona reporto que la
// pantalla de recuperar contrasena se quedaba en negro en Android. Los logs
// del servidor mostraban que el correo SI se enviaba — tres veces, porque ella
// no veia confirmacion y volvia a intentar. Pero del lado del celular no
// quedaba ningun rastro: no era un crash de React (el ErrorBoundary habria
// mostrado su pantalla), asi que no habia nada que leer y se termino
// arreglando a ciegas, publicando por OTA un cambio que no servia.
//
// Esto deja migas: "llegue aqui", "hice esto", "pinte lo otro". Si el rastro
// se corta en un paso concreto, ahi esta el problema, sin adivinar.
//
// Reglas de esta funcion:
//   - NUNCA lanza. Es instrumentacion: si falla, no puede romper la pantalla
//     que esta intentando diagnosticar.
//   - NUNCA espera. Se dispara y sigue, para no meter latencia en la UI.
//   - No guarda nada que la persona escribio (ni correos, ni contrasenas).

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

type Tipo = 'rastro' | 'error';

function versionApp(): string {
  return String(Constants.expoConfig?.version || 'desconocida');
}

function versionSO(): string {
  return `${Platform.OS} ${String(Platform.Version ?? '')}`.trim();
}

function enviar(tipo: Tipo, pantalla: string, mensaje: string, extra?: Record<string, unknown>, stack?: string) {
  try {
    void supabase
      .from('errores_app')
      .insert({
        tipo,
        pantalla,
        mensaje,
        stack: stack ?? null,
        plataforma: Platform.OS,
        version_app: versionApp(),
        version_so: versionSO(),
        extra: extra ?? null,
      })
      .then(() => {}, () => {});
  } catch {
    // Si ni siquiera se pudo armar la peticion, se ignora: esto jamas debe
    // tumbar la pantalla.
  }
}

/** Una miga: "pase por aqui". El mensaje es el nombre del paso. */
export function dejarRastro(pantalla: string, paso: string, extra?: Record<string, unknown>) {
  enviar('rastro', pantalla, paso, extra);
  if (__DEV__) console.log(`[rastro] ${pantalla} :: ${paso}`, extra ?? '');
}

/** Un error que se atrapo y no tumbo la app, pero que hay que mirar. */
export function reportarError(pantalla: string, error: unknown, extra?: Record<string, unknown>) {
  const e = error as { message?: string; stack?: string } | undefined;
  const mensaje = e?.message || String(error) || 'Error sin mensaje';
  enviar('error', pantalla, mensaje, extra, e?.stack);
  if (__DEV__) console.error(`[rastro:error] ${pantalla} ::`, error);
}
