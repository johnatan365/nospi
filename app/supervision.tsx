import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
  Modal, RefreshControl, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { toque } from '@/lib/haptics';

// Supervision en vivo, pensada para mirar desde el telefono durante el evento.
//
// SOLO LEE. No entra a ningun chat ni escribe nada, asi que quien supervisa no
// aparece como participante, no cambia el numero de miembros del grupo ni los
// "no leidos" de nadie. Eso no es un detalle de esta pantalla: es como estan
// hechas las dos funciones que consulta, que solo hacen SELECT.

const REFRESCO_MS = 10000;

interface Mesa {
  event_id: string;
  mesa: string;
  ciudad: string | null;
  tipo: string | null;
  empieza: string;
  fase: string | null;
  pregunta_num: number | null;
  pregunta_nivel: string | null;
  pregunta: string | null;
  segundos_en_pregunta: number | null;
  personas: number;
  llegaron: number;
  conversation_id: string | null;
  mensajes: number;
  ultimo_mensaje: string | null;
}

interface MensajeSup {
  id: string;
  sender_id: string | null;
  autor: string;
  contenido: string | null;
  media_kind: string | null;
  media_expired: boolean | null;
  poll_id: string | null;
  created_at: string;
}

// El nombre interno del nivel del medio sigue siendo 'sensual'; hacia afuera
// siempre se dice "Coqueto".
const NIVELES: Record<string, string> = {
  divertido: 'Divertido',
  sensual: 'Coqueto',
  atrevido: 'Atrevido',
};

const FASES: Record<string, { texto: string; color: string }> = {
  intro: { texto: 'Aún no empiezan', color: '#9CA3AF' },
  ready: { texto: 'Listos para empezar', color: '#3B82F6' },
  rules: { texto: 'Explicando las reglas', color: '#3B82F6' },
  questions: { texto: 'En preguntas', color: '#10B981' },
  question_active: { texto: 'En preguntas', color: '#10B981' },
  level_transition: { texto: 'Cambiando de nivel', color: '#F59E0B' },
  closing_intro: { texto: 'Cerrando', color: '#F59E0B' },
  free_phase: { texto: 'Charla libre', color: '#8B5CF6' },
  finished: { texto: 'Terminó', color: '#6B7280' },
};

function faseDe(f: string | null) {
  return (f && FASES[f]) || { texto: f || 'Sin empezar', color: '#9CA3AF' };
}

function duracion(segundos: number | null): string | null {
  if (segundos == null || segundos < 0) return null;
  const m = Math.floor(segundos / 60);
  if (m < 1) return 'menos de un minuto';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota',
  });
}

function fechaLarga(d: Date): string {
  return d.toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Bogota',
  });
}

