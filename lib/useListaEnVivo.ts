// Quien esta en linea y quien esta escribiendo, para la LISTA de chats.
//
// Dentro de un chat esto sale gratis: el canal ya esta abierto. En la lista no,
// porque no hay ningun chat abierto -- hay que escuchar el canal de cada
// conversacion.
//
// Tres cosas lo mantienen barato:
//
//   · Solo las conversaciones que se le pasan (las visibles), no todas.
//   · Se suscribe al ENTRAR a la pestaña y se suelta al salir. Nada queda
//     escuchando en el fondo.
//   · Reusa el mismo canal por conversacion que usa la pantalla del chat
//     (`chat_thread_<id>`), no inventa uno nuevo.
//
// Sobre el choque de canales: cuando se abre un chat, esa pantalla se queda con
// el canal de su conversacion y descarta el que tuviera la lista. No importa --
// en ese momento la lista no se esta viendo--, y al volver, el efecto de foco
// se vuelve a suscribir.
//
// OJO con lo que esto NO puede hacer: solo avisa con la app abierta en la
// pestaña de chats. Si esta cerrada no hay forma de saber que alguien escribe,
// y no deberia haberla: exigiria una notificacion por cada tecla.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from './supabase';
import {
  anuncioDePresencia, canalDeConversacion, canalDeEvento, idsPresentes,
  type AnuncioDePresencia,
} from './presencia';

/** Cuanto vale un aviso de "escribiendo" sin refrescarse. Igual que en el chat. */
const ESCRIBIENDO_VIVE_MS = 4000;

export interface QuienEscribe {
  nombre: string;
  ts: number;
}

