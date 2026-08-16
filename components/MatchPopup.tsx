import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, usePathname } from 'expo-router';
import { supabase } from '@/lib/supabase';

// -----------------------------------------------------------------------------
// MatchPopup: escucha en TIEMPO REAL la tabla event_matches y, cuando aparece un
// match nuevo para el usuario actual, muestra un pop-up "¡Hiciste match!" con
// botón para abrir el chat 1 a 1. Cubre el caso en que la persona ya se salió de
// la pantalla de calificar: igual se entera al instante mientras la app esté
// abierta. (El push cubre el caso con la app cerrada / en segundo plano.)
// Se monta una sola vez en el layout raíz.
// -----------------------------------------------------------------------------

const VINO = '#880E4F';
const GRAD: [string, string, ...string[]] = ['#2a0016', '#5a1136', '#880E4F'];

interface MatchInfo { otherId: string; name: string; photo: string | null; conversationId: string | null; }
interface Props { userId?: string | null; }

export default function MatchPopup({ userId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [match, setMatch] = useState<MatchInfo | null>(null);
  // Guardamos el path en un ref para leerlo dentro del callback del canal sin
  // re-suscribir cada vez que cambia la navegación.
  const pathRef = useRef(pathname);
  useEffect(() => { pathRef.current = pathname; }, [pathname]);

  const initial = (n: string) => (n || '?').trim().charAt(0).toUpperCase();

  useEffect(() => {
    if (!userId) return;

    const handleMatch = async (row: any) => {
      try {
        if (!row) return;
        // Seguridad extra: solo si el usuario es parte del match.
        if (row.user_a !== userId && row.user_b !== userId) return;
        // Si la persona está en la propia pantalla de calificar, no la
        // interrumpimos: ahí ya ve su resultado del match.
        if ((pathRef.current || '').includes('catch-up-rating')) return;

        const otherId = row.user_a === userId ? row.user_b : row.user_a;
        // Traemos nombre/foto/conversación del match (ya con conversation_id set).
        const { data } = await supabase.rpc('get_my_event_matches', { p_event_id: row.event_id });
        const m = (data || []).find((x: any) => x.user_id === otherId);
        setMatch({
          otherId,
          name: m?.name || 'Alguien del encuentro',
          photo: m?.profile_photo_url ?? null,
          conversationId: m?.conversation_id ?? row.conversation_id ?? null,
        });
      } catch (e) {
        console.error('[MatchPopup] handleMatch:', e);
      }
    };

    const channel = supabase
      .channel(`match-popup-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'event_matches' }, (payload) => {
        handleMatch(payload.new);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const openChat = async () => {
    const m = match;
    setMatch(null);
    if (!m) return;
    try {
      let convId = m.conversationId;
      if (!convId) {
        const { data } = await supabase.rpc('open_direct_conversation', { p_other: m.otherId });
        convId = data as string;
      }
      if (convId) router.push(`/chat/${convId}` as any);
    } catch (e) { console.error('[MatchPopup] openChat:', e); }
  };

  if (!match) return null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => setMatch(null)}>
      <View style={styles.backdrop}>
        <LinearGradient colors={GRAD} style={styles.card} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}>
          <Text style={styles.boom}>💘</Text>
          <Text style={styles.title}>¡Hiciste match!</Text>
          {match.photo ? (
            <Image source={{ uri: match.photo }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPh]}><Text style={styles.avatarTxt}>{initial(match.name)}</Text></View>
          )}
          <Text style={styles.name}>{match.name}</Text>
          <Text style={styles.sub}>También quiere volver a coincidir contigo. ¡Escríbele! 💬</Text>
          <TouchableOpacity style={styles.btn} onPress={openChat} activeOpacity={0.85}>
            <Text style={styles.btnTxt}>Escribirle</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.later} onPress={() => setMatch(null)} activeOpacity={0.7}>
            <Text style={styles.laterTxt}>Ahora no</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 28 },
  card: { width: '100%', maxWidth: 360, borderRadius: 24, paddingVertical: 28, paddingHorizontal: 22, alignItems: 'center' },
  boom: { fontSize: 52, marginBottom: 2 },
  title: { color: '#fff', fontSize: 26, fontWeight: '900', marginBottom: 14, textAlign: 'center' },
  avatar: { width: 92, height: 92, borderRadius: 46, borderWidth: 3, borderColor: '#fff', marginBottom: 10 },
  avatarPh: { backgroundColor: '#fff0f6', justifyContent: 'center', alignItems: 'center' },
  avatarTxt: { color: VINO, fontWeight: '900', fontSize: 36 },
  name: { color: '#fff', fontSize: 19, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  sub: { color: 'rgba(255,255,255,.85)', fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 20, paddingHorizontal: 6 },
  btn: { backgroundColor: '#fff', borderRadius: 30, paddingVertical: 14, paddingHorizontal: 40, marginBottom: 8 },
  btnTxt: { color: VINO, fontSize: 16, fontWeight: '900' },
  later: { paddingVertical: 8, paddingHorizontal: 16 },
  laterTxt: { color: 'rgba(255,255,255,.7)', fontSize: 13.5, fontWeight: '600' },
});
