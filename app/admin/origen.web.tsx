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
      const r1 = await supabase.from('users').select('id, created_at, utm_source, utm_campaign').order('created_at', { ascending: false }).limit(5000);
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
      const k = u.utm_source || 'sin dato';
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
  const e = React.createElement;

  const tabs = RANGOS.map(function (r) {
    return e(TouchableOpacity, { key: r.key, onPress: function () { setRango(r.key); }, style: [s.tab, rango === r.key ? s.tabOn : null] },
      e(Text, { style: [s.tabTxt, rango === r.key ? s.tabTxtOn : null] }, r.label));
  });
  tabs.push(e(TouchableOpacity, { key: 'reload', onPress: cargar, style: s.reload }, e(Text, { style: s.reloadTxt }, 'Recargar')));

  let cuerpo;
  if (loading) {
    cuerpo = e(ActivityIndicator, { size: 'large', color: '#880E4F', style: { marginTop: 40 } });
  } else if (error) {
    cuerpo = e(Text, { style: s.err }, error);
  } else {
    const pct = totalReg ? ((totalRes / totalReg) * 100).toFixed(1) : '0';
    cuerpo = e(ScrollView, { style: { flex: 1 } },
      e(View, { style: s.resumen }, e(Text, { style: s.resumenTxt }, totalReg + ' registros - ' + totalRes + ' reservaron (' + pct + '%)')),
      e(View, { style: s.head },
        e(Text, { style: [s.th, { flex: 2 }] }, 'Origen'),
        e(Text, { style: [s.th, s.num] }, 'Registros'),
        e(Text, { style: [s.th, s.num] }, 'Reservaron'),
        e(Text, { style: [s.th, s.num] }, 'Conversion')),
      filas.map(function (f) {
        return e(View, { key: f.origen, style: s.row },
          e(Text, { style: [s.td, { flex: 2, fontWeight: '700' }] }, f.origen),
          e(Text, { style: [s.td, s.num] }, String(f.registros)),
          e(Text, { style: [s.td, s.num] }, String(f.reservaron)),
          e(Text, { style: [s.td, s.num, f.tasa > 0 ? s.ok : s.cero] }, f.tasa.toFixed(1) + '%'));
      }),
      filas.length === 0 ? e(Text, { style: s.vacio }, 'No hay registros en este rango.') : null,
      e(Text, { style: s.nota }, 'La atribucion se empezo a capturar el 18 de agosto de 2026. Los usuarios registrados antes aparecen como sin dato y no se pueden recuperar. Los registros hechos desde la app nativa tampoco traen origen: solo web.'));
  }

  return e(View, { style: s.wrap },
    e(Stack.Screen, { options: { title: 'Origen de registros' } }),
    e(View, { style: s.tabs }, tabs),
    cuerpo);
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff', padding: 16 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  tab: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1, borderColor: '#ddd' },
  tabOn: { backgroundColor: '#880E4F', borderColor: '#880E4F' },
  tabTxt: { fontSize: 13, color: '#555' },
  tabTxtOn: { color: '#fff', fontWeight: '700' },
  reload: { marginLeft: 'auto', paddingVertical: 7, paddingHorizontal: 14, borderRadius: 99, backgroundColor: '#f2f2f2' },
  reloadTxt: { fontSize: 13, color: '#333' },
  resumen: { backgroundColor: '#fff0f6', borderRadius: 10, padding: 12, marginBottom: 14 },
  resumenTxt: { fontSize: 15, fontWeight: '700', color: '#880E4F' },
  head: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: '#eee' },
  th: { fontSize: 12, fontWeight: '700', color: '#888' },
  row: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f4f4f4' },
  td: { fontSize: 14, color: '#222' },
  num: { flex: 1, textAlign: 'right' },
  ok: { color: '#0a7f3f', fontWeight: '700' },
  cero: { color: '#bbb' },
  err: { color: '#c00', marginTop: 20 },
  vacio: { color: '#888', marginTop: 20, textAlign: 'center' },
  nota: { marginTop: 24, fontSize: 12, color: '#999', lineHeight: 18 },
});