/** aaaa-mm-dd en Bogota, que es lo que espera la funcion de la base. */
function diaBogota(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

export default function SupervisionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [permitido, setPermitido] = useState<boolean | null>(null);
  const [dia, setDia] = useState(() => new Date());
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState('');
  const [actualizado, setActualizado] = useState<Date | null>(null);

  const [chatAbierto, setChatAbierto] = useState<Mesa | null>(null);
  const [mensajes, setMensajes] = useState<MensajeSup[]>([]);
  const [cargandoChat, setCargandoChat] = useState(false);

  // Se guarda en una referencia para que el temporizador no se reinicie en cada
  // pintada; si dependiera del estado, el intervalo se recrearia sin parar.
  const diaRef = useRef(dia);
  diaRef.current = dia;

  useEffect(() => {
    supabase.rpc('is_admin').then(({ data }) => setPermitido(!!data));
  }, []);

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    const { data, error: e } = await supabase.rpc('admin_get_live_dynamic', {
      p_date: diaBogota(diaRef.current),
    });
    if (e) setError(e.message);
    else { setError(''); setMesas((data as Mesa[]) || []); setActualizado(new Date()); }
    setCargando(false);
  }, []);

  useEffect(() => { if (permitido) cargar(); }, [permitido, dia, cargar]);

  // Refresco automatico: durante un evento el estado cambia solo, y estar
  // tirando de la pantalla para actualizar es justo lo que no se quiere cuando
  // se esta mirando de reojo.
  useEffect(() => {
    if (!permitido || chatAbierto) return;
    const id = setInterval(() => cargar(true), REFRESCO_MS);
    return () => clearInterval(id);
  }, [permitido, chatAbierto, cargar]);

  const abrirChat = useCallback(async (m: Mesa) => {
    if (!m.conversation_id) return;
    toque();
    setChatAbierto(m);
    setCargandoChat(true);
    setMensajes([]);
    const { data, error: e } = await supabase.rpc('admin_read_conversation', {
      p_conversation_id: m.conversation_id,
      p_limit: 200,
    });
    if (!e) {
      // La funcion devuelve del mas nuevo al mas viejo para poder limitar bien;
      // aqui se voltea para leer la conversacion en su orden natural.
      setMensajes(((data as MensajeSup[]) || []).slice().reverse());
    }
    setCargandoChat(false);
  }, []);

  if (permitido === null) {
    return (
      <LinearGradient colors={['#1a0010', '#880E4F']} style={estilos.centro}>
        <ActivityIndicator color="#FFF" size="large" />
      </LinearGradient>
    );
  }

  if (!permitido) {
    return (
      <LinearGradient colors={['#1a0010', '#880E4F']} style={estilos.centro}>
        <Text style={estilos.vacioTitulo}>Esta pantalla es solo para administradores.</Text>
        <TouchableOpacity style={estilos.botonVolver} onPress={() => router.back()}>
          <Text style={estilos.botonVolverTexto}>Volver</Text>
        </TouchableOpacity>
      </LinearGradient>
    );
  }

  const esHoy = diaBogota(dia) === diaBogota(new Date());

  return (
    <LinearGradient colors={['#1a0010', '#5c0a34', '#880E4F']} style={{ flex: 1 }}>
      <View style={[estilos.cabecera, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => { toque(); router.back(); }} style={estilos.iconoAtras}>
          <Ionicons name="chevron-back" size={26} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={estilos.titulo}>Supervisión</Text>
          <Text style={estilos.subtitulo}>
            {actualizado
              ? `Actualizado ${hora(actualizado.toISOString())}${esHoy ? ' · se refresca solo' : ''}`
              : 'Cargando…'}
          </Text>
        </View>
      </View>

      <View style={estilos.barraDia}>
        <TouchableOpacity
          onPress={() => { toque(); setDia(d => new Date(d.getTime() - 86400000)); }}
          style={estilos.flecha}
        >
          <Ionicons name="chevron-back" size={18} color="#FFF" />
        </TouchableOpacity>
        <Text style={estilos.diaTexto}>{esHoy ? 'Hoy' : fechaLarga(dia)}</Text>
        <TouchableOpacity
          onPress={() => { toque(); setDia(d => new Date(d.getTime() + 86400000)); }}
          style={estilos.flecha}
        >
          <Ionicons name="chevron-forward" size={18} color="#FFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            tintColor="#FFF"
            onRefresh={async () => { setRefrescando(true); await cargar(true); setRefrescando(false); }}
          />
        }
      >
        {cargando ? (
          <ActivityIndicator color="#FFF" style={{ marginTop: 40 }} />
        ) : error ? (
          <Text style={estilos.error}>{error}</Text>
        ) : mesas.length === 0 ? (
          <View style={estilos.vacio}>
            <Text style={estilos.vacioTitulo}>No hay eventos {esHoy ? 'hoy' : 'ese día'}.</Text>
            <Text style={estilos.vacioTexto}>Usa las flechas para mirar otro día.</Text>
          </View>
        ) : (
          mesas.map(m => {
            const f = faseDe(m.fase);
            const tiempo = duracion(m.segundos_en_pregunta);
            const nivel = m.pregunta_nivel ? (NIVELES[m.pregunta_nivel] || m.pregunta_nivel) : null;
            return (
              <View key={m.event_id} style={estilos.tarjeta}>
                <View style={estilos.filaTitulo}>
                  <Text style={estilos.mesa} numberOfLines={2}>{m.mesa}</Text>
                  <View style={[estilos.insignia, { backgroundColor: f.color }]}>
                    <Text style={estilos.insigniaTexto}>{f.texto}</Text>
                  </View>
                </View>

                <Text style={estilos.gente}>
                  {m.llegaron} de {m.personas} llegaron · empieza {hora(m.empieza)}
                </Text>

                {m.pregunta ? (
                  <View style={estilos.bloquePregunta}>
                    <Text style={estilos.preguntaEtiqueta}>
                      Pregunta {(m.pregunta_num ?? 0) + 1}{nivel ? ` · ${nivel}` : ''}
                    </Text>
                    <Text style={estilos.preguntaTexto}>{m.pregunta}</Text>
                    {tiempo && <Text style={estilos.preguntaTiempo}>Llevan {tiempo} en esta</Text>}
                  </View>
                ) : (
                  <View style={estilos.bloquePregunta}>
                    <Text style={estilos.preguntaTiempo}>Todavía no hay pregunta en curso.</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[estilos.botonChat, !m.conversation_id && estilos.botonChatApagado]}
                  onPress={() => abrirChat(m)}
                  disabled={!m.conversation_id}
                >
                  <Ionicons name="chatbubbles-outline" size={17} color={m.conversation_id ? '#880E4F' : '#B9A3AE'} />
                  <Text style={[estilos.botonChatTexto, !m.conversation_id && { color: '#B9A3AE' }]}>
                    {!m.conversation_id
                      ? 'Sin chat de grupo'
                      : m.mensajes === 0
                        ? 'Chat vacío'
                        : `Ver chat · ${m.mensajes} mensaje${m.mensajes === 1 ? '' : 's'}`}
                  </Text>
                  {!!m.ultimo_mensaje && (
                    <Text style={estilos.botonChatHora}>{hora(m.ultimo_mensaje)}</Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal
        visible={!!chatAbierto}
        animationType="slide"
        onRequestClose={() => setChatAbierto(null)}
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      >
        <View style={estilos.modal}>
          <View style={[estilos.modalCabecera, { paddingTop: Platform.OS === 'ios' ? 16 : insets.top + 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={estilos.modalTitulo} numberOfLines={1}>{chatAbierto?.mesa}</Text>
              <Text style={estilos.modalSubtitulo}>Solo lectura · no aparecías en este grupo</Text>
            </View>
            <TouchableOpacity onPress={() => { toque(); setChatAbierto(null); }} style={estilos.cerrar}>
              <Ionicons name="close" size={24} color="#4B5563" />
            </TouchableOpacity>
          </View>

          {cargandoChat ? (
            <ActivityIndicator color="#880E4F" style={{ marginTop: 40 }} />
          ) : mensajes.length === 0 ? (
            <View style={estilos.vacio}>
              <Text style={[estilos.vacioTitulo, { color: '#374151' }]}>Todavía no han escrito nada.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
              {mensajes.map(msg => (
                <View key={msg.id} style={estilos.mensaje}>
                  <View style={estilos.mensajeFila}>
                    <Text style={estilos.mensajeAutor}>{msg.autor}</Text>
                    <Text style={estilos.mensajeHora}>{hora(msg.created_at)}</Text>
                  </View>
                  {msg.poll_id ? (
                    <Text style={estilos.mensajeAdjunto}>📊 Encuesta</Text>
                  ) : msg.media_kind ? (
                    <Text style={estilos.mensajeAdjunto}>
                      {msg.media_expired
                        ? '🗑️ Archivo ya borrado por antigüedad'
                        : msg.media_kind === 'audio' ? '🎤 Nota de voz'
                        : msg.media_kind === 'video' ? '🎬 Video' : '📷 Foto'}
                      {msg.contenido ? ` · ${msg.contenido}` : ''}
                    </Text>
                  ) : (
                    <Text style={estilos.mensajeTexto}>{msg.contenido}</Text>
                  )}
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>
    </LinearGradient>
  );
}

const estilos = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  cabecera: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, gap: 6 },
  iconoAtras: { padding: 6 },
  titulo: { color: '#FFF', fontSize: 22, fontWeight: '700' },
  subtitulo: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 1 },

  barraDia: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14,
    paddingBottom: 10,
  },
  flecha: { padding: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.12)' },
  diaTexto: { color: '#FFF', fontSize: 14, fontWeight: '600', minWidth: 150, textAlign: 'center' },

  tarjeta: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 14 },
  filaTitulo: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  mesa: { flex: 1, fontSize: 16, fontWeight: '700', color: '#1F2937' },
  insignia: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  insigniaTexto: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  gente: { color: '#6B7280', fontSize: 13, marginTop: 5 },

  bloquePregunta: {
    marginTop: 12, backgroundColor: '#FAF5F8', borderRadius: 10, padding: 12,
    borderLeftWidth: 3, borderLeftColor: '#880E4F',
  },
  preguntaEtiqueta: { color: '#880E4F', fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  preguntaTexto: { color: '#1F2937', fontSize: 15, marginTop: 4, lineHeight: 21 },
  preguntaTiempo: { color: '#6B7280', fontSize: 12, marginTop: 6 },

  botonChat: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12,
    backgroundColor: '#FAF5F8', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 13,
  },
  botonChatApagado: { backgroundColor: '#F5F5F5' },
  botonChatTexto: { flex: 1, color: '#880E4F', fontSize: 14, fontWeight: '600' },
  botonChatHora: { color: '#9CA3AF', fontSize: 12 },

  vacio: { alignItems: 'center', paddingVertical: 50, paddingHorizontal: 24, gap: 6 },
  vacioTitulo: { color: '#FFF', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  vacioTexto: { color: 'rgba(255,255,255,0.65)', fontSize: 13, textAlign: 'center' },
  error: { color: '#FFD5E4', fontSize: 14, textAlign: 'center', marginTop: 30 },

  botonVolver: {
    marginTop: 18, backgroundColor: '#FFF', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 26,
  },
  botonVolverTexto: { color: '#880E4F', fontWeight: '700', fontSize: 15 },

  modal: { flex: 1, backgroundColor: '#FFF' },
  modalCabecera: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#EEE',
  },
  modalTitulo: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
  modalSubtitulo: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  cerrar: { padding: 6 },

  mensaje: { marginBottom: 14 },
  mensajeFila: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  mensajeAutor: { fontSize: 13, fontWeight: '700', color: '#880E4F' },
  mensajeHora: { fontSize: 11, color: '#9CA3AF' },
  mensajeTexto: { fontSize: 15, color: '#1F2937', marginTop: 2, lineHeight: 21 },
  mensajeAdjunto: { fontSize: 14, color: '#6B7280', marginTop: 2, fontStyle: 'italic' },
});
