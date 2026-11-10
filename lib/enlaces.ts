/**
 * lib/enlaces.ts
 *
 * Guarda el ultimo deep link que recibio la app, desde el instante en que se
 * importa este archivo (o sea, desde el arranque), y no desde que se monta la
 * pantalla que lo necesita.
 *
 * POR QUE EXISTE (incidente del 10 de noviembre de 2026)
 *
 * app/auth/callback.tsx registraba Linking.addEventListener('url', ...) DENTRO
 * de su propio useEffect, es decir cuando la pantalla ya estaba montada. Eso
 * funciona si la app arranca en frio desde el enlace, porque ahi el enlace
 * tambien esta en getInitialURL(). Pero el caso normal de recuperar contrasena
 * es otro: la persona abre el correo con la app todavia viva en segundo plano.
 * Entonces el orden real es:
 *
 *   1. Android entrega el enlace a la app (evento 'url').
 *   2. expo-router lee la ruta y navega a /auth/callback.
 *   3. la pantalla se monta y registra su listener.
 *
 * El paso 1 ya ocurrio cuando llega el paso 3: el evento se perdio. Y
 * getInitialURL() devuelve el enlace del arranque en frio, que no es el del
 * correo. La pantalla se quedaba esperando un enlace que nunca iba a llegar y
 * a los 10 segundos salia al login.
 *
 * Eso es exactamente lo que registro la tabla errores_app en las cuatro
 * pruebas de Android del 10 de noviembre: 'monto la pantalla' y, diez segundos
 * despues, 'me quede atascado 10s, salgo al login'. Nunca 'voy a
 * reset-password'.
 *
 * Este modulo se importa desde app/_layout.tsx, que es lo primero que corre.
 * El listener queda puesto antes de cualquier navegacion y no se quita nunca:
 * dura lo que dura la app. Cuando la pantalla por fin se monta, el enlace ya
 * esta guardado aqui esperandola.
 *
 * El enlace trae el token de recuperacion. NO se escribe en ningun log ni en
 * errores_app: lo unico que se reporta en las migas son los NOMBRES de los
 * parametros que llegaron, nunca sus valores.
 */

import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

let ultimoEnlace: string | null = null;
const oyentes = new Set<(url: string) => void>();

function guardar(url: string | null | undefined) {
  if (!url) return;
  ultimoEnlace = url;
  for (const oyente of Array.from(oyentes)) {
    try {
      oyente(url);
    } catch {
      // Un oyente que falla no puede tumbar la entrega a los demas.
    }
  }
}

if (Platform.OS !== 'web') {
  Linking.getInitialURL()
    .then((url) => guardar(url))
    .catch(() => {});
  Linking.addEventListener('url', ({ url }) => guardar(url));
}

/** El ultimo enlace recibido, o null si no ha llegado ninguno. */
export function ultimoEnlaceRecibido(): string | null {
  return ultimoEnlace;
}

/**
 * Se suscribe a los enlaces que lleguen. Si ya hay uno guardado, lo entrega de
 * una (en el siguiente tick, para no llamar al oyente durante el render).
 * Devuelve la funcion para desuscribirse.
 */
export function alRecibirEnlace(fn: (url: string) => void): () => void {
  oyentes.add(fn);
  const pendiente = ultimoEnlace;
  if (pendiente) setTimeout(() => fn(pendiente), 0);
  return () => {
    oyentes.delete(fn);
  };
}

/**
 * Borra el enlace guardado, una vez procesado. Importante: sin esto, un enlace
 * de recuperacion viejo se volveria a entregar la proxima vez que alguien
 * aterrice en /auth/callback por otro motivo (por ejemplo un login con Google)
 * y lo mandaria a poner una contrasena nueva sin haberlo pedido.
 */
export function olvidarUltimoEnlace(): void {
  ultimoEnlace = null;
}
