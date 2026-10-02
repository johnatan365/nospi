import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
import { nospiColors } from '@/constants/Colors';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

interface StrikeDetail {
  id: string;
  strike_number: number;
  reason: string;
  created_at: string;
  waived: boolean;
  event_name: string | null;
  event_date: string | null;
}
interface UserRow {
  user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  reservas_suspendidas_hasta: string | null;
  active_strikes: number;
  total_strikes: number;
  last_strike_at: string | null;
  last_event_name: string | null;
  strikes: StrikeDetail[];
}
interface Kpis { no_shows_this_month: number; suspended_active: number; with_active_strike: number; }

function fmt(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Bogota' });
  } catch { return iso; }
}
function isSuspended(u: UserRow): boolean {
  return !!u.reservas_suspendidas_hasta && new Date(u.reservas_suspendidas_hasta).getTime() > Date.now();
}

export default function NoShowsScreen() {
  const router = useRouter();
  // En el celular la tabla de 6 columnas no cabe: cada columna queda con ~40px
  // y el texto se parte letra por letra. Debajo de 768 se muestran tarjetas.
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [kpis, setKpis] = useState<Kpis>({ no_shows_this_month: 0, suspended_active: 0, with_active_strike: 0 });
  const [users, setUsers] = useState<UserRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'suspended' | 'warned'>('all');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data, error } = await supabase.rpc('admin_no_show_report');
      if (error) throw error;
      const payload = (data || {}) as any;
      setKpis(payload.kpis || { no_shows_this_month: 0, suspended_active: 0, with_active_strike: 0 });
      setUsers(Array.isArray(payload.users) ? payload.users : []);
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar el informe');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const waive = async (strikeId: string) => {
    if (!(typeof window !== 'undefined' && window.confirm('¿Perdonar esta falta? Dejará de contar para la escala.'))) return;
    setBusy(strikeId);
    try {
      const { error } = await supabase.rpc('admin_waive_strike', { p_strike_id: strikeId });
      if (error) throw error;
      await load();
    } catch (e: any) {
      window.alert('Error: ' + (e?.message || 'no se pudo perdonar'));
    } finally { setBusy(null); }
  };

  const lift = async (userId: string) => {
    if (!(typeof window !== 'undefined' && window.confirm('¿Levantar la suspensión de este usuario? Podrá reservar de inmediato.'))) return;
    setBusy(userId);
    try {
      const { error } = await supabase.rpc('admin_lift_suspension', { p_user_id: userId });
      if (error) throw error;
      await load();
    } catch (e: any) {
      window.alert('Error: ' + (e?.message || 'no se pudo levantar la suspensión'));
    } finally { setBusy(null); }
  };

  const exportCsv = () => {
    const header = ['Usuario', 'Correo', 'Telefono', 'Faltas activas', 'Total', 'Estado', 'Suspendido hasta', 'Ultima falta'];
    const rows = users.map((u) => [
      u.name || '', u.email || '', u.phone || '',
      String(u.active_strikes), String(u.total_strikes),
      isSuspended(u) ? 'Suspendido' : (u.active_strikes > 0 ? 'Advertido' : 'Sin falta vigente'),
      isSuspended(u) ? fmt(u.reservas_suspendidas_hasta) : '',
      u.last_event_name ? `${u.last_event_name} (${fmt(u.last_strike_at)})` : fmt(u.last_strike_at),
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    try {
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'nospi-faltas.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { window.alert('No se pudo exportar el CSV'); }
  };

  const filtered = users.filter((u) => {
    if (filter === 'suspended') return isSuspended(u);
    if (filter === 'warned') return u.active_strikes > 0 && !isSuspended(u);
    return true;
  });

  // El badge de estado es el mismo en la tabla y en la tarjeta.
  const renderBadge = (u: UserRow) => {
    if (isSuspended(u)) return <View style={[styles.badge, { backgroundColor: '#FDE7EA' }]}><Text style={[styles.badgeText, { color: '#9a1030' }]}>Suspendido</Text></View>;
    if (u.active_strikes > 0) return <View style={[styles.badge, { backgroundColor: '#FFF7E6' }]}><Text style={[styles.badgeText, { color: '#8a6d00' }]}>Advertido</Text></View>;
    return <View style={[styles.badge, { backgroundColor: '#EFEFEF' }]}><Text style={[styles.badgeText, { color: '#666' }]}>Sin vigencia</Text></View>;
  };

  const renderDots = (u: UserRow) => (
    <View style={styles.dots}>
      {Array.from({ length: Math.min(3, u.active_strikes) }).map((_, i) => (
        <View key={i} style={[styles.dot, { backgroundColor: ['#E9B949', '#F4823E', '#D7385E'][i] }]} />
      ))}
    </View>
  );

  // Historial: en escritorio va en filas de columnas; en el celular cada falta
  // es un bloque apilado para que no se corte el nombre del evento.
  const renderHistory = (u: UserRow) => (
    <View style={styles.history}>
      {(u.strikes || []).length === 0 && <Text style={styles.histEmpty}>Sin faltas registradas.</Text>}
      {(u.strikes || []).map((s) => (
        isMobile ? (
          <View key={s.id} style={styles.histCard}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.histTitle, { textDecorationLine: s.waived ? 'line-through' : 'none', color: s.waived ? '#9CA3AF' : '#241019' }]}>
                #{s.strike_number} · {s.event_name || 'Evento'}
              </Text>
              <Text style={styles.histMeta}>
                {fmt(s.created_at)} · <Text style={{ color: s.waived ? '#137a3e' : '#9a1030', fontWeight: '700' }}>{s.waived ? 'Perdonada' : 'Vigente'}</Text>
              </Text>
            </View>
            {!s.waived && (
              <TouchableOpacity disabled={busy === s.id} onPress={() => waive(s.id)} style={styles.histBtn}>
                <Text style={[styles.actLink, { color: nospiColors.purpleDark }]}>{busy === s.id ? '…' : 'Perdonar'}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View key={s.id} style={styles.histRow}>
            <Text style={[styles.histCell, { width: 34, fontWeight: '800', color: s.waived ? '#9CA3AF' : '#241019' }]}>#{s.strike_number}</Text>
            <Text style={[styles.histCell, { flex: 2, textDecorationLine: s.waived ? 'line-through' : 'none', color: s.waived ? '#9CA3AF' : '#333' }]}>{s.event_name || 'Evento'}</Text>
            <Text style={[styles.histCell, { flex: 1, color: '#9CA3AF' }]}>{fmt(s.created_at)}</Text>
            <Text style={[styles.histCell, { width: 90, color: s.waived ? '#137a3e' : '#9a1030' }]}>{s.waived ? 'Perdonada' : 'Vigente'}</Text>
            <View style={{ width: 100 }}>
              {!s.waived && (
                <TouchableOpacity disabled={busy === s.id} onPress={() => waive(s.id)}>
                  <Text style={[styles.actLink, { color: nospiColors.purpleDark }]}>{busy === s.id ? '…' : 'Perdonar'}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )
      ))}
    </View>
  );

  // --- Celular: una tarjeta por persona ---
  const renderCard = (u: UserRow) => {
    const susp = isSuspended(u);
    const open = expanded === u.user_id;
    return (
      <View key={u.user_id} style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.cardName} numberOfLines={2}>{u.name || '(sin nombre)'}</Text>
          {renderBadge(u)}
        </View>

        <View style={styles.cardStrikes}>
          {renderDots(u)}
          <Text style={styles.cardStrikesText}>
            {u.active_strikes} {u.active_strikes === 1 ? 'falta vigente' : 'faltas vigentes'}
            {u.total_strikes > u.active_strikes ? ` · ${u.total_strikes} en total` : ''}
          </Text>
        </View>

        {susp && <Text style={styles.cardSusp}>Suspendido hasta {fmt(u.reservas_suspendidas_hasta)}</Text>}

        <View style={styles.cardField}>
          <Text style={styles.cardLabel}>Contacto</Text>
          <Text style={styles.cardValue} numberOfLines={1}>{u.email || '—'}</Text>
          {!!u.phone && <Text style={styles.cardValueMuted}>{u.phone}</Text>}
        </View>

        <View style={styles.cardField}>
          <Text style={styles.cardLabel}>Última falta</Text>
          <Text style={styles.cardValue}>{u.last_event_name || '—'}</Text>
          <Text style={styles.cardValueMuted}>{fmt(u.last_strike_at)}</Text>
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity onPress={() => setExpanded(open ? null : u.user_id)} style={styles.cardBtn}>
            <Text style={styles.cardBtnText}>{open ? 'Ocultar historial' : 'Ver historial'}</Text>
          </TouchableOpacity>
          {susp && (
            <TouchableOpacity disabled={busy === u.user_id} onPress={() => lift(u.user_id)} style={[styles.cardBtn, styles.cardBtnOk]}>
              <Text style={[styles.cardBtnText, { color: '#137a3e' }]}>{busy === u.user_id ? '…' : 'Levantar suspensión'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {open && renderHistory(u)}
      </View>
    );
  };

  // --- Escritorio: la tabla de siempre ---
  const renderRow = (u: UserRow) => {
    const susp = isSuspended(u);
    const open = expanded === u.user_id;
    return (
      <View key={u.user_id}>
        <View style={styles.tr}>
          <Text style={[styles.td, { flex: 2, fontWeight: '700' }]}>{u.name || '(sin nombre)'}</Text>
          <View style={{ flex: 2 }}>
            <Text style={styles.td}>{u.email || '—'}</Text>
            <Text style={[styles.td, { color: '#9CA3AF', fontSize: 11 }]}>{u.phone || ''}</Text>
          </View>
          <View style={{ width: 70, alignItems: 'center' }}>
            {renderDots(u)}
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#241019' }}>{u.active_strikes}</Text>
          </View>
          <View style={{ flex: 1.6 }}>
            {renderBadge(u)}
            {susp && <Text style={{ fontSize: 11, color: '#9a1030', marginTop: 3 }}>hasta {fmt(u.reservas_suspendidas_hasta)}</Text>}
          </View>
          <View style={{ flex: 2 }}>
            <Text style={styles.td}>{u.last_event_name || '—'}</Text>
            <Text style={[styles.td, { color: '#9CA3AF', fontSize: 11 }]}>{fmt(u.last_strike_at)}</Text>
          </View>
          <View style={{ width: 200, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <TouchableOpacity onPress={() => setExpanded(open ? null : u.user_id)}><Text style={styles.actLink}>{open ? 'Ocultar' : 'Ver historial'}</Text></TouchableOpacity>
            {susp && (
              <TouchableOpacity disabled={busy === u.user_id} onPress={() => lift(u.user_id)}>
                <Text style={[styles.actLink, { color: '#137a3e' }]}>{busy === u.user_id ? '…' : 'Levantar susp.'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {open && renderHistory(u)}
      </View>
    );
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ padding: isMobile ? 14 : 20, paddingBottom: 60 }}>
      <TouchableOpacity onPress={() => router.push('/admin')} style={styles.backLink}>
        <Text style={styles.backLinkText}>‹ Volver al panel</Text>
      </TouchableOpacity>

      <Text style={[styles.title, isMobile && { fontSize: 20 }]}>No-shows / Faltas</Text>
      <Text style={styles.subtitle}>Usuarios que no confirmaron su asistencia. Los avisos y suspensiones se aplican en automático al cerrar cada evento.</Text>

      {/* KPIs */}
      <View style={styles.kpiRow}>
        <View style={[styles.kpi, isMobile && styles.kpiMobile]}>
          <Text style={[styles.kpiVal, isMobile && styles.kpiValMobile, { color: '#D7385E' }]}>{kpis.no_shows_this_month}</Text>
          <Text style={[styles.kpiLabel, isMobile && styles.kpiLabelMobile]}>Faltas este mes</Text>
        </View>
        <View style={[styles.kpi, isMobile && styles.kpiMobile]}>
          <Text style={[styles.kpiVal, isMobile && styles.kpiValMobile, { color: '#F4823E' }]}>{kpis.suspended_active}</Text>
          <Text style={[styles.kpiLabel, isMobile && styles.kpiLabelMobile]}>Suspendidos activos</Text>
        </View>
        <View style={[styles.kpi, isMobile && styles.kpiMobile]}>
          <Text style={[styles.kpiVal, isMobile && styles.kpiValMobile, { color: nospiColors.purpleDark }]}>{kpis.with_active_strike}</Text>
          <Text style={[styles.kpiLabel, isMobile && styles.kpiLabelMobile]}>Con faltas vigentes</Text>
        </View>
      </View>

      {/* Filtros + export */}
      <View style={styles.toolbar}>
        {(['all', 'suspended', 'warned'] as const).map((f) => (
          <TouchableOpacity key={f} onPress={() => setFilter(f)} style={[styles.chip, filter === f && styles.chipOn]}>
            <Text style={[styles.chipText, filter === f && styles.chipTextOn]}>
              {f === 'all' ? 'Todos' : f === 'suspended' ? 'Suspendidos' : 'Advertidos'}
            </Text>
          </TouchableOpacity>
        ))}
        {!isMobile && <View style={{ flex: 1 }} />}
        <TouchableOpacity onPress={load} style={styles.secondaryBtn}><Text style={styles.secondaryBtnText}>↻ Actualizar</Text></TouchableOpacity>
        <TouchableOpacity onPress={exportCsv} style={styles.exportBtn}><Text style={styles.exportBtnText}>⬇ Exportar CSV</Text></TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator size="large" color={nospiColors.purpleDark} /></View>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : filtered.length === 0 ? (
        <Text style={styles.empty}>No hay usuarios con faltas{filter !== 'all' ? ' en este filtro' : ''}.</Text>
      ) : isMobile ? (
        <View style={{ gap: 12 }}>
          <Text style={styles.countLine}>{filtered.length} {filtered.length === 1 ? 'persona' : 'personas'}</Text>
          {filtered.map(renderCard)}
        </View>
      ) : (
        <View style={styles.table}>
          <View style={[styles.tr, styles.trHead]}>
            <Text style={[styles.th, { flex: 2 }]}>Usuario</Text>
            <Text style={[styles.th, { flex: 2 }]}>Contacto</Text>
            <Text style={[styles.th, { width: 70, textAlign: 'center' }]}>Faltas</Text>
            <Text style={[styles.th, { flex: 1.6 }]}>Estado</Text>
            <Text style={[styles.th, { flex: 2 }]}>Última falta</Text>
            <Text style={[styles.th, { width: 200 }]}>Acciones</Text>
          </View>

          {filtered.map(renderRow)}
        </View>
      )}

      <Text style={styles.foot}>Regla: 1ª falta = aviso · 2ª = suspensión 15 días · 3ª = 60 días. Las faltas dejan de contar a los ~4 meses. "Perdonar" quita una falta; "Levantar suspensión" reactiva las reservas de inmediato.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f4f0f2' },
  backLink: { marginBottom: 10 },
  backLinkText: { color: nospiColors.purpleDark, fontSize: 14, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '800', color: '#241019' },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 4, marginBottom: 18, maxWidth: 720, lineHeight: 19 },
  kpiRow: { flexDirection: 'row', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  kpi: { backgroundColor: '#fff', borderRadius: 12, padding: 16, minWidth: 170, flexGrow: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  // En el celular los tres KPI caben en una sola fila si no exigen 170px.
  kpiMobile: { minWidth: 0, flexBasis: 0, flexGrow: 1, flexShrink: 1, padding: 10 },
  kpiVal: { fontSize: 28, fontWeight: '800' },
  kpiValMobile: { fontSize: 21 },
  kpiLabel: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  kpiLabelMobile: { fontSize: 10.5, lineHeight: 14 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e4dde2' },
  chipOn: { backgroundColor: nospiColors.purpleDark, borderColor: nospiColors.purpleDark },
  chipText: { fontSize: 13, color: '#555', fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  secondaryBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e4dde2' },
  secondaryBtnText: { fontSize: 12.5, color: '#555', fontWeight: '600' },
  exportBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: nospiColors.purpleDark },
  exportBtnText: { fontSize: 12.5, color: '#fff', fontWeight: '700' },
  countLine: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  table: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f0eaee', gap: 8 },
  trHead: { backgroundColor: '#f3edf0', borderTopWidth: 0 },
  th: { fontSize: 11, fontWeight: '700', color: '#6b5560', textTransform: 'uppercase', letterSpacing: 0.3 },
  td: { fontSize: 13, color: '#333' },
  // --- tarjeta de celular ---
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  cardName: { flex: 1, fontSize: 16, fontWeight: '800', color: '#241019', lineHeight: 21 },
  cardStrikes: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8 },
  cardStrikesText: { fontSize: 12.5, color: '#6b5560', fontWeight: '600' },
  cardSusp: { fontSize: 12, color: '#9a1030', fontWeight: '700', marginTop: 6 },
  cardField: { marginTop: 10 },
  cardLabel: { fontSize: 10.5, fontWeight: '700', color: '#a08e97', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 },
  cardValue: { fontSize: 13.5, color: '#333', lineHeight: 19 },
  cardValueMuted: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  cardBtn: { flexGrow: 1, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 9, backgroundColor: '#faf3f6', borderWidth: 1, borderColor: '#efe2e9', alignItems: 'center' },
  cardBtnOk: { backgroundColor: '#eefaf2', borderColor: '#cfead9' },
  cardBtnText: { fontSize: 12.5, fontWeight: '700', color: nospiColors.purpleDark },
  dots: { flexDirection: 'row', gap: 3, marginBottom: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  actLink: { fontSize: 12, fontWeight: '700', color: nospiColors.purpleDark },
  history: { backgroundColor: '#faf7f8', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, marginTop: 12 },
  histEmpty: { fontSize: 12, color: '#9CA3AF', paddingVertical: 8 },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 8, borderTopWidth: 1, borderTopColor: '#eee' },
  histCell: { fontSize: 12.5, color: '#333' },
  histCard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#eee' },
  histTitle: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  histMeta: { fontSize: 11.5, color: '#9CA3AF', marginTop: 2 },
  histBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#efe2e9' },
  errorText: { color: '#D7385E', padding: 20, textAlign: 'center' },
  empty: { color: '#6b7280', padding: 30, textAlign: 'center' },
  foot: { fontSize: 11.5, color: '#9CA3AF', marginTop: 18, lineHeight: 17, maxWidth: 820 },
});
