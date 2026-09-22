import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { nospiColors } from '@/constants/Colors';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

// Hombres dormidos: los hombres que ya se registraron y nunca reservaron.
//
// El desbalance de los eventos se venia atacando comprando mas hombres en Meta.
// Al medir el embudo real se ve que el cuello no esta ahi: los hombres se
// registran igual que las mujeres, pero llegan a la pasarela la mitad de las
// veces. Hay mas de mil hombres ya pagados que nunca estrenaron. Este panel los
// pone en orden de probabilidad de reservar y deja escribirles uno por uno por
// WhatsApp, sin hojas de calculo y sin volver a pagarle a Meta por ellos.

interface Hombre {
  user_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  age: number | null;
  created_at: string;
  tiene_app: boolean;
  intento_fallido: boolean;
  onboarding_completed: boolean | null;
  ultima_invitacion: string | null;
  ultimo_resultado: string | null;
  tasa_edad: number;
  prioridad: number;
}
interface EventoBrecha {
  event_id: string;
  name: string | null;
  fecha: string;
  type: string | null;
  max_participants: number | null;
  hombres: number;
  mujeres: number;
}
interface Kpis {
  hombres_sin_reserva: number;
  contactables: number;
  ya_contactados_30d: number;
  brecha_proximos_eventos: number;
}

type Filtro = 'todos' | 'mayores' | 'intento' | 'conapp';
type Tono = 'directo' | 'suave' | 'pago';

function fechaCorta(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', timeZone: 'America/Bogota' });
  } catch { return iso; }
}
function fechaLarga(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Bogota' });
  } catch { return iso; }
}
function primerNombre(name?: string | null): string {
  const n = (name || '').trim().split(' ')[0];
  if (!n) return 'ahí';
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}
function faltanHombres(e: EventoBrecha): number {
  return Math.max(0, e.mujeres - e.hombres);
}

// El mensaje va firmado en primera persona y sin prometer cuanta gente habra ni
// como queda repartido el grupo: esa promesa se incumple sola y genera reclamos.
function armarMensaje(h: Hombre, evento: EventoBrecha | null, tono: Tono): string {
  const nombre = primerNombre(h.name);
  const cuando = evento ? fechaLarga(evento.fecha) : '';
  const que = evento?.name?.trim() || 'el próximo plan';
  // Mandar al detalle del evento en vez de a la home: convierte mejor y dispara
  // el ViewContent del pixel.
  const link = evento
    ? `https://app.nospi.co/event-details/${evento.event_id}`
    : 'https://nospi.co/wa';

  if (tono === 'pago') {
    return [
      `Hola ${nombre}, soy Johnatan de Nospi 👋`,
      ``,
      `Vi que alcanzaste a intentar la reserva y el pago no pasó. No sé si fue la tarjeta o la pasarela, pero no quería dejarlo así.`,
      ``,
      evento ? `Tenemos *${que}* el ${cuando} y todavía hay campo.` : `Tenemos planes esta semana y todavía hay campo.`,
      `Son $15.000 y quedas dentro: ${link}`,
      ``,
      `Si te vuelve a fallar me escribes por aquí y lo resolvemos de una.`,
    ].join('\n');
  }

  if (tono === 'suave') {
    return [
      `Hola ${nombre}, soy Johnatan de Nospi 👋`,
      ``,
      `Te registraste hace un tiempo y nunca llegaste a estrenar. Te escribo por si todavía te interesa.`,
      ``,
      evento ? `*${que}* es el ${cuando}. Es sentarse con gente nueva, hombres y mujeres, y ya.` : `Esta semana tenemos planes para conocer gente nueva.`,
      `$15.000 y reservas acá: ${link}`,
      ``,
      `Si no es lo tuyo me dices y no te escribo más, sin problema.`,
    ].join('\n');
  }

  return [
    `Hola ${nombre}, soy Johnatan de Nospi 👋`,
    ``,
    `Te escribo directo: ${evento ? `para *${que}* del ${cuando}` : 'para los planes de esta semana'} me están faltando hombres.`,
    ``,
    `Es conocer gente nueva cara a cara, sin apps ni chats eternos. $15.000.`,
    `Te dejo el cupo acá: ${link}`,
    ``,
    `¿Te animas?`,
  ].join('\n');
}

