import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Platform } from 'react-native';
import { nospiColors } from '@/constants/Colors';
import { useRouter, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';

const SUPABASE_URL = 'https://wjdiraurfbawotlcndmk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqZGlyYXVyZmJhd290bGNuZG1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MDMxMTUsImV4cCI6MjA4NTk3OTExNX0.FxMBafEjIliTDzRBRlnY59i1wEcbIx6u8ZdVf1uxuj8';

interface PromoCode {
  id: string;
  code: string;
  discount_percent: number;
  max_uses: number | null;
  current_uses: number;
  expires_at: string | null;
  active: boolean;
  label: string | null;
  created_at: string;
  redemption_count: number;
}

interface RedemptionUser {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  gender: string | null;
  interested_in: string | null;
  age: number | null;
  age_range_min: number | null;
  age_range_max: number | null;
}

interface RedemptionEvent {
  id: string;
  name: string;
  date: string;
}

interface Redemption {
  id: string;
  created_at: string;
  discount_percent_applied: number;
  users: RedemptionUser | null;
  events: RedemptionEvent | null;
}

async function callAdminPromoCodes(body: Record<string, any>) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || SUPABASE_ANON_KEY;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-promo-codes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || `Error (HTTP ${res.status})`);
  return json;
}

function formatDate(iso: string | null) {
  if (!iso) return 'Sin expiración';
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function genderLabel(g: string | null) {
  if (g === 'hombre' || g === 'male' || g === 'Hombre') return 'Hombre';
  if (g === 'mujer' || g === 'female' || g === 'Mujer') return 'Mujer';
  return 'No especificado';
}

function interestedInLabel(v: string | null) {
  if (v === 'hombres' || v === 'male') return 'Hombres';
  if (v === 'mujeres' || v === 'female') return 'Mujeres';
  if (v === 'ambos' || v === 'both') return 'Ambos';
  return 'No especificado';
}

export default function PromoCodesScreen() {
  const router = useRouter();
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formCode, setFormCode] = useState('');
  const [formDiscount, setFormDiscount] = useState('');
  const [formMaxUses, setFormMaxUses] = useState('');
  const [formExpiresAt, setFormExpiresAt] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [redemptionsByCode, setRedemptionsByCode] = useState<Record<string, Redemption[]>>({});
  const [loadingRedemptions, setLoadingRedemptions] = useState<string | null>(null);

  const loadCodes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await callAdminPromoCodes({ action: 'list' });
      setCodes(json.codes || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCodes(); }, [loadCodes]);

  const resetForm = () => {
    setFormCode('');
    setFormDiscount('');
    setFormMaxUses('');
    setFormExpiresAt('');
    setFormLabel('');
    setFormError(null);
  };

  const handleCreate = async () => {
    setFormError(null);
    if (!formCode.trim()) { setFormError('El código es requerido.'); return; }
    const discountNum = parseInt(formDiscount, 10);
    if (!discountNum || discountNum < 1 || discountNum > 100) {
      setFormError('El porcentaje de descuento debe ser un número entre 1 y 100.');
      return;
    }
    setSaving(true);
    try {
      await callAdminPromoCodes({
        action: 'create',
        code: formCode.trim(),
        discountPercent: discountNum,
        maxUses: formMaxUses.trim() || null,
        expiresAt: formExpiresAt.trim() ? new Date(formExpiresAt.trim()).toISOString() : null,
        label: formLabel.trim() || null,
      });
      resetForm();
      setShowForm(false);
      await loadCodes();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: PromoCode) => {
    setTogglingId(item.id);
    try {
      await callAdminPromoCodes({ action: 'update', id: item.id, updates: { active: !item.active } });
      await loadCodes();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (item: PromoCode) => {
    if (typeof window !== 'undefined' && !window.confirm(`¿Eliminar el código "${item.code}"? Esta acción no se puede deshacer.`)) return;
    setDeletingId(item.id);
    try {
      await callAdminPromoCodes({ action: 'delete', id: item.id });
      if (expandedId === item.id) setExpandedId(null);
      await loadCodes();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleRedemptions = async (item: PromoCode) => {
    if (expandedId === item.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(item.id);
    if (!redemptionsByCode[item.id]) {
      setLoadingRedemptions(item.id);
      try {
        const json = await callAdminPromoCodes({ action: 'redemptions', id: item.id });
        setRedemptionsByCode((prev) => ({ ...prev, [item.id]: json.redemptions || [] }));
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoadingRedemptions(null);
      }
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Códigos promocionales' }} />

      <TouchableOpacity onPress={() => router.push('/admin')} style={styles.backLink}>
        <Text style={styles.backLinkText}>‹ Volver al panel</Text>
      </TouchableOpacity>

      <View style={styles.headerRow}>
        <Text style={styles.title}>Códigos promocionales</Text>
        <TouchableOpacity style={styles.newButton} onPress={() => { setShowForm((v) => !v); resetForm(); }}>
          <Text style={styles.newButtonText}>{showForm ? 'Cancelar' : '+ Nuevo código'}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>Crea códigos para influencers o promociones puntuales. Un descuento del 100% deja la inscripción gratis; menos del 100% se descuenta del total al pagar.</Text>

      {showForm && (
        <View style={styles.formCard}>
          <Text style={styles.formLabel}>Código</Text>
          <TextInput style={styles.input} placeholder="Nombre del código" value={formCode} onChangeText={setFormCode} autoCapitalize="characters" />

          <Text style={styles.formLabel}>Porcentaje de descuento (1-100)</Text>
          <TextInput style={styles.input} placeholder="Ej: 100" value={formDiscount} onChangeText={(t) => setFormDiscount(t.replace(/\D/g, ''))} keyboardType="numeric" />

          <Text style={styles.formLabel}>Máximo de usos (opcional)</Text>
          <TextInput style={styles.input} placeholder="Vacío = sin límite" value={formMaxUses} onChangeText={(t) => setFormMaxUses(t.replace(/\D/g, ''))} keyboardType="numeric" />

          <Text style={styles.formLabel}>Fecha de expiración (opcional)</Text>
          <TextInput style={styles.input} placeholder="AAAA-MM-DD, ej: 2026-07-27" value={formExpiresAt} onChangeText={setFormExpiresAt} />

          <Text style={styles.formLabel}>Etiqueta (opcional, solo para identificarlo internamente)</Text>
          <TextInput style={styles.input} placeholder="Ej: Beta - influencer" value={formLabel} onChangeText={setFormLabel} />

          {!!formError && <Text style={styles.errorText}>{formError}</Text>}

          <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleCreate} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Crear código</Text>}
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={nospiColors.purpleDark} style={{ marginTop: 40 }} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : codes.length === 0 ? (
        <Text style={styles.emptyText}>Todavía no has creado ningún código.</Text>
      ) : (
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeaderRow]}>
            <Text style={[styles.th, { flex: 1.1 }]}>Código</Text>
            <Text style={[styles.th, { flex: 0.7 }]}>Descuento</Text>
            <Text style={[styles.th, { flex: 1 }]}>Usos</Text>
            <Text style={[styles.th, { flex: 1 }]}>Expira</Text>
            <Text style={[styles.th, { flex: 1.1 }]}>Etiqueta</Text>
            <Text style={[styles.th, { flex: 0.8 }]}>Estado</Text>
            <Text style={[styles.th, { flex: 1.3 }]}>Acciones</Text>
          </View>
          {codes.map((item) => (
            <React.Fragment key={item.id}>
              <View style={styles.tableRow}>
                <Text style={[styles.td, { flex: 1.1, fontWeight: '700', color: nospiColors.purpleDark }]}>{item.code}</Text>
                <Text style={[styles.td, { flex: 0.7 }]}>{item.discount_percent}%</Text>
                <Text style={[styles.td, { flex: 1 }]}>{`${item.current_uses}${item.max_uses ? ` / ${item.max_uses}` : ''}`}</Text>
                <Text style={[styles.td, { flex: 1 }]}>{formatDate(item.expires_at)}</Text>
                <Text style={[styles.td, { flex: 1.1, color: '#666' }]}>{item.label || '—'}</Text>
                <TouchableOpacity
                  style={[styles.statusPill, item.active ? styles.statusActive : styles.statusInactive, { flex: 0.8 }]}
                  onPress={() => handleToggleActive(item)}
                  disabled={togglingId === item.id}
                >
                  {togglingId === item.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.statusPillText}>{item.active ? 'Activo' : 'Inactivo'}</Text>
                  )}
                </TouchableOpacity>
                <View style={[styles.actionsCell, { flex: 1.3 }]}>
                  <TouchableOpacity style={styles.viewButton} onPress={() => handleToggleRedemptions(item)}>
                    <Text style={styles.viewButtonText}>{expandedId === item.id ? 'Ocultar' : `👥 Ver (${item.redemption_count})`}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(item)} disabled={deletingId === item.id}>
                    {deletingId === item.id ? <ActivityIndicator size="small" color="#A32D2D" /> : <Text style={styles.deleteButtonText}>🗑️</Text>}
                  </TouchableOpacity>
                </View>
              </View>

              {expandedId === item.id && (
                <View style={styles.redemptionsPanel}>
                  {loadingRedemptions === item.id ? (
                    <ActivityIndicator size="small" color={nospiColors.purpleDark} style={{ marginVertical: 16 }} />
                  ) : (redemptionsByCode[item.id] || []).length === 0 ? (
                    <Text style={styles.emptyRedemptionsText}>Nadie ha usado este código todavía.</Text>
                  ) : (
                    <View style={styles.redemptionsList}>
                      {(redemptionsByCode[item.id] || []).map((r) => (
                        <View key={r.id} style={styles.redemptionCard}>
                          <View style={styles.redemptionHeaderRow}>
                            <Text style={styles.redemptionName}>{r.users?.name || 'Sin nombre'}</Text>
                            <Text style={styles.redemptionDate}>{formatDateTime(r.created_at)}</Text>
                          </View>
                          <View style={styles.redemptionGrid}>
                            <Text style={styles.redemptionField}>📧 {r.users?.email || '—'}</Text>
                            <Text style={styles.redemptionField}>📱 {r.users?.phone || '—'}</Text>
                            <Text style={styles.redemptionField}>📍 {[r.users?.city, r.users?.country].filter(Boolean).join(', ') || '—'}</Text>
                            <Text style={styles.redemptionField}>🎂 Edad: {r.users?.age ?? '—'}</Text>
                            <Text style={styles.redemptionField}>⚧ {genderLabel(r.users?.gender ?? null)}</Text>
                            <Text style={styles.redemptionField}>💘 Interesado en: {interestedInLabel(r.users?.interested_in ?? null)}</Text>
                            <Text style={styles.redemptionField}>
                              📊 Rango edad: {r.users?.age_range_min ?? '—'} - {r.users?.age_range_max ?? '—'}
                            </Text>
                            <Text style={styles.redemptionField}>🎟️ Evento: {r.events?.name || '—'}</Text>
                            <Text style={styles.redemptionField}>💸 Descuento aplicado: {r.discount_percent_applied}%</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </React.Fragment>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 24, paddingBottom: 60, maxWidth: 960, width: '100%', alignSelf: 'center' },
  backLink: { marginBottom: 12 },
  backLinkText: { color: nospiColors.purpleDark, fontSize: 14, fontWeight: '600' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  title: { fontSize: 26, fontWeight: 'bold', color: nospiColors.purpleDark },
  subtitle: { fontSize: 13, color: '#6B7280', marginBottom: 20, lineHeight: 19 },
  newButton: { backgroundColor: nospiColors.purpleDark, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 },
  newButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  formCard: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', padding: 20, marginBottom: 24 },
  formLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.OS === 'web' ? 10 : 12, fontSize: 14, color: '#111' },
  saveButton: { backgroundColor: nospiColors.purpleDark, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  errorText: { color: '#A32D2D', fontSize: 13, marginTop: 12 },
  emptyText: { color: '#9CA3AF', fontSize: 14, marginTop: 40, textAlign: 'center' },
  table: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  tableHeaderRow: { backgroundColor: '#F9FAFB' },
  th: { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase' },
  td: { fontSize: 13, color: '#111' },
  statusPill: { borderRadius: 8, paddingVertical: 6, alignItems: 'center' },
  statusActive: { backgroundColor: '#10B981' },
  statusInactive: { backgroundColor: '#9CA3AF' },
  statusPillText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  actionsCell: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  viewButton: { backgroundColor: '#EEF2FF', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8 },
  viewButtonText: { color: nospiColors.purpleDark, fontSize: 12, fontWeight: '700' },
  deleteButton: { backgroundColor: '#FEF2F2', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  deleteButtonText: { fontSize: 13 },
  redemptionsPanel: { backgroundColor: '#FAFAFB', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  emptyRedemptionsText: { color: '#9CA3AF', fontSize: 13, textAlign: 'center', paddingVertical: 8 },
  redemptionsList: { gap: 10 },
  redemptionCard: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', padding: 12 },
  redemptionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  redemptionName: { fontSize: 14, fontWeight: '700', color: '#111' },
  redemptionDate: { fontSize: 11, color: '#9CA3AF' },
  redemptionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  redemptionField: { fontSize: 12, color: '#4B5563', minWidth: '45%' },
});