export function useListaEnVivo(
  conversationIds: string[],
  miId: string | null | undefined,
  /** `null` mientras no se sepa: ver useMiPrivacidad. */
  mostrarEnLinea: boolean | null,
) {
  const [enLinea, setEnLinea] = useState<Record<string, string[]>>({});
  const [escribiendo, setEscribiendo] = useState<Record<string, Record<string, QuienEscribe>>>({});
  // Para que el aviso caduque solo: sin esto se quedaria pegado cuando alguien
  // cierra la app a mitad de una palabra, porque nadie manda un "ya pare".
  const [ahora, setAhora] = useState(Date.now());

  // La lista de ids cambia de identidad en cada render aunque tenga lo mismo.
  // Se compara por contenido para no rehacer las suscripciones a cada rato.
  const clave = conversationIds.slice().sort().join(',');

  const mostrarRef = useRef(mostrarEnLinea);
  mostrarRef.current = mostrarEnLinea;

  // Un anuncio por canal, para poder ponerlos al dia cuando llegue el ajuste.
  const anunciosRef = useRef<AnuncioDePresencia[]>([]);

  const suscribir = useCallback(() => {
    if (!miId || conversationIds.length === 0) return () => {};

    const anuncios: AnuncioDePresencia[] = [];

    const canales = conversationIds.map((id) => {
      const nombre = canalDeConversacion(id);
      // Si la pantalla del chat dejo uno colgado con este nombre, se descarta:
      // dos canales con el mismo tema se pisan.
      const viejo = supabase.getChannels().find((c) => c.topic === `realtime:${nombre}`);
      if (viejo) supabase.removeChannel(viejo);

      const canal = supabase
        .channel(nombre)
        .on('presence', { event: 'sync' }, () => {
          if (!mostrarRef.current) { setEnLinea((p) => ({ ...p, [id]: [] })); return; }
          setEnLinea((p) => ({ ...p, [id]: idsPresentes(canal.presenceState() as any, miId) }));
        })
        .on('broadcast', { event: 'escribiendo' }, ({ payload }) => {
          const q = payload as { user_id?: string; nombre?: string };
          if (!q?.user_id || q.user_id === miId) return;   // lo propio no cuenta
          setEscribiendo((p) => ({
            ...p,
            [id]: { ...(p[id] || {}), [q.user_id!]: { nombre: q.nombre || 'Alguien', ts: Date.now() } },
          }));
        });

      // Antes del subscribe, para que no haya un hueco en el que 'SUBSCRIBED'
      // llegue sin nadie escuchando.
      const anuncio = anuncioDePresencia(canal, miId);
      anuncio.alSaberElAjuste(mostrarRef.current);
      anuncios.push(anuncio);

      // El anuncio decide si toca anunciarse: puede que el ajuste todavia no
      // haya llegado, y en ese caso espera a saberlo.
      canal.subscribe((estado) => {
        if (estado === 'SUBSCRIBED') anuncio.alSuscribirse();
      });

      return canal;
    });

    anunciosRef.current = anuncios;

    return () => {
      anunciosRef.current = [];
      for (const c of canales) supabase.removeChannel(c);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, miId]);

  // Cuando llega el ajuste --o cuando se cambia con la app abierta-- hay que
  // ponerse al dia: el canal pudo suscribirse antes de saberlo.
  useEffect(() => {
    for (const a of anunciosRef.current) a.alSaberElAjuste(mostrarEnLinea);
  }, [mostrarEnLinea]);

  // Solo mientras la pestaña esta a la vista.
  useFocusEffect(
    useCallback(() => {
      const soltar = suscribir();
      return soltar;
    }, [suscribir]),
  );

  // Un reloj lento, y solo mientras haya alguien escribiendo en alguna parte.
  useEffect(() => {
    const hayAlguien = Object.values(escribiendo).some((m) => Object.keys(m || {}).length > 0);
    if (!hayAlguien) return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [escribiendo]);

  /** Quien esta escribiendo AHORA en esa conversacion, ya filtrado por caducidad. */
  const escribiendoEn = (conversationId: string): QuienEscribe[] =>
    Object.values(escribiendo[conversationId] || {})
      .filter((e) => ahora - e.ts < ESCRIBIENDO_VIVE_MS);

  /** Cuantos de esa conversacion estan conectados, sin contarme. */
  const enLineaEn = (conversationId: string): number =>
    mostrarEnLinea ? (enLinea[conversationId] || []).length : 0;

  return { escribiendoEn, enLineaEn };
}

/**
 * El texto para la fila de la lista.
 *
 * En un privado basta "escribiendo": ya se sabe quien es por la fila. En un
 * grupo hace falta el nombre, que es el dato que de verdad falta.
 */
export function textoEscribiendoEnLista(quienes: QuienEscribe[], esGrupal: boolean): string {
  if (quienes.length === 0) return '';
  if (!esGrupal) return 'escribiendo';
  if (quienes.length === 1) return `${quienes[0].nombre} está escribiendo`;
  if (quienes.length === 2) return `${quienes[0].nombre} y ${quienes[1].nombre} están escribiendo`;
  return `${quienes.length} escribiendo`;
}

/**
 * Quien tiene la app abierta en un evento, para la sala de la videollamada.
 *
 * Mas simple que el de la lista: un solo canal, sin "escribiendo", y se suelta
 * al desmontar la pantalla.
 */
export function usePresenciaEvento(
  eventId: string | null | undefined,
  miId: string | null | undefined,
  /** `null` mientras no se sepa: ver useMiPrivacidad. */
  mostrarEnLinea: boolean | null,
) {
  const [ids, setIds] = useState<string[]>([]);
  const mostrarRef = useRef(mostrarEnLinea);
  mostrarRef.current = mostrarEnLinea;
  const anuncioRef = useRef<AnuncioDePresencia | null>(null);

  useEffect(() => {
    if (!eventId || !miId) { setIds([]); return; }
    const nombre = canalDeEvento(eventId);
    const viejo = supabase.getChannels().find((c) => c.topic === `realtime:${nombre}`);
    if (viejo) supabase.removeChannel(viejo);

    const canal = supabase
      .channel(nombre)
      .on('presence', { event: 'sync' }, () => {
        if (!mostrarRef.current) { setIds([]); return; }
        setIds(idsPresentes(canal.presenceState() as any, miId));
      });

    const anuncio = anuncioDePresencia(canal, miId);
    anuncio.alSaberElAjuste(mostrarRef.current);
    anuncioRef.current = anuncio;

    canal.subscribe((estado) => {
      if (estado === 'SUBSCRIBED') anuncio.alSuscribirse();
    });

    return () => {
      anuncioRef.current = null;
      supabase.removeChannel(canal);
    };
  }, [eventId, miId]);

  // Igual que en la lista: el ajuste puede llegar despues del subscribe.
  useEffect(() => {
    anuncioRef.current?.alSaberElAjuste(mostrarEnLinea);
  }, [mostrarEnLinea]);

  return ids;
}