export default function HombresDormidosScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [kpis, setKpis] = useState<Kpis>({ hombres_sin_reserva: 0, contactables: 0, ya_contactados_30d: 0, brecha_proximos_eventos: 0 });
  const [hombres, setHombres] = useState<Hombre[]>([]);
  const [eventos, setEventos] = useState<EventoBrecha[]>([]);
  const [eventoSel, setEventoSel] = useState<string | null>(null);
  const [tono, setTono] = useState<Tono>('directo');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busy, setBusy] = useState<string | null>(null);
  const [escritos, setEscritos] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data, error } = await supabase.rpc('admin_hombres_dormidos', { p_limit: 300 });
      if (error) throw error;
      const payload = (data || {}) as any;
      setKpis(payload.kpis || { hombres_sin_reserva: 0, contactables: 0, ya_contactados_30d: 0, brecha_proximos_eventos: 0 });
      setHombres(Array.isArray(payload.hombres) ? payload.hombres : []);
      const evs: EventoBrecha[] = Array.isArray(payload.eventos) ? payload.eventos : [];
      setEventos(evs);
      // Preseleccionar el evento que mas hombres necesita: es el que justifica
      // la llamada.
      if (evs.length > 0) {
        const peor = [...evs].sort((a, b) => faltanHombres(b) - faltanHombres(a))[0];
        setEventoSel((prev) => prev ?? (faltanHombres(peor) > 0 ? peor.event_id : evs[0].event_id));
      }
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar la lista');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const evento = useMemo(
    () => eventos.find((e) => e.event_id === eventoSel) || null,
    [eventos, eventoSel]
  );

  const filtrados = useMemo(() => hombres.filter((h) => {
    if (filtro === 'mayores') return (h.age ?? 0) >= 45;
    if (filtro === 'intento') return h.intento_fallido;
    if (filtro === 'conapp') return h.tiene_app;
    return true;
  }), [hombres, filtro]);

  const registrar = async (h: Hombre, resultado: string, opts?: { noInvitarMas?: boolean; reintentarDias?: number }) => {
    setBusy(h.user_id);
    try {
      const reintentar = opts?.reintentarDias
        ? new Date(Date.now() + opts.reintentarDias * 86400000).toISOString().slice(0, 10)
        : null;
      const { error } = await supabase.rpc('admin_registrar_invitacion_hombre', {
        p_user_id: h.user_id,
        p_resultado: resultado,
        p_evento: evento?.name || null,
        p_notas: null,
        p_reintentar_despues: reintentar,
        p_no_invitar_mas: !!opts?.noInvitarMas,
      });
      if (error) throw error;
      // Sale de la lista al instante: la idea es bajar la lista una sola vez.
      setHombres((prev) => prev.filter((x) => x.user_id !== h.user_id));
    } catch (e: any) {
      window.alert('Error: ' + (e?.message || 'no se pudo registrar'));
    } finally { setBusy(null); }
  };

  const escribir = (h: Hombre) => {
    const digits = (h.phone || '').replace(/\D/g, '');
    if (!digits) { window.alert('Esta persona no tiene teléfono'); return; }
    const texto = armarMensaje(h, evento, tono);
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(texto)}`, '_blank');
    setEscritos((prev) => new Set(prev).add(h.user_id));
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
      <TouchableOpacity onPress={() => router.push('/admin')} style={styles.backLink}>
        <Text style={styles.backLinkText}>‹ Volver al panel</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Hombres dormidos</Text>
      <Text style={styles.subtitle}>
        Hombres que ya se registraron y nunca reservaron. Ya están pagados: escribirles cuesta cero.
        La lista está ordenada por probabilidad real de reservar, medida sobre los registros desde julio.
      </Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={nospiColors.primary} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <>
          <View style={styles.kpiRow}>
            <View style={styles.kpi}>
              <Text style={styles.kpiNum}>{kpis.hombres_sin_reserva}</Text>
              <Text style={styles.kpiLabel}>hombres sin reservar nunca</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiNum}>{kpis.contactables}</Text>
              <Text style={styles.kpiLabel}>contactables hoy</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiNum}>{kpis.brecha_proximos_eventos}</Text>
              <Text style={styles.kpiLabel}>hombres que faltan en los próximos eventos</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiNum}>{escritos.size}</Text>
              <Text style={styles.kpiLabel}>escritos en esta sesión</Text>
            </View>
          </View>

          <Text style={styles.section}>1. ¿Para cuál evento?</Text>
          <View style={styles.chipRow}>
            {eventos.map((e) => {
              const faltan = faltanHombres(e);
              const sel = e.event_id === eventoSel;
              return (
                <TouchableOpacity
                  key={e.event_id}
                  onPress={() => setEventoSel(e.event_id)}
                  style={[styles.chip, sel && styles.chipOn]}
                >
                  <Text style={[styles.chipText, sel && styles.chipTextOn]}>
                    {e.name || 'Evento'} · {fechaCorta(e.fecha)}
                  </Text>
                  <Text style={[styles.chipSub, sel && styles.chipTextOn]}>
                    {e.hombres}H / {e.mujeres}M{faltan > 0 ? ` · faltan ${faltan}` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {eventos.length === 0 && <Text style={styles.muted}>No hay eventos publicados próximos.</Text>}
          </View>

          <Text style={styles.section}>2. ¿Con qué tono?</Text>
          <View style={styles.chipRow}>
            {([
              ['directo', 'Directo — "me faltan hombres"'],
              ['suave', 'Suave — "nunca estrenaste"'],
              ['pago', 'Pago fallido — "el pago no pasó"'],
            ] as [Tono, string][]).map(([k, label]) => (
              <TouchableOpacity key={k} onPress={() => setTono(k)} style={[styles.chip, tono === k && styles.chipOn]}>
                <Text style={[styles.chipText, tono === k && styles.chipTextOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.section}>3. A quién</Text>
          <View style={styles.chipRow}>
            {([
              ['todos', `Todos (${hombres.length})`],
              ['mayores', `45 años o más (${hombres.filter((h) => (h.age ?? 0) >= 45).length})`],
              ['intento', `Intentaron pagar y falló (${hombres.filter((h) => h.intento_fallido).length})`],
              ['conapp', `Tienen la app (${hombres.filter((h) => h.tiene_app).length})`],
            ] as [Filtro, string][]).map(([k, label]) => (
              <TouchableOpacity key={k} onPress={() => setFiltro(k)} style={[styles.chip, filtro === k && styles.chipOn]}>
                <Text style={[styles.chipText, filtro === k && styles.chipTextOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.hint}>
            Ojo con el tono «Pago fallido»: úsalo solo con el filtro de los que intentaron pagar,
            si no le vas a decir a alguien que le falló un pago que nunca hizo.
          </Text>

          <View style={styles.preview}>
            <Text style={styles.previewTitle}>Así queda el mensaje</Text>
            <Text style={styles.previewText}>
              {filtrados[0] ? armarMensaje(filtrados[0], evento, tono) : 'No hay nadie en este filtro.'}
            </Text>
          </View>

          {filtrados.map((h) => {
            const yaEscrito = escritos.has(h.user_id);
            return (
              <View key={h.user_id} style={[styles.row, yaEscrito && styles.rowDone]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>
                    {h.name || 'Sin nombre'} {h.age ? <Text style={styles.age}>· {h.age} años</Text> : null}
                  </Text>
                  <Text style={styles.meta}>
                    Se registró el {fechaCorta(h.created_at)} · reserva estimada {h.tasa_edad}%
                  </Text>
                  <View style={styles.badges}>
                    {h.intento_fallido && <Text style={[styles.badge, styles.badgeHot]}>intentó pagar</Text>}
                    {h.tiene_app && <Text style={styles.badge}>tiene la app</Text>}
                    {h.onboarding_completed && <Text style={styles.badge}>perfil completo</Text>}
                  </View>
                </View>

                <View style={styles.actions}>
                  <TouchableOpacity onPress={() => escribir(h)} style={styles.waBtn} disabled={busy === h.user_id}>
                    <Text style={styles.waBtnText}>{yaEscrito ? 'Escribir otra vez' : 'WhatsApp'}</Text>
                  </TouchableOpacity>
                  {yaEscrito && (
                    <View style={styles.followRow}>
                      <TouchableOpacity onPress={() => registrar(h, 'acepto')} style={styles.mini} disabled={busy === h.user_id}>
                        <Text style={styles.miniText}>Dijo que sí</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => registrar(h, 'sin_respuesta')} style={styles.mini} disabled={busy === h.user_id}>
                        <Text style={styles.miniText}>Sin respuesta</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => registrar(h, 'rechazo_temporal', { reintentarDias: 30 })} style={styles.mini} disabled={busy === h.user_id}>
                        <Text style={styles.miniText}>Después</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => registrar(h, 'rechazo_directo', { noInvitarMas: true })} style={[styles.mini, styles.miniNo]} disabled={busy === h.user_id}>
                        <Text style={styles.miniText}>No insistir</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );
          })}

          {filtrados.length === 0 && <Text style={styles.muted}>No queda nadie por contactar con este filtro.</Text>}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f7f7fa' },
  backLink: { marginBottom: 12 },
  backLinkText: { color: nospiColors.primary, fontSize: 14, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: '800', color: '#1a1a1a' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 6, marginBottom: 18, lineHeight: 20, maxWidth: 760 },
  error: { color: '#c0392b', marginTop: 20 },
  muted: { color: '#888', fontSize: 14, marginTop: 10 },
  hint: { color: '#8a6d3b', backgroundColor: '#fcf8e3', borderRadius: 8, padding: 10, fontSize: 13, marginTop: 10, maxWidth: 760 },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  kpi: { backgroundColor: '#fff', borderRadius: 12, padding: 16, minWidth: 170, flexGrow: 1 },
  kpiNum: { fontSize: 28, fontWeight: '800', color: nospiColors.primary },
  kpiLabel: { fontSize: 12, color: '#666', marginTop: 4 },
  section: { fontSize: 15, fontWeight: '700', color: '#333', marginTop: 16, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#fff', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: '#e0e0e6' },
  chipOn: { backgroundColor: nospiColors.primary, borderColor: nospiColors.primary },
  chipText: { fontSize: 13, color: '#333', fontWeight: '600' },
  chipSub: { fontSize: 11, color: '#777', marginTop: 2 },
  chipTextOn: { color: '#fff' },
  preview: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginTop: 18, marginBottom: 18, borderLeftWidth: 4, borderLeftColor: nospiColors.primary },
  previewTitle: { fontSize: 12, fontWeight: '700', color: '#888', textTransform: 'uppercase', marginBottom: 8 },
  previewText: { fontSize: 14, color: '#222', lineHeight: 21, whiteSpace: 'pre-wrap' as any },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, gap: 12 },
  rowDone: { opacity: 0.7, borderLeftWidth: 4, borderLeftColor: '#25D366' },
  name: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  age: { fontSize: 13, fontWeight: '400', color: '#777' },
  meta: { fontSize: 12, color: '#777', marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  badge: { fontSize: 11, color: '#555', backgroundColor: '#eee', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 6 },
  badgeHot: { color: '#fff', backgroundColor: '#e67e22' },
  actions: { alignItems: 'flex-end', gap: 6 },
  waBtn: { backgroundColor: '#25D366', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 16 },
  waBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  followRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' },
  mini: { backgroundColor: '#f0f0f4', borderRadius: 6, paddingVertical: 5, paddingHorizontal: 9 },
  miniNo: { backgroundColor: '#fdecea' },
  miniText: { fontSize: 11, color: '#444', fontWeight: '600' },
});
