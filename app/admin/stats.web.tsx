import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { nospiColors } from '@/constants/Colors';
import { useRouter, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';

const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqZGlyYXVyZmJhd290bGNuZG1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MDMxMTUsImV4cCI6MjA4NTk3OTExNX0.FxMBafEjIliTDzRBRlnY59i1wEcbIx6u8ZdVf1uxuj8';

interface EventRef {
  id: string;
  name: string;
  type: string;
  city: string;
  date: string;
}

interface AppointmentRow {
  id: string;
  created_at: string;
  status: string;
  payment_status: string;
  amount_paid_cop: number | null;
  payment_method: string | null;
  event: EventRef | null;
}

interface SubscriptionRow {
  id: string;
  created_at: string;
  plan_type: string;
  price: number;
  status: string;
  payment_method: string;
}

async function callAdminStats(body: Record<string, any>) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || SUPABASE_ANON_KEY;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-stats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || `Error (HTTP ${res.status})`);
  return json;
}

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function formatDayLabel(day: string) {
  const parts = day.split('-');
  return `${parts[2]}/${parts[1]}`;
}

function formatDayFull(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatCOP(n: number) {
  return `$${Math.round(n).toLocaleString('es-CO')}`;
}

function planLabel(plan: string) {
  if (plan === '1_month') return '1 mes';
  if (plan === '3_months') return '3 meses';
  if (plan === '6_months') return '6 meses';
  return plan;
}

interface DayBar {
  day: string;
  value: number;
}

function BarChart({ data, color }: { data: DayBar[]; color: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chartScroll} contentContainerStyle={styles.chartRow}>
      {data.map((d) => (
        <View key={d.day} style={styles.chartCol}>
          <Text style={styles.chartValue}>{d.value}</Text>
          <View style={[styles.chartBar, { height: Math.max(4, (d.value / max) * 120), backgroundColor: color }]} />
          <Text style={styles.chartLabel}>{formatDayLabel(d.day)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

export default function StatsScreen() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await callAdminStats({ action: 'report' });
      setAppointments(json.appointments || []);
      setSubscriptions(json.subscriptions || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const apptsByDay = useMemo(() => {
    const map: Record<string, { day: string; count: number; revenue: number }> = {};
    for (const a of appointments) {
      const day = dayKey(a.created_at);
      if (!map[day]) map[day] = { day, count: 0, revenue: 0 };
      map[day].count += 1;
      map[day].revenue += a.amount_paid_cop || 0;
    }
    return Object.values(map).sort((x, y) => x.day.localeCompare(y.day));
  }, [appointments]);

  const apptsByDayEvent = useMemo(() => {
    const map: Record<string, { day: string; eventName: string; count: number; revenue: number }> = {};
    for (const a of appointments) {
      const day = dayKey(a.created_at);
      const eventName = a.event?.name || 'Sin evento';
      const key = `${day}|${eventName}`;
      if (!map[key]) map[key] = { day, eventName, count: 0, revenue: 0 };
      map[key].count += 1;
      map[key].revenue += a.amount_paid_cop || 0;
    }
    return Object.values(map).sort((x, y) => (x.day < y.day ? 1 : x.day > y.day ? -1 : x.eventName.localeCompare(y.eventName)));
  }, [appointments]);

  const subsByDay = useMemo(() => {
    const map: Record<string, { day: string; count: number; revenue: number }> = {};
    for (const s of subscriptions) {
      const day = dayKey(s.created_at);
      if (!map[day]) map[day] = { day, count: 0, revenue: 0 };
      map[day].count += 1;
      map[day].revenue += Number(s.price) || 0;
    }
    return Object.values(map).sort((x, y) => x.day.localeCompare(y.day));
  }, [subscriptions]);

  const subsByDayPlan = useMemo(() => {
    const map: Record<string, { day: string; plan: string; count: number; revenue: number }> = {};
    for (const s of subscriptions) {
      const day = dayKey(s.created_at);
      const key = `${day}|${s.plan_type}`;
      if (!map[key]) map[key] = { day, plan: s.plan_type, count: 0, revenue: 0 };
      map[key].count += 1;
      map[key].revenue += Number(s.price) || 0;
    }
    return Object.values(map).sort((x, y) => (x.day < y.day ? 1 : x.day > y.day ? -1 : x.plan.localeCompare(y.plan)));
  }, [subscriptions]);

  const totalAppts = appointments.length;
  const totalApptsRevenue = appointments.reduce((s, a) => s + (a.amount_paid_cop || 0), 0);
  const totalSubs = subscriptions.length;
  const totalSubsRevenue = subscriptions.reduce((s, su) => s + (Number(su.price) || 0), 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Estadísticas' }} />

      <TouchableOpacity onPress={() => router.push('/admin')} style={styles.backLink}>
        <Text style={styles.backLinkText}>‹ Volver al panel</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Estadísticas</Text>
      <Text style={styles.subtitle}>Inscripciones a eventos y suscripciones mensuales, día por día.</Text>

      {loading ? (
        <ActivityIndicator size="large" color={nospiColors.purpleDark} style={{ marginTop: 40 }} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <>
          <View style={styles.cardsRow}>
            <View style={styles.card}>
              <Text style={styles.cardValue}>{totalAppts}</Text>
              <Text style={styles.cardLabel}>Inscripciones a eventos</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardValue}>{formatCOP(totalApptsRevenue)}</Text>
              <Text style={styles.cardLabel}>Recaudado en eventos</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardValue}>{totalSubs}</Text>
              <Text style={styles.cardLabel}>Suscripciones mensuales</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardValue}>{formatCOP(totalSubsRevenue)}</Text>
              <Text style={styles.cardLabel}>Ingreso por suscripciones</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Inscripciones a eventos por día</Text>
          {apptsByDay.length === 0 ? (
            <Text style={styles.emptyText}>Todavía no hay inscripciones registradas.</Text>
          ) : (
            <BarChart data={apptsByDay.map((d) => ({ day: d.day, value: d.count }))} color={nospiColors.purpleDark} />
          )}

          <Text style={styles.sectionTitle}>Inscripciones por día y evento</Text>
          {apptsByDayEvent.length === 0 ? (
            <Text style={styles.emptyText}>Todavía no hay inscripciones registradas.</Text>
          ) : (
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeaderRow]}>
                <Text style={[styles.th, { flex: 1 }]}>Fecha</Text>
                <Text style={[styles.th, { flex: 1.6 }]}>Evento</Text>
                <Text style={[styles.th, { flex: 0.8 }]}>Inscripciones</Text>
                <Text style={[styles.th, { flex: 1 }]}>Recaudo</Text>
              </View>
              {apptsByDayEvent.map((row) => (
                <View key={`${row.day}|${row.eventName}`} style={styles.tableRow}>
                  <Text style={[styles.td, { flex: 1 }]}>{formatDayFull(row.day)}</Text>
                  <Text style={[styles.td, { flex: 1.6, fontWeight: '600' }]}>{row.eventName}</Text>
                  <Text style={[styles.td, { flex: 0.8 }]}>{row.count}</Text>
                  <Text style={[styles.td, { flex: 1 }]}>{formatCOP(row.revenue)}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.sectionTitle}>Suscripciones mensuales por día</Text>
          {subsByDay.length === 0 ? (
            <Text style={styles.emptyText}>Todavía no hay suscripciones registradas.</Text>
          ) : (
            <BarChart data={subsByDay.map((d) => ({ day: d.day, value: d.count }))} color="#10B981" />
          )}

          <Text style={styles.sectionTitle}>Suscripciones por día y plan</Text>
          {subsByDayPlan.length === 0 ? (
            <Text style={styles.emptyText}>Todavía no hay suscripciones registradas.</Text>
          ) : (
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeaderRow]}>
                <Text style={[styles.th, { flex: 1 }]}>Fecha</Text>
                <Text style={[styles.th, { flex: 1 }]}>Plan</Text>
                <Text style={[styles.th, { flex: 0.8 }]}>Suscripciones</Text>
                <Text style={[styles.th, { flex: 1 }]}>Ingreso</Text>
              </View>
              {subsByDayPlan.map((row) => (
                <View key={`${row.day}|${row.plan}`} style={styles.tableRow}>
                  <Text style={[styles.td, { flex: 1 }]}>{formatDayFull(row.day)}</Text>
                  <Text style={[styles.td, { flex: 1, fontWeight: '600' }]}>{planLabel(row.plan)}</Text>
                  <Text style={[styles.td, { flex: 0.8 }]}>{row.count}</Text>
                  <Text style={[styles.td, { flex: 1 }]}>{formatCOP(row.revenue)}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 24, paddingBottom: 60, maxWidth: 960, width: '100%', alignSelf: 'center' },
  backLink: { marginBottom: 12 },
  backLinkText: { color: nospiColors.purpleDark, fontSize: 14, fontWeight: '600' },
  title: { fontSize: 26, fontWeight: 'bold', color: nospiColors.purpleDark },
  subtitle: { fontSize: 13, color: '#6B7280', marginBottom: 20, lineHeight: 19 },
  errorText: { color: '#A32D2D', fontSize: 13, marginTop: 12 },
  emptyText: { color: '#9CA3AF', fontSize: 14, marginVertical: 16, textAlign: 'center' },
  cardsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 28 },
  card: { flexGrow: 1, minWidth: 180, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', padding: 16 },
  cardValue: { fontSize: 22, fontWeight: 'bold', color: nospiColors.purpleDark },
  cardLabel: { fontSize: 12, color: '#6B7280', marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginTop: 12, marginBottom: 12 },
  chartScroll: { marginBottom: 28 },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 4, paddingBottom: 4 },
  chartCol: { alignItems: 'center', width: 40 },
  chartValue: { fontSize: 11, color: '#374151', marginBottom: 4, fontWeight: '600' },
  chartBar: { width: 18, borderRadius: 4 },
  chartLabel: { fontSize: 9, color: '#9CA3AF', marginTop: 6 },
  table: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden', marginBottom: 28 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  tableHeaderRow: { backgroundColor: '#F9FAFB' },
  th: { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase' },
  td: { fontSize: 13, color: '#111' },
});
