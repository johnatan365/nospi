import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';

// Panel de ORIGEN DE REGISTROS.
// La atribucion se captura en public/index.html (primera visita) y se guarda al
// crear el perfil en app/index.tsx. Solo hay datos desde que eso se desplego.

type UserRow = { id: string; created_at: string; utm_source: string | null; utm_campaign: string | null };
type Fila = { origen: string; registros: number; reservaron: number; tasa: number };

const RANGOS = [
  { key: '7', label: '7 dias' },
  { key: '30', label: '30 dias' },
  { key: '90', label: '90 dias' },
  { key: 'all', label: 'Todo' },
];

// Canales que cuestan plata: se marcan para distinguirlos del trafico organico.
const PAGO = ['tiktok', 'facebook', 'instagram', 'google'];

const COLOR: Record<string, string> = {
  tiktok: '#000000',
  facebook: '#1877F2',
  instagram: '#C13584',
  google: '#EA4335',
  whatsapp: '#25D366',
  referido: '#6B7280',
  directo: '#9CA3AF',
};

export default function OrigenScreen() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [conCita, setConCita] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rango, setRango] = useState('30');

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r1 = await supabase
        .from('users')
        .select('id, created_at, utm_source, utm_campaign')
        .order('created_at', { ascending: false })
        .limit(5000);
      if (r1.error) throw r1.error;
      const r2 = await supabase.from('appointments').select('user_id');
      if (r2.error) throw r2.error;
      setUsers((r1.data || []) as UserRow[]);
      setConCita(new Set((r2.data || []).map(function (x: any) { return x.user_id; })));
    } catch (err: any) {
      setError(err?.message || 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(function () { cargar(); }, [cargar]);

  const filtrados = useMemo(function () {
    if (rango === 'all') return users;
    const desde = Date.now() - parseInt(rango, 10) * 86400000;
    return users.filter(function (u) { return new Date(u.created_at).getTime() >= desde; });
  }, [users, rango]);

  const filas: Fila[] = useMemo(function () {
    const map: Record<string, Fila> = {};
    filtrados.forEach(function (u) {
      const k = (u.utm_source || 'sin dato').toLowerCase();
      if (!map[k]) map[k] = { origen: k, registros: 0, reservaron: 0, tasa: 0 };
      map[k].registros += 1;
      if (conCita.has(u.id)) map[k].reservaron += 1;
    });
    const arr = Object.values(map);
    arr.forEach(function (f) { f.tasa = f.registros ? (f.reservaron / f.registros) * 100 : 0; });
    return arr.sort(function (x, y) { return y.registros - x.registros; });
  }, [filtrados, conCita]);

  const totalReg = filtrados.length;
  const totalRes = filtrados.filter(function (u) { return conCita.has(u.id); }).length;
  const maxReg = filas.length ? filas[0].registros : 1;
  const e = React.createElement;

  const tabs = RANGOS.map(function (r) {
    return e(TouchableOpacity, { key: r.key, onPress: function () { setRango(r.key); }, style: [s.tab, rango === r.key ? s.tabOn : null] },
      e(Text, { style: [s.tabTxt, rango === r.key ? s.tabTxtOn : null] }, r.label));
  });

  function kpi(label: string, valor: string, destacado?: boolean) {
    return e(View, { style: [s.kpi, destacado ? s.kpiOn : null] },
      e(Text, { style: [s.kpiLabel, destacado ? s.kpiLabelOn : null] }, label),
      e(Text, { style: [s.kpiValor, destacado ? s.kpiValorOn : null] }, valor));
  }

  let cuerpo;
  if (loading) {
    cuerpo = e(ActivityIndicator, { size: 'large', color: '#880E4F', style: { marginTop: 60 } });
  } else if (error) {
    cuerpo = e(Text, { style: s.err }, error);
  } else {
    const pct = totalReg ? ((totalRes / totalReg) * 100).toFixed(1).replace('.', ',') : '0';
    cuerpo = e(ScrollView, { style: { flex: 1 } },
      e(View, { style: s.kpis },
        kpi('Registros', totalReg.toLocaleString('es-CO')),
        kpi('Reservaron', totalRes.toLocaleString('es-CO')),
        kpi('Conversion', pct + '%', true)),

      e(View, { style: s.tabla },
        e(View, { style: s.thead },
          e(Text, { style: [s.th, s.colCanal] }, 'Canal'),
          e(Text, { style: [s.th, s.colNum] }, 'Registros'),
          e(Text, { style: [s.th, s.colNum] }, 'Reservaron'),
          e(Text, { style: [s.th, s.colNum] }, 'Conversion')),

        filas.map(function (f) {
          const sinDato = f.origen === 'sin dato';
          const ancho = Math.max(2, (f.registros / maxReg) * 100);
          const color = sinDato ? '#CFCFCF' : (COLOR[f.origen] || '#880E4F');
          return e(View, { key: f.origen, style: s.tr },
            e(View, { style: s.colCanal },
              e(View, { style: s.canalLinea },
                e(Text, { style: [s.canal, sinDato ? s.canalGris : null] }, f.origen),
                PAGO.indexOf(f.origen) > -1 ? e(Text, { style: s.badge }, 'PAGO') : null),
              e(View, { style: s.barra }, e(View, { style: [s.barraFill, { width: (ancho + '%') as any, backgroundColor: color }] }))),
            e(Text, { style: [s.td, s.colNum] }, String(f.registros)),
            e(Text, { style: [s.td, s.colNum] }, String(f.reservaron)),
            e(Text, { style: [s.td, s.colNum, s.bold, f.tasa > 0 ? (sinDato ? s.gris : s.verde) : s.apagado] },
              f.tasa.toFixed(1).replace('.', ',') + '%'));
        }),

        filas.length === 0 ? e(Text, { style: s.vacio }, 'No hay registros en este rango.') : null),

      e(Text, { style: s.nota }, 'Atribucion capturada desde el 18 de agosto de 2026. Los registros anteriores y los hechos desde la app nativa aparecen como "sin dato".'));
  }

  return e(View, { style: s.wrap },
    e(Stack.Screen, { options: { title: 'Origen de registros' } }),
    e(View, { style: s.inner },
      e(View, { style: s.barraTop },
        e(View, { style: s.tabs }, tabs),
        e(TouchableOpacity, { onPress: cargar, style: s.reload }, e(Text, { style: s.reloadTxt }, 'Recargar'))),
      cuerpo));
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, width: '100%', maxWidth: 780, alignSelf: 'center', padding: 20 },

  barraTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
  tabs: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tab: { paddingVertical: 6, paddingHorizontal: 13, borderRadius: 99, borderWidth: 1, borderColor: '#DDD' },
  tabOn: { backgroundColor: '#880E4F', borderColor: '#880E4F' },
  tabTxt: { fontSize: 12, color: '#555' },
  tabTxtOn: { color: '#fff', fontWeight: '700' },
  reload: { paddingVertical: 6, paddingHorizontal: 13, borderRadius: 99, backgroundColor: '#F2F2F2' },
  reloadTxt: { fontSize: 12, color: '#333' },

  kpis: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  kpi: { flex: 1, backgroundColor: '#FAFAFA', borderWidth: 1, borderColor: '#EEE', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14 },
  kpiOn: { backgroundColor: '#FFF0F6', borderColor: '#F7C9DC' },
  kpiLabel: { fontSize: 10, color: '#888', fontWeight: '700', letterSpacing: 0.5 },
  kpiLabelOn: { color: '#9C3161' },
  kpiValor: { fontSize: 26, fontWeight: '700', marginTop: 3, color: '#1A1A1A' },
  kpiValorOn: { color: '#880E4F' },

  tabla: { borderWidth: 1, borderColor: '#EEE', borderRadius: 12, overflow: 'hidden' },
  thead: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#FAFAFA' },
  th: { fontSize: 10, color: '#888', fontWeight: '700', letterSpacing: 0.5 },
  tr: { flexDirection: 'row', paddingVertical: 13, paddingHorizontal: 14, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F2F2F2' },
  colCanal: { flex: 1.7 },
  colNum: { width: 92, textAlign: 'right' },

  canalLinea: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  canal: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', textTransform: 'capitalize' },
  canalGris: { color: '#777' },
  badge: { fontSize: 9, fontWeight: '700', color: '#fff', backgroundColor: '#880E4F', paddingVertical: 2, paddingHorizontal: 7, borderRadius: 99, overflow: 'hidden' },
  barra: { height: 4, backgroundColor: '#F0F0F0', borderRadius: 99, marginTop: 7, width: '88%', overflow: 'hidden' },
  barraFill: { height: '100%', borderRadius: 99 },

  td: { fontSize: 14, color: '#222' },
  bold: { fontWeight: '700' },
  verde: { color: '#0A7F3F' },
  gris: { color: '#555' },
  apagado: { color: '#BBB' },

  err: { color: '#C00', marginTop: 20 },
  vacio: { color: '#888', padding: 24, textAlign: 'center' },
  nota: { marginTop: 14, fontSize: 11, color: '#AAA', lineHeight: 17 },
});
