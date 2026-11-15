// Quien tiene suscripcion activa, para pintar la corona en el admin.
//
// El admin muestra personas en muchas listas (inscritos de un evento, En vivo,
// Usuarios, modales de WhatsApp, Reconciliacion, No-shows, Dividir...). Si cada
// lista preguntara por su cuenta serian decenas de consultas; en cambio se trae
// el conjunto entero UNA vez con get_active_subscribers_for_admin() y todas las
// pantallas lo comparten desde esta memoria.
//
// "Activa" es la misma condicion de has_active_subscription() en la base: la
// que decide si la app deja reservar con suscripcion. Ver la migracion
// 20261115120000_suscriptores_activos_para_el_admin.sql.
//
// Se refresca al volver a la pestana del navegador (con un minuto de margen
// para no martillar la base) y cuando alguien llama recargarSuscriptoresActivos()
// --por ejemplo al entrar a Suscripciones o despues de crear una a mano--.

import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export interface SuscripcionActiva {
  plan_type: string;
  end_date: string;
  auto_renew: boolean;
}

let mapa: Map<string, SuscripcionActiva> = new Map();
let cargadoEn = 0;
let enVuelo: Promise<void> | null = null;
const oyentes = new Set<() => void>();
const MARGEN_MS = 60_000;

function avisar() {
  oyentes.forEach((o) => {
    try { o(); } catch { /* un oyente roto no tumba a los demas */ }
  });
}

/** Trae el conjunto de nuevo. Sin `forzar`, no repite si se cargo hace menos de un minuto. */
export function recargarSuscriptoresActivos(forzar = true): Promise<void> {
  if (enVuelo) return enVuelo;
  if (!forzar && Date.now() - cargadoEn < MARGEN_MS) return Promise.resolve();
  enVuelo = (async () => {
    try {
      const { data, error } = await supabase.rpc('get_active_subscribers_for_admin');
      if (error) {
        // Sin permiso (no es admin) o sin red: se deja lo que habia. La corona
        // es una ayuda visual; nunca debe romper ni bloquear el panel.
        console.warn('[suscriptoresActivos] no se pudo cargar:', error.message);
        return;
      }
      const nuevo = new Map<string, SuscripcionActiva>();
      for (const fila of (data as any[]) || []) {
        if (fila?.user_id) {
          nuevo.set(fila.user_id, {
            plan_type: fila.plan_type,
            end_date: fila.end_date,
            auto_renew: !!fila.auto_renew,
          });
        }
      }
      mapa = nuevo;
      cargadoEn = Date.now();
      avisar();
    } finally {
      enVuelo = null;
    }
  })();
  return enVuelo;
}

let escuchandoFoco = false;
function escucharFoco() {
  if (escuchandoFoco || Platform.OS !== 'web' || typeof window === 'undefined') return;
  escuchandoFoco = true;
  window.addEventListener('focus', () => { recargarSuscriptoresActivos(false); });
}

function suscribir(o: () => void) {
  oyentes.add(o);
  escucharFoco();
  if (cargadoEn === 0) recargarSuscriptoresActivos(false);
  return () => { oyentes.delete(o); };
}

const leer = () => mapa;

/** Mapa user_id -> suscripcion activa. Se actualiza solo. */
export function useSuscriptoresActivos(): Map<string, SuscripcionActiva> {
  return useSyncExternalStore(suscribir, leer, leer);
}

const NOMBRE_PLAN: Record<string, string> = {
  '1_month': '1 mes',
  '3_months': '3 meses',
  '6_months': '6 meses',
};

/** Texto del tooltip: "Premium · plan 3 meses · vence 13 feb 2027 · no se renueva". */
export function describirSuscripcion(s: SuscripcionActiva): string {
  const plan = NOMBRE_PLAN[s.plan_type] || s.plan_type;
  let vence = '';
  try {
    vence = new Date(s.end_date).toLocaleDateString('es-CO', {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Bogota',
    });
  } catch { vence = ''; }
  return [
    'Premium',
    `plan ${plan}`,
    vence ? `vence ${vence}` : null,
    s.auto_renew ? 'se renueva sola' : 'no se renueva',
  ].filter(Boolean).join(' · ');
}
