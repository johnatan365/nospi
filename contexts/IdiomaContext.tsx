// Provee el idioma activo a toda la app.
//
// Como decide el idioma:
//   1. Si la persona lo cambio a mano alguna vez, se respeta esa eleccion.
//   2. Si no, se usa el idioma del celular o del navegador.
//   3. Si nada de eso sirve, español.
//
// Un gringo con el telefono en ingles abre Nospi y la ve en ingles sin tocar
// nada. No hay que pedirle que escoja.

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Idioma,
  IDIOMA_POR_DEFECTO,
  CLAVE_IDIOMA_GUARDADO,
  detectarIdioma,
  traducir,
} from '@/lib/i18n';
import { TEXTOS } from '@/constants/Textos';

interface IdiomaContextValue {
  idioma: Idioma;
  /** true mientras se lee la eleccion guardada; la app ya se puede pintar igual. */
  cargando: boolean;
  /** true si el idioma salio del dispositivo y no de una eleccion manual. */
  esAutomatico: boolean;
  cambiarIdioma: (nuevo: Idioma) => Promise<void>;
  /** Traduce una clave del diccionario. t('login.entrar') */
  t: (clave: string, vars?: Record<string, string | number>) => string;
}

const IdiomaContext = createContext<IdiomaContextValue>({
  idioma: IDIOMA_POR_DEFECTO,
  cargando: true,
  esAutomatico: true,
  cambiarIdioma: async () => {},
  t: (clave) => clave,
});

export function IdiomaProvider({ children }: { children: React.ReactNode }) {
  // Arrancamos ya con el idioma del dispositivo para que la primera pantalla
  // salga bien pintada; si hay una eleccion guardada, se corrige enseguida.
  const [idioma, setIdioma] = useState<Idioma>(() => detectarIdioma());
  const [esAutomatico, setEsAutomatico] = useState(true);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const guardado = await AsyncStorage.getItem(CLAVE_IDIOMA_GUARDADO);
        if (vivo && (guardado === 'es' || guardado === 'en')) {
          setIdioma(guardado);
          setEsAutomatico(false);
        }
      } catch {
        // Si AsyncStorage falla nos quedamos con el idioma detectado. No es
        // motivo para dejar a nadie sin app.
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const cambiarIdioma = useCallback(async (nuevo: Idioma) => {
    setIdioma(nuevo);
    setEsAutomatico(false);
    try {
      await AsyncStorage.setItem(CLAVE_IDIOMA_GUARDADO, nuevo);
    } catch {}
  }, []);

  const t = useCallback(
    (clave: string, vars?: Record<string, string | number>) =>
      traducir(TEXTOS, idioma, clave, vars),
    [idioma]
  );

  const valor = useMemo(
    () => ({ idioma, cargando, esAutomatico, cambiarIdioma, t }),
    [idioma, cargando, esAutomatico, cambiarIdioma, t]
  );

  return <IdiomaContext.Provider value={valor}>{children}</IdiomaContext.Provider>;
}

export function useIdioma() {
  return useContext(IdiomaContext);
}

/** Atajo para pantallas que solo necesitan traducir. */
export function useT() {
  return useContext(IdiomaContext).t;
}
