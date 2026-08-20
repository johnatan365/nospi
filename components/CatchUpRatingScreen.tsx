import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

// -----------------------------------------------------------------------------
// Cierre del encuentro (reemplaza las estrellas 1-5):
//   Paso 1 · AFINIDAD  -> ¿con quién te gustaría volver a coincidir? (privado)
//   Paso 2 · FEEDBACK  -> califica el encuentro por items (lugar, comida, grupo,
//                         dinamica, precio) con 3 niveles; si es "mejorable" pide
//                         el por que con motivos rapidos. + comentario opcional.
//   Paso 3 · RESULTADO -> si hubo match mutuo, lo muestra y abre el chat 1 a 1.
// Backend: event_affinity, event_matches (trigger), event_feedback, y las RPC
// get_my_event_matches / open_direct_conversation.
// -----------------------------------------------------------------------------

const GRAD: [string, string, ...string[]] = ['#1a0010', '#4a0d2c', '#880E4F'];
const VINO = '#880E4F';

// Items de la calificacion. (Se pueden adaptar por tipo de evento a futuro.)
// OTRA_KEY: si el usuario elige esta opcion, se abre un campo de texto libre.
const OTRA_KEY = 'Otra';
const ITEMS: { key: string; emo: string; label: string; reasons: string[] }[] = [
  { key: 'lugar',    emo: '🏠', label: 'El lugar / ambiente',       reasons: ['Muy ruidoso', 'Incómodo', 'Mal servicio', 'Difícil de ubicar', 'Muy costoso', 'Muy lejos', OTRA_KEY] },
  { key: 'comida',   emo: '🍽️', label: 'La comida y bebida',        reasons: ['Poca cantidad', 'Calidad regular', 'Demoró', 'Pocas opciones', 'Muy cara', OTRA_KEY] },
  { key: 'grupo',    emo: '👥', label: 'El grupo (las personas)',    reasons: ['Poca conexión', 'Ambiente apagado', 'Muy poca gente', OTRA_KEY] },
  { key: 'dinamica', emo: '🎲', label: 'La dinámica (el juego)',     reasons: ['Muy larga', 'Preguntas aburridas', 'No todos participaron', 'Incómoda', OTRA_KEY] },
];
const LEVELS = [
  { v: 1, emo: '🙁' },
  { v: 2, emo: '🙂' },
  { v: 3, emo: '🤩' },
];

interface CatchUpParticipant { user_id: string; name: string; profile_photo_url: string | null; }
interface Match { user_id: string; name: string; profile_photo_url: string | null; conversation_id: string | null; }
interface Props { eventId: string; currentUserId: string; }

// Carrera contra un timeout: en Android, tras volver del background, un fetch
// puede quedarse COLGADO sin resolver nunca (conexion muerta). Sin esto, cada
// paso del cierre se "quedaba cargando un rato" hasta que la red revivia.
function withTimeout<T>(p: PromiseLike<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export default function CatchUpRatingScreen({ eventId, currentUserId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState<CatchUpParticipant[]>([]);
  const [step, setStep] = useState<'afinidad' | 'feedback' | 'done'>('afinidad');

  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [scores, setScores] = useState<Record<string, number>>({});
  const [reasons, setReasons] = useState<Record<string, Set<string>>>({});
  const [otraText, setOtraText] = useState<Record<string, string>>({});
  const [comment, setComment] = useState('');
  // ¿Volverías a usar Nospi? -> 'si' | 'no' | null ; si es 'no' pedimos el motivo.
  const [volveria, setVolveria] = useState<'si' | 'no' | null>(null);
  const [volveriaWhy, setVolveriaWhy] = useState('');

  const [saving, setSaving] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      try {
        const { data, error } = await withTimeout(
          supabase.rpc('get_event_participants_for_interaction', { p_event_id: eventId }),
          7000,
          { data: null, error: { message: 'timeout' } } as any
        );
        if (cancelled) return;
        if (error || !data) {
          if (error) console.error('[cierre] participantes:', error.message);
          retryTimer = setTimeout(load, 2500); // reintentar en vez de quedarse cargando
          return;
        }
        // La RPC devuelve user_name / user_profile_photo_url -> los mapeamos.
        const list: CatchUpParticipant[] = (data || [])
          .filter((p: any) => p.user_id !== currentUserId)
          .map((p: any) => ({
            user_id: p.user_id,
            name: p.user_name || 'Participante',
            profile_photo_url: p.user_profile_photo_url ?? null,
          }));
        setParticipants(list);

        // Afinidad que esta persona ya guardo en un intento anterior. Sin esto,
        // quien no alcanzo a terminar el cierre y vuelve por el boton de Citas
        // encontraria la lista en blanco y tendria que elegir de nuevo.
        const { data: prev } = await withTimeout(
          supabase
            .from('event_affinity')
            .select('liked_user_id')
            .eq('event_id', eventId)
            .eq('rater_user_id', currentUserId),
          7000,
          { data: null } as any
        );
        if (!cancelled && prev && prev.length > 0) {
          setLiked(new Set(prev.map((r: any) => r.liked_user_id)));
        }
      } catch (e) { console.error('[cierre] load error:', e); }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; if (retryTimer) clearTimeout(retryTimer); };
  }, [eventId, currentUserId]);

  const toggleLike = (uid: string) => {
    setLiked(prev => { const n = new Set(prev); n.has(uid) ? n.delete(uid) : n.add(uid); return n; });
  };
  const setScore = (key: string, v: number) => {
    setScores(prev => ({ ...prev, [key]: v }));
    if (v !== 1) {
      setReasons(prev => { const n = { ...prev }; delete n[key]; return n; });
      setOtraText(prev => { const n = { ...prev }; delete n[key]; return n; });
    }
  };
  const toggleReason = (key: string, r: string) => {
    setReasons(prev => {
      const set = new Set(prev[key] || []);
      set.has(r) ? set.delete(r) : set.add(r);
      return { ...prev, [key]: set };
    });
    // Si desmarcan "Otra", limpiamos su texto.
    if (r === OTRA_KEY) {
      setOtraText(prev => {
        const wasOn = (reasons[key] || new Set()).has(OTRA_KEY);
        if (wasOn) { const n = { ...prev }; delete n[key]; return n; }
        return prev;
      });
    }
  };

  // Guarda la afinidad SINCRONIZANDO: agrega las nuevas y borra las que la
  // persona haya desmarcado. Se llama al pasar del paso 1 al 2 -- NO al final --
  // porque antes solo se guardaba junto con la calificacion: si alguien elegia
  // sus corazones y se salia sin presionar "Enviar", la eleccion se perdia y el
  // match nunca se creaba (ni para esa persona ni para quien si la eligio).
  const saveAffinity = useCallback(async () => {
    try {
      const likedArr = Array.from(liked);

      if (likedArr.length > 0) {
        const rows = likedArr.map(uid => ({ event_id: eventId, rater_user_id: currentUserId, liked_user_id: uid }));
        const { error } = await withTimeout(
          supabase
            .from('event_affinity')
            .upsert(rows, { onConflict: 'event_id,rater_user_id,liked_user_id', ignoreDuplicates: true }),
          8000,
          { error: { message: 'timeout' } } as any
        );
        if (error) console.error('[cierre] afinidad:', error.message);
      }

      // Quitar las que ya no estan marcadas (caso: vuelve a entrar y desmarca).
      let del = supabase
        .from('event_affinity')
        .delete()
        .eq('event_id', eventId)
        .eq('rater_user_id', currentUserId);
      if (likedArr.length > 0) del = del.not('liked_user_id', 'in', `(${likedArr.join(',')})`);
      const { error: delErr } = await withTimeout(del, 8000, { error: { message: 'timeout' } } as any);
      if (delErr) console.error('[cierre] afinidad (limpieza):', delErr.message);
    } catch (e) {
      console.error('[cierre] saveAffinity:', e);
    }
  }, [liked, eventId, currentUserId]);

  const goToFeedback = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    await saveAffinity();
    setSaving(false);
    setStep('feedback');
  }, [saveAffinity, saving]);

  const submitAll = useCallback(async () => {
    setSaving(true);
    try {
      // 1) Afinidad: ya quedo guardada al pasar de paso, pero se reintenta por
      // si aquella escritura fallo (sin red, por ejemplo). Es idempotente.
      await saveAffinity();

      // 2) Feedback por items. Todas las filas llevan las MISMAS llaves
      // (event_id, user_id, item_key, score, reasons, comment) porque PostgREST
      // exige que un upsert en lote tenga objetos con llaves idénticas.
      // Si marcaron "Otra", el texto libre va en la columna comment de ese item.
      const fbRows: any[] = ITEMS
        .filter(it => scores[it.key])
        .map(it => {
          const rs = Array.from(reasons[it.key] || []);
          const otra = rs.includes(OTRA_KEY) ? (otraText[it.key] || '').trim() : '';
          return {
            event_id: eventId, user_id: currentUserId, item_key: it.key,
            score: scores[it.key], reasons: rs, comment: otra || null,
          };
        });
      // ¿Volverías a usar Nospi? -> reasons:['si'|'no'], y si es 'no' el motivo en comment.
      if (volveria) {
        fbRows.push({
          event_id: eventId, user_id: currentUserId, item_key: 'volveria',
          score: null, reasons: [volveria],
          comment: volveria === 'no' ? (volveriaWhy.trim() || null) : null,
        });
      }
      if (comment.trim()) {
        fbRows.push({
          event_id: eventId, user_id: currentUserId, item_key: '_comentario',
          score: null, reasons: [], comment: comment.trim(),
        });
      }
      if (fbRows.length > 0) {
        const { error } = await withTimeout(
          supabase.from('event_feedback').upsert(fbRows, { onConflict: 'event_id,user_id,item_key' }),
          8000,
          { error: { message: 'timeout' } } as any
        );
        if (error) console.error('[cierre] feedback:', error.message);
      }

      // 3) Marcar cerrado (mantiene el comportamiento previo)
      await supabase.from('appointments')
        .update({ ratings_submitted_at: new Date().toISOString() })
        .eq('event_id', eventId).eq('user_id', currentUserId);

      // 4) ¿Ya hay match? (el otro pudo haber elegido antes)
      const { data: myMatches } = await withTimeout(
        supabase.rpc('get_my_event_matches', { p_event_id: eventId }),
        6000,
        { data: null } as any
      );
      // Si se vencio, no importa: el sondeo de la pantalla final los trae.
      setMatches((myMatches || []) as Match[]);
    } catch (e) {
      console.error('[cierre] submit error:', e);
    } finally {
      setSaving(false);
      setStep('done');
    }
  }, [saveAffinity, scores, reasons, otraText, comment, volveria, volveriaWhy, eventId, currentUserId]);

  // Mientras la persona esta en la pantalla final ('done'), escuchar los
  // matches que se creen y refrescar la lista EN VIVO. Cubre el hueco real de
  // los cierres casi simultaneos: si la otra persona completa el match cuando
  // yo ya estoy viendo mi resultado, el popup global esta suprimido en esta
  // ruta (a proposito) y esta pantalla solo mostraba lo que existia al enviar
  // -> el match nuevo no se veia por ningun lado. Realtime + sondeo de respaldo
  // cada 10s (por si el aviso realtime se pierde con la red del evento).
  useEffect(() => {
    if (step !== 'done') return;

    let cancelled = false;
    const refreshMatches = async () => {
      try {
        const { data } = await supabase.rpc('get_my_event_matches', { p_event_id: eventId });
        if (!cancelled && data) setMatches(data as Match[]);
      } catch (e) { console.error('[cierre] refreshMatches:', e); }
    };

    const channel = supabase
      .channel(`done-matches-${eventId}-${currentUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'event_matches', filter: `event_id=eq.${eventId}` },
        (payload) => {
          const row = payload.new as any;
          if (row && (row.user_a === currentUserId || row.user_b === currentUserId)) {
            refreshMatches();
          }
        }
      )
      .subscribe();

    const poll = setInterval(refreshMatches, 10000);

    return () => {
      cancelled = true;
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [step, eventId, currentUserId]);

  const openChat = async (m: Match) => {
    try {
      let convId = m.conversation_id;
      if (!convId) {
        const { data } = await supabase.rpc('open_direct_conversation', { p_other: m.user_id });
        convId = data as string;
      }
      if (convId) router.push(`/chat/${convId}` as any);
    } catch (e) { console.error('[cierre] openChat:', e); }
  };

  const initial = (n: string) => (n || '?').trim().charAt(0).toUpperCase();

  if (loading) {
    return (
      <LinearGradient colors={GRAD} style={styles.g}>
        <View style={styles.center}><ActivityIndicator size="large" color="#fff" /></View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={GRAD} style={styles.g} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* PASO 1 · AFINIDAD */}
        {step === 'afinidad' && (
          <>
            {/* Sin rótulo "La dinámica terminó": la pantalla intermedia de la
                dinámica ya anuncia el final, aquí quedaba redundante. El estilo
                kicker sigue en uso en el paso 2. */}
            <Text style={styles.h1}>¿Con quién te gustaría volver a coincidir?</Text>
            <Text style={styles.sub}>Elige a las personas con las que sentiste buena conexión. Es totalmente opcional: si no quieres elegir a nadie, también está bien.</Text>
            <View style={styles.privacy}>
              <Text style={styles.privacyTxt}>🔒 Es privado. La otra persona solo se entera si el gusto es mutuo — ahí hacen match.</Text>
            </View>
            {participants.length === 0 ? (
              <Text style={styles.empty}>No encontramos a otros participantes en este encuentro.</Text>
            ) : participants.map((p) => {
              const on = liked.has(p.user_id);
              return (
                <TouchableOpacity key={p.user_id} style={[styles.person, on && styles.personOn]} onPress={() => toggleLike(p.user_id)} activeOpacity={0.85}>
                  {p.profile_photo_url ? (
                    <Image source={{ uri: p.profile_photo_url }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPh]}><Text style={styles.avatarTxt}>{initial(p.name)}</Text></View>
                  )}
                  <Text style={styles.pName}>{p.name}</Text>
                  <View style={[styles.heart, on && styles.heartOn]}>
                    <Text style={styles.heartTxt}>{on ? '❤️' : '🤍'}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            <Text style={styles.hint}>Sin compromiso: puedes elegir a varias, a una… o a nadie. Nadie sabrá a quién elegiste, salvo que sea mutuo.</Text>
            <TouchableOpacity style={[styles.btn, saving && styles.btnDis]} onPress={goToFeedback} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.btnTxt}>{liked.size === 0 ? 'No elegir a nadie y continuar' : 'Continuar'}</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {/* PASO 2 · FEEDBACK */}
        {step === 'feedback' && (
          <>
            <Text style={styles.kicker}>¿Qué tal estuvo?</Text>
            <Text style={styles.h1}>Califica el encuentro</Text>
            <Text style={styles.help}>Tu opinión nos ayuda a mejorar para los próximos eventos 🙌</Text>
            <Text style={styles.legend}>🙁 mejorable   ·   🙂 bien   ·   🤩 excelente</Text>
            {ITEMS.map((it) => {
              const sc = scores[it.key];
              return (
                <View key={it.key} style={styles.item}>
                  <View style={styles.itemTop}>
                    <Text style={styles.itemLabel}>{it.emo}  {it.label}</Text>
                    <View style={styles.chips}>
                      {LEVELS.map(l => (
                        <TouchableOpacity key={l.v} style={[styles.chip, sc === l.v && styles.chipOn]} onPress={() => setScore(it.key, l.v)} activeOpacity={0.8}>
                          <Text style={styles.chipTxt}>{l.emo}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  {sc === 1 && (
                    <View style={styles.why}>
                      <Text style={styles.whyQ}>¿Qué mejorarías?</Text>
                      <View style={styles.rChips}>
                        {it.reasons.map(r => {
                          const on = (reasons[it.key] || new Set()).has(r);
                          return (
                            <TouchableOpacity key={r} style={[styles.rChip, on && styles.rChipOn]} onPress={() => toggleReason(it.key, r)} activeOpacity={0.8}>
                              <Text style={[styles.rChipTxt, on && styles.rChipTxtOn]}>{r}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      {(reasons[it.key] || new Set()).has(OTRA_KEY) && (
                        <TextInput
                          style={styles.otraInput}
                          placeholder="Cuéntanos qué pasó…"
                          placeholderTextColor="#b9a7b0"
                          value={otraText[it.key] || ''}
                          onChangeText={(t) => setOtraText(prev => ({ ...prev, [it.key]: t }))}
                          multiline
                        />
                      )}
                    </View>
                  )}
                </View>
              );
            })}

            {/* ¿Volverías a usar Nospi? */}
            <View style={styles.item}>
              <Text style={styles.volveriaQ}>¿Volverías a usar Nospi?</Text>
              <View style={styles.yesno}>
                <TouchableOpacity
                  style={[styles.ynBtn, volveria === 'si' && styles.ynBtnYes]}
                  onPress={() => { setVolveria('si'); setVolveriaWhy(''); }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.ynTxt, volveria === 'si' && styles.ynTxtOn]}>👍  Sí</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.ynBtn, volveria === 'no' && styles.ynBtnNo]}
                  onPress={() => setVolveria('no')}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.ynTxt, volveria === 'no' && styles.ynTxtOn]}>👎  No</Text>
                </TouchableOpacity>
              </View>
              {volveria === 'no' && (
                <View style={styles.why}>
                  <Text style={styles.whyQ}>¿Por qué no? Cuéntanos para mejorar</Text>
                  <TextInput
                    style={styles.otraInput}
                    placeholder="Escribe tu razón…"
                    placeholderTextColor="#b9a7b0"
                    value={volveriaWhy}
                    onChangeText={setVolveriaWhy}
                    multiline
                  />
                </View>
              )}
            </View>

            <TextInput
              style={styles.comment}
              placeholder="¿Algo más que quieras contarnos? (opcional)"
              placeholderTextColor="#b9a7b0"
              value={comment} onChangeText={setComment} multiline
            />
            <TouchableOpacity style={[styles.btn, saving && styles.btnDis]} onPress={submitAll} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnTxt}>Enviar</Text>}
            </TouchableOpacity>
          </>
        )}

        {/* PASO 3 · RESULTADO */}
        {step === 'done' && (
          <View style={styles.doneWrap}>
            {matches.length > 0 ? (
              <>
                <Text style={styles.boom}>💘</Text>
                <Text style={styles.matchTitle}>{matches.length === 1 ? '¡Hiciste match!' : `¡Hiciste ${matches.length} matches!`}</Text>
                <Text style={styles.matchSub}>A estas personas también les gustaría volver a coincidir contigo. Ya pueden escribirse 💬</Text>
                {matches.map((m) => (
                  <View key={m.user_id} style={styles.matchCard}>
                    {m.profile_photo_url ? (
                      <Image source={{ uri: m.profile_photo_url }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarPh]}><Text style={styles.avatarTxt}>{initial(m.name)}</Text></View>
                    )}
                    <Text style={[styles.pName, { color: '#241019' }]}>{m.name}</Text>
                    <TouchableOpacity style={styles.chatBtn} onPress={() => openChat(m)} activeOpacity={0.85}>
                      <Text style={styles.chatBtnTxt}>💬 Chat</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            ) : (
              <>
                <Text style={styles.boom}>💫</Text>
                <Text style={styles.matchTitle}>¡Listo!</Text>
                <Text style={styles.matchSub}>
                  {liked.size > 0
                    ? 'Si alguna de esas personas también te eligió, te avisamos y podrán hablar por el chat.'
                    : 'Gracias por participar 🙌'}
                </Text>
              </>
            )}
            <View style={styles.iceBreak}>
              <Text style={styles.iceBreakIcon}>✨</Text>
              <Text style={styles.iceBreakTitle}>¡Ya rompieron el hielo!</Text>
              <Text style={styles.iceBreakSub}>Ahora disfruten el resto de la noche y déjense sorprender ✨</Text>
            </View>
            <Text style={styles.thanks}>Gracias por calificar el encuentro 🙌</Text>
            <TouchableOpacity style={styles.btnGhost} onPress={() => router.replace('/(tabs)/events' as any)} activeOpacity={0.85}>
              <Text style={styles.btnGhostTxt}>Volver al inicio</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  g: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 20, paddingTop: 34, paddingBottom: 40 },
  kicker: { color: 'rgba(255,255,255,.72)', fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', textAlign: 'center', marginBottom: 6 },
  h1: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center', lineHeight: 27, marginBottom: 8 },
  sub: { color: 'rgba(255,255,255,.8)', fontSize: 13.5, textAlign: 'center', lineHeight: 20, marginBottom: 14 },
  privacy: { backgroundColor: 'rgba(255,255,255,.1)', borderColor: 'rgba(255,255,255,.16)', borderWidth: 1, borderRadius: 12, padding: 11, marginBottom: 14 },
  privacyTxt: { color: '#ffdff0', fontSize: 12.5, lineHeight: 18 },
  empty: { color: 'rgba(255,255,255,.8)', fontSize: 14, textAlign: 'center', marginVertical: 20 },
  person: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 15, padding: 11, marginBottom: 9, borderWidth: 2, borderColor: 'transparent' },
  personOn: { borderColor: VINO, backgroundColor: '#fff0f6' },
  avatar: { width: 46, height: 46, borderRadius: 23, marginRight: 12 },
  avatarPh: { backgroundColor: VINO, justifyContent: 'center', alignItems: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '800', fontSize: 18 },
  pName: { flex: 1, fontWeight: '800', fontSize: 15.5, color: '#241019' },
  heart: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: '#f0d3e0', backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  heartOn: { backgroundColor: VINO, borderColor: VINO },
  heartTxt: { fontSize: 18 },
  hint: { color: 'rgba(255,255,255,.6)', fontSize: 11.5, textAlign: 'center', marginTop: 6, marginBottom: 10 },
  btn: { backgroundColor: VINO, borderRadius: 30, paddingVertical: 16, alignItems: 'center', marginTop: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  btnDis: { opacity: 0.6 },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  help: { color: '#ffdff0', fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 10, paddingHorizontal: 6 },
  legend: { color: 'rgba(255,255,255,.7)', fontSize: 11.5, textAlign: 'center', marginBottom: 12 },
  item: { backgroundColor: '#fff', borderRadius: 15, padding: 11, marginBottom: 9 },
  itemTop: { flexDirection: 'row', alignItems: 'center' },
  itemLabel: { flex: 1, fontWeight: '700', fontSize: 13.5, color: '#241019' },
  chips: { flexDirection: 'row', gap: 6 },
  chip: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#f4eef1', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  chipOn: { borderColor: VINO, backgroundColor: '#fff0f6' },
  chipTxt: { fontSize: 19 },
  why: { marginTop: 11, paddingTop: 11, borderTopWidth: 1, borderTopColor: '#f0dde7' },
  whyQ: { fontSize: 12, color: VINO, fontWeight: '800', marginBottom: 8 },
  rChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rChip: { borderWidth: 1.5, borderColor: '#ecd7e2', backgroundColor: '#fff', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 11 },
  rChipOn: { backgroundColor: VINO, borderColor: VINO },
  rChipTxt: { fontSize: 12, color: '#7c5768', fontWeight: '600' },
  rChipTxtOn: { color: '#fff' },
  otraInput: { backgroundColor: '#faf3f7', borderWidth: 1, borderColor: '#ecd7e2', borderRadius: 10, padding: 10, fontSize: 13.5, color: '#241019', minHeight: 44, marginTop: 8, textAlignVertical: 'top' },
  volveriaQ: { fontWeight: '800', fontSize: 15, color: '#241019', marginBottom: 10, textAlign: 'center' },
  yesno: { flexDirection: 'row', gap: 10 },
  ynBtn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#f4eef1', borderWidth: 2, borderColor: 'transparent' },
  ynBtnYes: { backgroundColor: '#e9f8ee', borderColor: '#2e9c56' },
  ynBtnNo: { backgroundColor: '#fdecec', borderColor: '#d34b4b' },
  ynTxt: { fontWeight: '800', fontSize: 15, color: '#7c5768' },
  ynTxtOn: { color: '#241019' },
  comment: { backgroundColor: '#fff', borderRadius: 14, padding: 12, fontSize: 14, color: '#241019', minHeight: 64, marginTop: 12, marginBottom: 4, textAlignVertical: 'top' },
  doneWrap: { alignItems: 'center', paddingTop: 30 },
  boom: { fontSize: 46, marginBottom: 4 },
  matchTitle: { fontSize: 26, fontWeight: '900', color: '#fff', marginBottom: 8, textAlign: 'center' },
  matchSub: { color: 'rgba(255,255,255,.82)', fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 18, paddingHorizontal: 8 },
  matchCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 11, marginBottom: 10, width: '100%' },
  chatBtn: { backgroundColor: VINO, borderRadius: 20, paddingVertical: 9, paddingHorizontal: 16 },
  chatBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 13.5 },
  // Remate de la experiencia: los devuelve a la mesa despues del resultado.
  iceBreak: { backgroundColor: 'rgba(255,255,255,.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,.2)', borderRadius: 20, padding: 18, marginTop: 16, alignItems: 'center', width: '100%' },
  iceBreakIcon: { fontSize: 34 },
  iceBreakTitle: { fontSize: 18, fontWeight: '800', color: '#fff', marginTop: 6, marginBottom: 6, textAlign: 'center' },
  iceBreakSub: { fontSize: 13.5, color: 'rgba(255,255,255,.8)', lineHeight: 19, textAlign: 'center' },
  thanks: { color: 'rgba(255,255,255,.8)', fontSize: 12.5, marginTop: 12, textAlign: 'center' },
  btnGhost: { marginTop: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,.35)', borderRadius: 30, paddingVertical: 14, paddingHorizontal: 30 },
  btnGhostTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
