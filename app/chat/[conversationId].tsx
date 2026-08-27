import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { nospiColors } from '@/constants/Colors';
import { useSupabase } from '@/contexts/SupabaseContext';
import { supabase } from '@/lib/supabase';
import { IconSymbol } from '@/components/IconSymbol';
import * as ImagePicker from 'expo-image-picker';
import {
  useAudioRecorder,
  useAudioPlayer,
  useAudioPlayerStatus,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  IOSOutputFormat,
  AudioQuality,
  type RecordingOptions,
} from 'expo-audio';
import { WebVoiceRecorder } from '@/lib/voiceRecorder';
import * as FileSystem from 'expo-file-system';
import * as WebBrowser from 'expo-web-browser';
import * as Sharing from 'expo-sharing';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase';

// Prefijo para guardar el borrador (lo que se está escribiendo pero aún no se
// envía) por conversación, para que no se pierda al salir y volver al chat.
const DRAFT_KEY = (id?: string) => `chat_draft_${id}`;

const NOSPI_SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000099';

// Bucket PRIVADO de fotos y videos del chat. No se puede abrir por URL
// directa: cada archivo se sirve con un enlace firmado que solo se le entrega
// a los participantes de la conversacion (politica en storage.objects) y que
// caduca. Ruta de cada archivo: <conversation_id>/<sender_id>/<archivo>.
const MEDIA_BUCKET = 'chat-media';
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hora

// Columnas que necesita la pantalla. Se centraliza para que la carga inicial y
// el insert al enviar devuelvan exactamente lo mismo.
const MESSAGE_COLUMNS =
  'id, conversation_id, sender_id, content, created_at, reply_to, media_path, media_kind, media_mime, media_width, media_height, media_size, media_duration, poll_id, pinned_at, pinned_by, media_expired';

// Tope por archivo, igual al que tiene el bucket. Se comprueba tambien aqui
// para poder explicarlo con palabras en vez de soltar el error crudo de Storage.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// Las fotos y videos se borran solos al mes; las notas de voz se quedan.
const MEDIA_RETENTION_DAYS = 30;

// Ancho maximo de una foto/video dentro de la burbuja. La altura se calcula
// con la proporcion real del archivo para que no se vea deformado.
const MEDIA_MAX_WIDTH = 210;
const MEDIA_MAX_HEIGHT = 320;

// "12,4 MB" a partir de los bytes, para poder decirle cuanto pesa de mas.
function formatMB(bytes?: number | null): string {
  return `${((bytes ?? 0) / (1024 * 1024)).toFixed(1)} MB`;
}

function mediaBoxSize(width?: number | null, height?: number | null) {
  if (!width || !height || width <= 0 || height <= 0) {
    return { width: MEDIA_MAX_WIDTH, height: MEDIA_MAX_WIDTH };
  }
  const scaled = (MEDIA_MAX_WIDTH * height) / width;
  if (scaled <= MEDIA_MAX_HEIGHT) return { width: MEDIA_MAX_WIDTH, height: Math.round(scaled) };
  return { width: Math.round((MEDIA_MAX_HEIGHT * width) / height), height: MEDIA_MAX_HEIGHT };
}

// Extension y tipo MIME del archivo tal como lo entrega el selector. No se
// recomprime ni se redimensiona nada: lo que se sube es el original.
function mediaFileInfo(asset: ImagePicker.ImagePickerAsset) {
  const kind: 'image' | 'video' = asset.type === 'video' ? 'video' : 'image';
  const fromName = (asset.fileName || '').split('.').pop() || '';
  let ext = fromName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!ext) ext = kind === 'video' ? 'mp4' : 'jpg';
  let mime = asset.mimeType || '';
  if (!mime) {
    if (kind === 'video') mime = ext === 'mov' ? 'video/quicktime' : `video/${ext}`;
    else mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  }
  return { kind, ext, mime };
}

// Nombre con el que se guarda o comparte el archivo.
function mediaFileName(path?: string | null, kind?: string | null): string {
  const base = (path || '').split('/').pop() || '';
  if (base) return base;
  return kind === 'video' ? 'video-nospi.mp4' : 'foto-nospi.jpg';
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  reply_to?: string | null;
  media_path?: string | null;
  media_kind?: 'image' | 'video' | 'audio' | null;
  media_mime?: string | null;
  media_width?: number | null;
  media_height?: number | null;
  media_size?: number | null;
  media_duration?: number | null;
  // Si viene, el mensaje es una encuesta y se dibuja como tarjeta votable.
  poll_id?: string | null;
  // Su foto o video ya se borro por antiguedad (30 dias).
  media_expired?: boolean | null;
  // Mensaje fijado: se muestra en la banda de arriba del chat.
  pinned_at?: string | null;
  pinned_by?: string | null;
}

interface Participant {
  user_id: string;
  name: string;
  profile_photo_url: string | null;
}

interface ConversationMeta {
  conv_type: 'event_group' | 'direct' | 'channel_global' | 'channel_event';
  event_name: string | null;
  event_type: string | null;
  event_date: string | null;
  other_user_name: string | null;
  other_user_photo: string | null;
  // Solo en canales: si la gente puede responder, y el nombre del canal.
  replies_open?: boolean | null;
  channel_title?: string | null;
}

function eventEmoji(eventType: string | null | undefined): string {
  return eventType === 'bar' ? '🍸' : eventType === 'caminata' ? '🚶' : eventType === 'cafe' ? '☕' : eventType === 'bolos' ? '🎳' : '🍽️';
}

// Mismos íconos PNG que usa la pestaña de Eventos. El require debe ser estático
// (literal) para que Metro lo empaquete; por eso se resuelve con un switch.
function eventIconSource(eventType: string | null | undefined) {
  switch (eventType) {
    case 'caminata': return require('@/assets/images/icon-caminata.png');
    case 'bar': return require('@/assets/images/icon-bar.png');
    case 'cafe': return require('@/assets/images/icon-cafe.png');
    case 'bolos': return require('@/assets/images/icon-bolos.png');
    default: return require('@/assets/images/icon-restaurante.png');
  }
}

// Mismo criterio que en la lista de Chat: el grupo se habilita 30 min antes
// del evento. Este guard evita que alguien entre directo por link/deeplink
// antes de esa ventana (la fila ya aparece bloqueada en la lista, pero un
// link directo se salta esa pantalla).
const CHAT_UNLOCK_MINUTES_BEFORE = 30;
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

function formatBogotaTime(date: Date): string {
  const bogota = new Date(date.getTime() - BOGOTA_OFFSET_MS);
  let h = bogota.getUTCHours();
  const m = bogota.getUTCMinutes();
  const suffix = h >= 12 ? 'p.m.' : 'a.m.';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${suffix}`;
}

// Texto corto que representa un mensaje cuando se cita o se responde. Un
// mensaje solo de foto/video no tiene texto, asi que se muestra la etiqueta.
function messagePreviewText(m: Message): string {
  if (m.media_expired) {
    return m.media_kind === 'video' ? '🎥 Video no disponible' : '📷 Foto no disponible';
  }
  const label = m.media_kind === 'video' ? '🎥 Video'
    : m.media_kind === 'image' ? '📷 Foto'
    : m.media_kind === 'audio' ? '🎤 Nota de voz'
    : '';
  const text = (m.content || '').trim();
  if (label && text) return `${label} ${text}`;
  return label || text;
}

function initialsOf(name?: string | null): string {
  return (name || '?').trim().charAt(0).toUpperCase() || '?';
}

// Avatar de usuario con respaldo: si no hay foto o si la foto FALLA al cargar
// (onError), muestra la inicial del nombre en un círculo, en vez de quedar en
// blanco. Esto arregla el "a veces carga, a veces no" de las fotos del chat.
function ChatAvatar({
  uri, name, size, marginRight = 0, onPress,
}: { uri: string | null; name: string; size: number; marginRight?: number; onPress?: () => void }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: size / 2, marginRight } as const;
  const inner = uri && !failed ? (
    // cache 'force-cache': una vez descargada, la foto se reusa desde el cache
    // (no se vuelve a bajar al salir y volver al chat) -> queda estática.
    <ExpoImage source={{ uri }} style={box} cachePolicy="memory-disk" transition={0} onError={() => setFailed(true)} />
  ) : (
    <View style={[box, styles.avatarInitials]}>
      <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: size * 0.42 }}>{initialsOf(name)}</Text>
    </View>
  );
  if (onPress) {
    return <TouchableOpacity onPress={onPress} activeOpacity={0.8}>{inner}</TouchableOpacity>;
  }
  return inner;
}

// Detecta URLs (http/https o que empiecen por www.) para poder abrirlas al tocar.
const URL_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

// Convierte el texto de un mensaje en <Text> normal + <Text> tocables para los
// links. Se abren con Linking.openURL (navegador / app correspondiente).
// Compara sin tildes ni mayusculas, para que "@jose" encuentre a "José".
function normalizeText(t: string) {
  return (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// Escapa un nombre para poder meterlo dentro de una expresion regular.
function escapeRe(t: string) {
  return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Arma la expresion que reconoce las menciones de este chat a partir de los
// nombres reales de los participantes (los nombres traen espacios, por eso no
// sirve un simple \S+). Los mas largos van primero para que "Ana Maria" gane
// sobre "Ana".
function mentionRegex(names: string[]): RegExp | null {
  const clean = names.filter(Boolean).sort((a, b) => b.length - a.length).map(escapeRe);
  if (clean.length === 0) return null;
  return new RegExp(`(@(?:${clean.join('|')}|todos))`, 'gi');
}

function renderMessageContent(text: string, mine: boolean, mentions?: RegExp | null) {
  if (!text) return null;
  const parts = text.split(URL_RE);
  return parts.map((part, i) => {
    if (!part) return null;
    if (/^(https?:\/\/|www\.)/i.test(part)) {
      const url = part.startsWith('www.') ? `https://${part}` : part;
      return (
        <Text
          key={i}
          style={[styles.linkText, mine && styles.linkTextMine]}
          onPress={() => { Linking.openURL(url).catch(() => {}); }}
        >
          {part}
        </Text>
      );
    }
    if (mentions) {
      // El split conserva los grupos capturados, asi que las menciones quedan
      // en las posiciones impares del arreglo.
      const chunks = part.split(mentions);
      if (chunks.length > 1) {
        return (
          <Text key={i}>
            {chunks.map((c, j) =>
              j % 2 === 1
                ? <Text key={j} style={[styles.mentionText, mine && styles.mentionTextMine]}>{c}</Text>
                : <Text key={j}>{c}</Text>
            )}
          </Text>
        );
      }
    }
    return <Text key={i}>{part}</Text>;
  });
}

// Envuelve cada mensaje para permitir DESLIZAR hacia la derecha y responder,
// igual que WhatsApp. Al arrastrar aparece una flecha ↩︎ y, si se pasa del
// umbral, se activa el responder al soltar. En web el arrastre con mouse es
// incomodo, asi que alli la via principal sigue siendo mantener presionado.
// Los 6 emojis de reaccion rapida, iguales a los de WhatsApp.
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

// Alto de pantalla, para decidir si el menu de acciones se abre hacia arriba o
// hacia abajo del mensaje presionado.
const SCREEN_H = Dimensions.get('window').height;

function SwipeToReply({ children, onReply }: { children: React.ReactNode; onReply: () => void }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const activated = useRef(false);
  const THRESHOLD = 55;
  const MAX = 80;

  const panResponder = useRef(
    PanResponder.create({
      // Solo capturamos gestos claramente horizontales hacia la derecha, para
      // no robarle el scroll vertical a la lista de mensajes.
      onMoveShouldSetPanResponder: (_e, g) =>
        g.dx > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
      onPanResponderMove: (_e, g) => {
        if (g.dx < 0) return;
        translateX.setValue(Math.min(g.dx, MAX));
        activated.current = g.dx >= THRESHOLD;
      },
      onPanResponderRelease: () => {
        const fire = activated.current;
        activated.current = false;
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
        if (fire) onReply();
      },
      onPanResponderTerminate: () => {
        activated.current = false;
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  return (
    // flexShrink + maxWidth:'100%' para que este contenedor NO crezca mas alla
    // del ancho disponible: si crece, el maxWidth porcentual de la burbuja se
    // calcula sobre un contenedor sin limite y los mensajes largos se salen de
    // la pantalla. alignItems hereda el lado (izquierda/derecha) del mensaje.
    <View style={{ position: 'relative', justifyContent: 'center', flexShrink: 1, maxWidth: '78%' }}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute', left: 10, opacity: translateX.interpolate({
            inputRange: [0, THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp',
          }),
        }}
      >
        <Text style={{ fontSize: 18 }}>↩︎</Text>
      </Animated.View>
      <Animated.View
        style={{ transform: [{ translateX }], flexShrink: 1, maxWidth: '100%' }}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

// Ajustes de grabacion pensados para VOZ, no para musica: mono y 32 kbps.
// El preset de alta calidad de la libreria graba en estereo a 128 kbps, que
// pesa cuatro veces mas y no se oye mejor hablando.
const VOICE_RECORDING: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 24000,
  numberOfChannels: 1,
  bitRate: 32000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.LOW,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 32000 },
};

// Velocidades de reproduccion, como en WhatsApp.
const PLAYBACK_RATES = [1, 1.5, 2] as const;

// Formatea segundos como 0:07 / 1:23, igual que WhatsApp.
function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Burbuja de nota de voz: boton de reproducir, barra de progreso y duracion.
// La URL llega firmada (el bucket es privado), asi que puede tardar un momento
// en estar lista; mientras tanto se muestra el boton deshabilitado.
function VoiceNote({ uri, duration, mine }: { uri: string | null; duration?: number | null; mine: boolean }) {
  const player = useAudioPlayer(uri ? { uri } : null);
  const status = useAudioPlayerStatus(player);

  const total = status?.duration || duration || 0;
  const current = status?.currentTime || 0;
  const playing = !!status?.playing;
  const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0;

  const [rateIndex, setRateIndex] = useState(0);
  const rate = PLAYBACK_RATES[rateIndex];

  const toggle = () => {
    if (!uri) return;
    if (playing) {
      player.pause();
    } else {
      // Al terminar, la posicion queda al final: se rebobina antes de repetir.
      if (total > 0 && current >= total - 0.15) player.seekTo(0);
      player.play();
    }
  };

  // La velocidad se reaplica en cada cambio y tambien al empezar a sonar: si
  // se fija con el audio en pausa, algunos navegadores la olvidan.
  const cycleRate = () => {
    const next = (rateIndex + 1) % PLAYBACK_RATES.length;
    setRateIndex(next);
    try {
      player.setPlaybackRate(PLAYBACK_RATES[next], 'high');
    } catch {
      // Si no se puede cambiar, se sigue oyendo a velocidad normal.
    }
  };

  useEffect(() => {
    if (!playing) return;
    try {
      player.setPlaybackRate(rate, 'high');
    } catch {
      // sin soporte de velocidad: se ignora
    }
  }, [playing, rate]);

  return (
    <View style={styles.voiceRow}>
      <TouchableOpacity onPress={toggle} disabled={!uri} style={styles.voiceButton} activeOpacity={0.7}>
        {!uri ? (
          <ActivityIndicator size="small" color={mine ? '#FFFFFF' : nospiColors.purpleDark} />
        ) : (
          <IconSymbol
            ios_icon_name={playing ? 'pause.fill' : 'play.fill'}
            android_material_icon_name={playing ? 'pause' : 'play-arrow'}
            size={19}
            color={mine ? '#FFFFFF' : nospiColors.purpleDark}
          />
        )}
      </TouchableOpacity>
      <View style={styles.voiceBody}>
        <View style={[styles.voiceTrack, mine && styles.voiceTrackMine]}>
          <View style={[styles.voiceFill, mine && styles.voiceFillMine, { width: `${pct}%` }]} />
        </View>
        <View style={styles.voiceFooter}>
          <Text style={[styles.voiceTime, mine && styles.voiceTimeMine]}>
            {formatDuration(playing || current > 0 ? current : total)}
          </Text>
          <TouchableOpacity
            onPress={cycleRate}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={[styles.voiceRate, mine && styles.voiceRateMine, rate === 1 && styles.voiceRateOff]}
          >
            <Text style={[styles.voiceRateText, mine && styles.voiceRateTextMine]}>
              {rate === 1 ? '1x' : `${rate}x`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// Tarjeta de encuesta dentro del chat. Se puede responder aunque el canal este
// en solo lectura: la unica condicion es pertenecer a la conversacion y que la
// encuesta siga abierta. Antes de votar solo se ve la pregunta; los resultados
// aparecen despues de responder (o si ya esta cerrada), para no sesgar el voto.
function PollCard({ pollId }: { pollId: string }) {
  const [data, setData] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data: r, error } = await supabase.rpc('get_poll_results', { p_poll_id: pollId });
    if (!error && r) setData(r);
  }, [pollId]);

  useEffect(() => { load(); }, [load]);

  const vote = async (optionIndex: number | null, rating: number | null) => {
    if (saving) return;
    setSaving(true);
    try {
      const { data: r, error } = await supabase.rpc('vote_poll', {
        p_poll_id: pollId,
        p_option_index: optionIndex,
        p_rating: rating,
      });
      if (error) {
        const msg = 'No se pudo registrar tu respuesta. ' + (error.message || '');
        if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Encuesta', msg);
        return;
      }
      if (r) setData(r);
    } finally {
      setSaving(false);
    }
  };

  if (!data) {
    return <Text style={styles.pollLoading}>Cargando encuesta…</Text>;
  }

  const isRating = data.kind === 'rating';
  const counts: Record<string, number> = data.counts || {};
  const total: number = data.total || 0;
  const answered = isRating ? data.my_rating != null : data.my_option != null;
  const showResults = answered || data.closed;

  return (
    <View style={styles.pollCard}>
      <Text style={styles.pollQuestion}>{isRating ? '⭐' : '📊'} {data.question}</Text>

      {isRating ? (
        <View style={styles.pollStarsRow}>
          {[1, 2, 3, 4, 5].map((star) => {
            const on = (data.my_rating || 0) >= star;
            return (
              <TouchableOpacity
                key={star}
                onPress={() => vote(null, star)}
                disabled={data.closed || saving}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <Text style={[styles.pollStar, on && styles.pollStarOn, data.closed && styles.pollStarDisabled]}>
                  {on ? '★' : '☆'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View>
          {(data.options || []).map((opt: string, i: number) => {
            const mine = data.my_option === i;
            const n = counts[String(i)] || 0;
            const pct = total > 0 ? Math.round((n / total) * 100) : 0;
            return (
              <TouchableOpacity
                key={i}
                onPress={() => vote(i, null)}
                disabled={data.closed || saving}
                activeOpacity={0.75}
                style={[styles.pollOption, mine && styles.pollOptionMine]}
              >
                {showResults && <View style={[styles.pollOptionFill, { width: `${pct}%` }]} />}
                <Text style={[styles.pollOptionText, mine && styles.pollOptionTextMine]} numberOfLines={3}>
                  {mine ? '● ' : '○ '}{opt}
                </Text>
                {showResults && <Text style={styles.pollOptionPct}>{pct}%</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <Text style={styles.pollFooter}>
        {isRating && showResults && data.average != null
          ? `Promedio ${Number(data.average).toFixed(1)} · `
          : ''}
        {total} {total === 1 ? 'respuesta' : 'respuestas'}
        {data.anonymous ? ' · anónima' : ''}
        {data.closed ? ' · cerrada' : answered ? ' · puedes cambiar tu respuesta' : ''}
      </Text>
    </View>
  );
}

export default function ChatThreadScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { user } = useSupabase();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<Message[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [meta, setMeta] = useState<ConversationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  // Menu de acciones al mantener presionado un mensaje (Responder / Copiar).
  // Antes "responder" solo existia como gesto oculto de mantener presionado,
  // asi que mucha gente no sabia que se podia.
  const [actionMsg, setActionMsg] = useState<Message | null>(null);
  // Posicion en pantalla de la burbuja presionada, para abrir el menu JUNTO a
  // ella (como WhatsApp) en vez de pegado al fondo de la pantalla.
  const [actionAnchor, setActionAnchor] = useState<{ y: number; height: number; isMine: boolean } | null>(null);
  const bubbleRefs = useRef<Record<string, any>>({});

  // Reacciones con emoji por mensaje. Se guardan en chat_message_reactions
  // (una por persona y mensaje) y llegan en tiempo real a todos.
  const [reactions, setReactions] = useState<Record<string, { emoji: string; user_id: string }[]>>({});

  const loadReactions = useCallback(async () => {
    if (!conversationId) return;
    const { data, error } = await supabase
      .from('chat_message_reactions')
      .select('message_id, emoji, user_id')
      .eq('conversation_id', conversationId);
    if (error) { console.error('loadReactions:', error.message); return; }
    const map: Record<string, { emoji: string; user_id: string }[]> = {};
    for (const r of data || []) {
      (map[r.message_id] ||= []).push({ emoji: r.emoji, user_id: r.user_id });
    }
    setReactions(map);
  }, [conversationId]);

  // Toca un emoji: si ya tenia ese mismo, lo quita; si tenia otro, lo cambia.
  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user?.id || !conversationId) return;
    const mine = (reactions[messageId] || []).find(r => r.user_id === user.id);

    // Actualizacion optimista para que se sienta inmediato.
    setReactions(prev => {
      const list = (prev[messageId] || []).filter(r => r.user_id !== user.id);
      if (!mine || mine.emoji !== emoji) list.push({ emoji, user_id: user.id });
      return { ...prev, [messageId]: list };
    });

    try {
      if (mine && mine.emoji === emoji) {
        await supabase.from('chat_message_reactions')
          .delete().eq('message_id', messageId).eq('user_id', user.id);
      } else {
        await supabase.from('chat_message_reactions')
          .upsert(
            { message_id: messageId, conversation_id: conversationId, user_id: user.id, emoji },
            { onConflict: 'message_id,user_id' }
          );
      }
    } catch (e) {
      console.error('toggleReaction:', e);
      loadReactions(); // si falla, volvemos al estado real
    }
  }, [user, conversationId, reactions, loadReactions]);

  // Fijar / quitar de fijados. Cualquiera del chat puede, pero lo que fija el
  // equipo de Nospi solo lo quita el equipo (regla del servidor).
  const togglePinned = useCallback(async (m: Message | null) => {
    if (!m) return;
    const willPin = !m.pinned_at;
    const { error } = await supabase.rpc('set_message_pinned', {
      p_message_id: m.id,
      p_pinned: willPin,
    });
    if (error) {
      const msg = error.message?.includes('equipo de Nospi')
        ? 'Este mensaje lo fijó el equipo de Nospi, así que solo ellos pueden quitarlo.'
        : 'No se pudo ' + (willPin ? 'fijar' : 'quitar de fijados') + ' el mensaje.';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Mensajes fijados', msg);
      return;
    }
    setMessages(prev => prev.map(x => x.id === m.id
      ? { ...x, pinned_at: willPin ? new Date().toISOString() : null, pinned_by: willPin ? (user?.id ?? null) : null }
      : x));
  }, [user?.id]);

  const copyMessageText = useCallback(async (m: Message | null) => {
    const txt = (m?.content || '').trim();
    if (!txt) return;
    try {
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          await navigator.clipboard.writeText(txt);
        }
      } else {
        // Clipboard nativo de React Native (no requiere instalar dependencias
        // nuevas ni recompilar con un modulo adicional).
        const { Clipboard } = require('react-native');
        Clipboard.setString(txt);
      }
    } catch (e) {
      console.error('copyMessageText error:', e);
    }
  }, []);
  const [showParticipants, setShowParticipants] = useState(false);
  const [startingChatWith, setStartingChatWith] = useState<string | null>(null);
  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null);
  const [zoomedFileName, setZoomedFileName] = useState<string>('foto-nospi.jpg');
  // Enlaces firmados de las fotos/videos, por ruta del archivo en el bucket.
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  // Archivo sobre el que se abrio el menu de Descargar / Compartir.
  const [mediaActions, setMediaActions] = useState<{ url: string; kind: 'image' | 'video'; filename: string } | null>(null);
  const [busyAction, setBusyAction] = useState<null | 'download' | 'share'>(null);
  // Adjuntos elegidos que todavia NO se han enviado: se quedan en la bandeja
  // hasta que la persona toca el boton de enviar.
  const [pendingAssets, setPendingAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [uploading, setUploading] = useState<{ kind: 'image' | 'video'; current: number; total: number } | null>(null);
  const listRef = useRef<FlatList<Message>>(null);
  // Rutas para las que ya se pidio firma, para no volver a pedirlas en cada
  // render (y para no entrar en bucle si alguna falla).
  const signRequestedRef = useRef<Set<string>>(new Set());

  const participantsById = participants.reduce<Record<string, Participant>>((acc, p) => {
    acc[p.user_id] = p;
    return acc;
  }, {});

  // El equipo de Nospi puede escribir en un canal aunque este cerrado.
  const [isAdminUser, setIsAdminUser] = useState(false);
  useEffect(() => {
    let alive = true;
    supabase.rpc('is_admin').then(({ data }) => { if (alive) setIsAdminUser(!!data); });
    return () => { alive = false; };
  }, [user?.id]);

  const loadEverything = useCallback(async () => {
    if (!conversationId || !user?.id) return;

    const [{ data: msgs, error: msgsError }, { data: parts, error: partsError }, { data: convs }] =
      await Promise.all([
        supabase
          .from('chat_messages')
          .select(MESSAGE_COLUMNS)
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true }),
        supabase.rpc('get_conversation_participants', { p_conversation_id: conversationId }),
        supabase.rpc('get_my_conversations'),
      ]);

    if (msgsError) console.error('ChatThread: error loading messages', msgsError);
    if (partsError) console.error('ChatThread: error loading participants', partsError);

    setMessages((msgs as Message[]) || []);
    setParticipants((parts as Participant[]) || []);

    const thisConv = (convs || []).find((c: any) => c.conversation_id === conversationId);
    if (thisConv) {
      setMeta({
        conv_type: thisConv.conv_type,
        event_name: thisConv.event_name,
        event_type: thisConv.event_type,
        event_date: thisConv.event_date,
        other_user_name: thisConv.other_user_name,
        other_user_photo: thisConv.other_user_photo,
        replies_open: thisConv.replies_open,
        channel_title: thisConv.channel_title,
      });
    }

    setLoading(false);
    await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
  }, [conversationId, user]);

  useEffect(() => {
    loadEverything();
  }, [loadEverything]);

  // Pide enlaces firmados para las fotos/videos que todavia no tienen uno.
  // El bucket es privado, asi que sin esto la imagen no carga. La firma la
  // autoriza la politica de storage: solo si eres participante del chat.
  useEffect(() => {
    const pending = Array.from(
      new Set(
        messages
          // Los caducados ya no tienen archivo detras: pedir su enlace seria
          // una peticion condenada a fallar en cada carga del chat.
          .filter((m) => !m.media_expired)
          .map((m) => m.media_path)
          .filter((path): path is string => !!path && !signRequestedRef.current.has(path))
      )
    );
    if (pending.length === 0) return;
    pending.forEach((path) => signRequestedRef.current.add(path));

    let active = true;
    supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrls(pending, SIGNED_URL_TTL_SECONDS)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error('ChatThread: error firmando media', error);
          // Se permite reintentar en la proxima carga del chat.
          pending.forEach((path) => signRequestedRef.current.delete(path));
          return;
        }
        setSignedUrls((prev) => {
          const next = { ...prev };
          (data || []).forEach((item: any) => {
            if (item?.path && item?.signedUrl) next[item.path] = item.signedUrl;
          });
          return next;
        });
      })
      .catch(() => {
        pending.forEach((path) => signRequestedRef.current.delete(path));
      });

    return () => { active = false; };
  }, [messages]);

  // Recupera el borrador guardado al entrar (o volver) al chat.
  useEffect(() => {
    if (!conversationId) return;
    let active = true;
    AsyncStorage.getItem(DRAFT_KEY(conversationId))
      .then((saved) => { if (active && saved) setDraft(saved); })
      .catch(() => {});
    return () => { active = false; };
  }, [conversationId]);

  // Actualiza el borrador en pantalla y lo persiste (o lo borra si queda vacío).
  const updateDraft = useCallback((text: string) => {
    setDraft(text);
    const m = text.match(/@([^\s@]{0,25})$/);
    setMentionQuery(m ? m[1] : null);
    if (!conversationId) return;
    if (text) AsyncStorage.setItem(DRAFT_KEY(conversationId), text).catch(() => {});
    else AsyncStorage.removeItem(DRAFT_KEY(conversationId)).catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;

    const channelName = `chat_thread_${conversationId}`;
    const stale = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);
    if (stale) supabase.removeChannel(stale);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => (prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]));
          await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
        }
      )
      // Un mensaje puede cambiar despues de enviado: al fijarlo o quitarlo de
      // fijados. Sin esto, la banda de arriba solo se actualizaria al recargar.
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const upd = payload.new as Message;
          setMessages((prev) => prev.map((m) => (m.id === upd.id ? { ...m, ...upd } : m)));
        }
      )
      // Reacciones en tiempo real: cualquier cambio (poner, cambiar o quitar)
      // refresca el mapa para todos los que tengan el chat abierto.
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_message_reactions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => { loadReactions(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, loadReactions]);

  // Carga inicial de las reacciones al abrir el chat.
  useEffect(() => { loadReactions(); }, [loadReactions]);

    const handleSend = async (overrideContent?: string) => {
    const content = (overrideContent ?? draft).trim();
    if (!content || !user?.id || !conversationId || sending) return;

    setSending(true);
    setDraft('');

    const replyId = replyingTo?.id ?? null;

    // Los mencionados van DENTRO del mensaje para que la notificacion, que se
    // dispara al insertarlo, ya sepa a quien avisarle distinto.
    const norm = normalizeText(content);
    const mentionAll = /@todos\b/i.test(content);
    const mentionIds = participants
      .filter((pp) => pp.user_id !== user.id)
      .filter((pp) => mentionAll || norm.includes('@' + normalizeText(pp.name)))
      .map((pp) => pp.user_id);

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content,
        reply_to: replyId,
        mentions: mentionIds,
      })
      .select(MESSAGE_COLUMNS)
      .single();

    if (error) {
      console.error('ChatThread: error sending message', error);
      updateDraft(content); // se restaura y se vuelve a guardar el borrador
    } else if (data) {
      setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data as Message]));
      setReplyingTo(null);
      if (conversationId) AsyncStorage.removeItem(DRAFT_KEY(conversationId)).catch(() => {});
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
    setSending(false);
  };

  // Sube el archivo TAL CUAL viene del selector: sin redimensionar y sin
  // recomprimir, para que la foto o el video conserven la resolucion original.
  // En movil se usa FileSystem.uploadAsync, que hace streaming del archivo al
  // endpoint de Storage; leerlo a base64 en memoria (como hace la foto de
  // perfil) revienta la app con un video de varios cientos de MB.
  const uploadToBucket = async (asset: ImagePicker.ImagePickerAsset, path: string, mime: string) => {
    if (Platform.OS === 'web') {
      const blob = await (await fetch(asset.uri)).blob();
      const { error } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(path, blob, { contentType: mime, cacheControl: '3600', upsert: false });
      if (error) throw new Error(error.message);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error('Tu sesión expiró, vuelve a entrar.');

    const res = await FileSystem.uploadAsync(
      `${SUPABASE_URL}/storage/v1/object/${MEDIA_BUCKET}/${path}`,
      asset.uri,
      {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': mime,
          'cache-control': '3600',
        },
      }
    );
    if (res.status >= 400) {
      let detail = '';
      try { detail = JSON.parse(res.body || '{}')?.message || ''; } catch { detail = ''; }
      throw new Error(detail || `El servidor rechazó el archivo (${res.status}).`);
    }
  };

  // Sube UN adjunto y crea su mensaje. El pie de foto y la respuesta citada
  // solo van en el primero de la tanda, para no repetirlos en cada archivo.
  const sendOneAsset = async (
    asset: ImagePicker.ImagePickerAsset,
    caption: string,
    replyId: string | null
  ) => {
    if (!user?.id || !conversationId) return;
    const { kind, ext, mime } = mediaFileInfo(asset);

    const path = `${conversationId}/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await uploadToBucket(asset, path, mime);

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: caption,
        reply_to: replyId,
        media_path: path,
        media_kind: kind,
        media_mime: mime,
        media_width: asset.width ?? null,
        media_height: asset.height ?? null,
        media_size: asset.fileSize ?? null,
        media_duration: kind === 'video' && asset.duration ? asset.duration / 1000 : null,
      })
      .select(MESSAGE_COLUMNS)
      .single();

    if (error) throw new Error(error.message);
    if (data) {
      setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data as Message]));
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  // ── Notas de voz ───────────────────────────────────────────────────────
  // Se toca el microfono para empezar y se toca enviar para mandarla; es mas
  // fiable que "mantener presionado" cuando el dedo se resbala o la pantalla
  // pierde el foco.
  //
  // En WEB se usa una grabadora propia (lib/voiceRecorder): la de expo-audio
  // perdia el audio a veces y subia archivos vacios. En el TELEFONO se sigue
  // usando expo-audio, que graba a archivo y no tiene ese problema.
  const isWeb = Platform.OS === 'web';
  const recorder = useAudioRecorder(VOICE_RECORDING);
  const webRecorderRef = useRef<WebVoiceRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [sendingVoice, setSendingVoice] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);

  // Cronometro de la grabacion, igual en las dos plataformas.
  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    setRecordingMs(0);
    const id = setInterval(() => setRecordingMs(Date.now() - started), 200);
    return () => clearInterval(id);
  }, [recording]);

  // Si se sale del chat en plena grabacion, hay que soltar el microfono.
  useEffect(() => {
    return () => {
      webRecorderRef.current?.cancel();
      webRecorderRef.current = null;
    };
  }, []);

  const avisar = (msg: string) => {
    if (Platform.OS === 'web') window.alert(msg);
    else Alert.alert('Nota de voz', msg);
  };

  const startRecording = async () => {
    if (recording || sendingVoice) return;
    try {
      if (isWeb) {
        // En web NO se pide el permiso por separado: la propia grabadora abre
        // el microfono. Pedirlo aparte dejaba DOS capturas abiertas y en el
        // iPhone, que solo admite una, la grabacion salia muda.
        const rec = new WebVoiceRecorder();
        await rec.start();
        webRecorderRef.current = rec;
      } else {
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) {
          avisar(
            Platform.OS === 'ios'
              ? 'Debes permitir el acceso al micrófono. Actívalo en Ajustes → Nospi → Micrófono.'
              : 'Debes permitir el acceso al micrófono para grabar notas de voz.'
          );
          return;
        }
        // En iOS hay que habilitar la grabacion explicitamente, si no el audio
        // sale en silencio o directamente falla.
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
      }
      setRecording(true);
    } catch (e: any) {
      console.error('startRecording error:', e);
      webRecorderRef.current = null;
      avisar(
        e?.message === 'denied'
          ? 'Debes permitir el acceso al micrófono. En Safari toca "aA" en la barra de direcciones → Ajustes del sitio web → Micrófono → Permitir.'
          : 'No se pudo iniciar la grabación.'
      );
    }
  };

  const cancelRecording = async () => {
    if (!recording) return;
    setRecording(false);
    if (isWeb) {
      webRecorderRef.current?.cancel();
      webRecorderRef.current = null;
      return;
    }
    try { await recorder.stop(); } catch { /* nada que guardar */ }
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
  };

  const sendRecording = async () => {
    if (!recording || sendingVoice || !user?.id || !conversationId) return;
    setRecording(false);
    setSendingVoice(true);
    try {
      let seconds = 0;
      let mime = '';
      let ext = '';
      let payload: Blob | { uri: string } | null = null;

      if (isWeb) {
        const rec = webRecorderRef.current;
        webRecorderRef.current = null;
        const result = rec ? await rec.stop() : null;
        if (!result) { avisar('La grabación quedó vacía. Vuelve a intentarlo.'); return; }
        seconds = result.durationSeconds;
        mime = result.mime;
        ext = result.extension;
        payload = result.blob;
      } else {
        const statusNow = recorder.getStatus();
        seconds = (statusNow?.durationMillis || recordingMs) / 1000;
        await recorder.stop();
        setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
        if (!recorder.uri) { avisar('La grabación quedó vacía. Vuelve a intentarlo.'); return; }
        mime = 'audio/m4a';
        ext = 'm4a';
        payload = { uri: recorder.uri };
      }

      if (seconds < 0.7) return; // toque accidental: no se manda nada

      const path = `${conversationId}/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      if (payload instanceof Blob) {
        // Red de seguridad: antes se subieron notas de 5 bytes que aparecian en
        // el chat pero no sonaban. Mejor avisar que mandar algo mudo.
        if (payload.size < 1024) {
          avisar('La grabación no se guardó bien. Vuelve a intentarlo.');
          return;
        }
        const { error: upError } = await supabase.storage
          .from(MEDIA_BUCKET)
          .upload(path, payload, { contentType: mime, cacheControl: '3600', upsert: false });
        if (upError) throw new Error(upError.message);
      } else {
        await uploadToBucket(payload as ImagePicker.ImagePickerAsset, path, mime);
      }

      const replyId = replyingTo?.id ?? null;
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: '',
          reply_to: replyId,
          media_path: path,
          media_kind: 'audio',
          media_mime: mime,
          media_duration: seconds,
        })
        .select(MESSAGE_COLUMNS)
        .single();

      if (error) throw new Error(error.message);
      if (data) {
        setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data as Message]));
        setReplyingTo(null);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch (e: any) {
      console.error('sendRecording error:', e);
      avisar('No se pudo enviar la nota de voz. ' + (e?.message || ''));
    } finally {
      setSendingVoice(false);
    }
  };

  // Envia toda la bandeja de adjuntos, uno por uno y en orden.
  const sendPendingAssets = async () => {
    if (!user?.id || !conversationId || uploading || pendingAssets.length === 0) return;

    const batch = pendingAssets;
    const caption = draft.trim();
    const replyId = replyingTo?.id ?? null;

    setPendingAssets([]);
    setReplyingTo(null);
    if (caption) updateDraft('');

    for (let i = 0; i < batch.length; i++) {
      const asset = batch[i];
      const kind: 'image' | 'video' = asset.type === 'video' ? 'video' : 'image';
      setUploading({ kind, current: i + 1, total: batch.length });
      try {
        await sendOneAsset(asset, i === 0 ? caption : '', i === 0 ? replyId : null);
      } catch (e: any) {
        console.error('ChatThread: error subiendo media', e);
        Alert.alert(
          kind === 'video' ? 'No se pudo enviar el video' : 'No se pudo enviar la foto',
          e?.message || 'Revisa tu conexión e inténtalo de nuevo.'
        );
      }
    }
    setUploading(null);
  };

  // Un solo boton de enviar para todo: si hay adjuntos en la bandeja los manda
  // (con el texto como pie de foto), si no, manda el mensaje de texto normal.
  const handleSendAll = async () => {
    if (uploading) return;
    if (pendingAssets.length > 0) await sendPendingAssets();
    else await handleSend();
  };

  const removePendingAsset = (uri: string) => {
    setPendingAssets((prev) => prev.filter((a) => a.uri !== uri));
  };

  const pickFromLibrary = async () => {
    setShowAttachMenu(false);
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permiso requerido', 'Necesitamos permiso para acceder a tus fotos y videos.');
        return;
      }
    }
    // quality: 1 y sin allowsEditing => resolución original, sin recorte ni
    // reescalado. En iPhone el selector entrega la foto HEIC convertida a JPEG
    // a máxima calidad (mismo tamaño en píxeles) para que también se pueda ver
    // en Android y en la web.
    // allowsMultipleSelection: se pueden marcar varias fotos/videos de una vez.
    // Nada se envia aqui: los adjuntos quedan en la bandeja hasta que la
    // persona toca el boton de enviar.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: false,
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 1,
      exif: false,
    });
    if (!result.canceled && result.assets?.length) {
      // Se filtran los que pasan del tope ANTES de meterlos en la bandeja, para
      // explicarlo con palabras en vez de que Storage suelte un error crudo al
      // enviar. Sobre todo pasa con videos largos.
      const pesados = result.assets.filter((a) => (a.fileSize ?? 0) > MAX_UPLOAD_BYTES);
      const validos = result.assets.filter((a) => (a.fileSize ?? 0) <= MAX_UPLOAD_BYTES);

      if (pesados.length > 0) {
        const msg = pesados.length === 1
          ? `Ese archivo pesa ${formatMB(pesados[0].fileSize)} y el máximo son 25 MB. Si es un video, graba uno más corto o recórtalo antes de enviarlo.`
          : `${pesados.length} archivos pasan de 25 MB y no se pueden enviar. Si son videos, recórtalos antes.`;
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Archivo muy pesado', msg);
      }

      if (validos.length > 0) {
        setPendingAssets((prev) => {
          const known = new Set(prev.map((a) => a.uri));
          const nuevos = validos.filter((a) => !known.has(a.uri));
          return [...prev, ...nuevos].slice(0, 10);
        });
      }
    }
  };

  const takePhoto = async () => {
    setShowAttachMenu(false);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos permiso para usar la cámara.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: false,
      quality: 1,
      exif: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      const nuevo = result.assets[0];
      setPendingAssets((prev) => (prev.some((a) => a.uri === nuevo.uri) ? prev : [...prev, nuevo].slice(0, 10)));
    }
  };

  // El video no se reproduce dentro de la burbuja en móvil (haría falta una
  // librería nativa nueva y por tanto un build nuevo): se abre a pantalla
  // completa en el reproductor del sistema con el enlace firmado.
  // Descargar y compartir. En web se baja el archivo de verdad (blob + enlace
  // de descarga) y se comparte con la API del navegador cuando existe. En movil
  // el archivo se baja al cache y se entrega a la hoja del sistema, que es la
  // que ofrece "Guardar imagen/video" ademas de WhatsApp, correo, etc.
  const handleMediaAction = async (
    action: 'download' | 'share',
    url: string,
    kind: 'image' | 'video',
    filename: string
  ) => {
    if (busyAction) return;
    setBusyAction(action);
    try {
      if (Platform.OS === 'web') {
        const blob = await (await fetch(url)).blob();
        const nav: any = typeof navigator !== 'undefined' ? navigator : null;
        if (action === 'share' && nav?.canShare && typeof File !== 'undefined') {
          const file = new File([blob], filename, { type: blob.type });
          if (nav.canShare({ files: [file] })) {
            await nav.share({ files: [file] });
            return;
          }
        }
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
        return;
      }

      const target = `${FileSystem.cacheDirectory}${filename}`;
      const { uri } = await FileSystem.downloadAsync(url, target);
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('No disponible', 'Este dispositivo no permite guardar ni compartir archivos.');
        return;
      }
      await Sharing.shareAsync(uri, {
        dialogTitle: action === 'download'
          ? (kind === 'video' ? 'Guardar video' : 'Guardar foto')
          : 'Compartir',
        mimeType: kind === 'video' ? 'video/mp4' : 'image/jpeg',
        UTI: kind === 'video' ? 'public.movie' : 'public.image',
      });
    } catch (e: any) {
      // Si la persona cierra la hoja de compartir no es un error que valga avisar.
      const msg = String(e?.message || '');
      if (!/abort|cancel/i.test(msg)) {
        Alert.alert(
          action === 'download' ? 'No se pudo guardar' : 'No se pudo compartir',
          msg || 'Inténtalo de nuevo.'
        );
      }
    } finally {
      setBusyAction(null);
    }
  };

  const openPhoto = (url: string, filename?: string) => {
    setZoomedFileName(filename || 'foto-nospi.jpg');
    setZoomedPhoto(url);
  };

  const openVideo = async (url: string) => {
    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') window.open(url, '_blank');
        return;
      }
      await WebBrowser.openBrowserAsync(url);
    } catch {
      Linking.openURL(url).catch(() => {});
    }
  };

  const handleStartDirectChat = async (otherUserId: string) => {
    if (!otherUserId || otherUserId === user?.id || startingChatWith) return;
    setStartingChatWith(otherUserId);

    const { data, error } = await supabase.rpc('get_or_create_direct_chat', {
      p_other_user_id: otherUserId,
    });

    setStartingChatWith(null);
    setShowParticipants(false);

    if (error) {
      console.error('ChatThread: error starting direct chat', error);
      // El chat privado exige que ambos hayan confirmado su llegada a un mismo
      // evento. Ese caso NO se resuelve reintentando, asi que se explica aparte
      // en vez de mostrar el mensaje generico de "intenta de nuevo".
      const msg = String(error.message || '');
      const bloqueadoPorAsistencia = msg.includes('asistieron contigo') || (error as any).code === '42501';
      const titulo = bloqueadoPorAsistencia ? 'Chat no disponible' : 'No se pudo abrir el chat';
      const detalle = bloqueadoPorAsistencia
        ? 'Solo puedes escribirle por privado a personas que asistieron contigo a un evento.'
        : 'Intenta de nuevo en unos segundos.';
      // Alert.alert de React Native NO muestra nada en web: alli hay que usar
      // window.alert, si no el usuario ve que "no pasa nada" y parece un error
      // de la app (mismo patron que ya se usa en el resto de este archivo).
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') window.alert(`${titulo}\n\n${detalle}`);
      } else {
        Alert.alert(titulo, detalle);
      }
      return;
    }

    if (data) {
      router.push(`/chat/${data}` as any);
    }
  };

  const handleBack = () => {
    // Marcar leído NO debe bloquear la navegación (antes se hacía await y si el
    // RPC se demoraba, la flecha "no respondía"). Se dispara en segundo plano.
    if (conversationId) {
      supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId })
        .then(() => {})
        .catch((err) => console.error('ChatThread: error marking conversation read', err));
    }
    // Si no hay pantalla anterior en la pila (se entró por notificación, deep
    // link o desde el pop-up de match con router.push), router.back() no hace
    // nada. En ese caso vamos a la lista de chats.
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/chats' as any);
    }
  };

  // ── Menciones ──────────────────────────────────────────────────────────
  // Al escribir "@" se ofrecen los participantes del chat. Se busca solo al
  // final del texto, que es como se menciona en la practica.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const mentionCandidates = participants.filter((p) => p.user_id !== user?.id);
  const mentionRe = mentionRegex(mentionCandidates.map((p) => p.name));

  const mentionSuggestions = mentionQuery === null ? [] : (() => {
    const q = normalizeText(mentionQuery);
    const list = mentionCandidates.filter((p) => !q || normalizeText(p.name).startsWith(q));
    return list.slice(0, 6);
  })();

  // Reemplaza el "@loQueIbaEscribiendo" del final por el nombre completo.
  const applyMention = (name: string) => {
    const next = draft.replace(/@([^\s@]*)$/, `@${name} `);
    updateDraft(next);
    setMentionQuery(null);
  };

  // Mensajes fijados, del mas reciente al mas antiguo. Si hay varios, la banda
  // muestra uno y se va rotando al tocarla (como WhatsApp).
  const pinnedMessages = messages
    .filter((m) => !!m.pinned_at)
    .sort((x, y) => (y.pinned_at || '').localeCompare(x.pinned_at || ''));
  const [pinnedIndex, setPinnedIndex] = useState(0);
  const activePinned = pinnedMessages.length > 0
    ? pinnedMessages[pinnedIndex % pinnedMessages.length]
    : null;

  // Lleva la lista hasta el mensaje fijado que se toco.
  const scrollToMessage = (messageId: string) => {
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    try {
      listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
    } catch {
      // Si la fila aun no esta medida, scrollToIndex falla; no es critico.
    }
  };

  const isGroup = meta?.conv_type === 'event_group';
  // Un canal es de difusion: escribe el equipo de Nospi y, si esta abierto,
  // tambien responde la gente. Las encuestas se responden siempre.
  const isChannel = meta?.conv_type === 'channel_global' || meta?.conv_type === 'channel_event';
  const channelReadOnly = isChannel && !meta?.replies_open && !isAdminUser;
  // Para chats directos, "el otro" participante sirve de respaldo: cuando la
  // conversacion aun no tiene mensajes no aparece en get_my_conversations, asi
  // que meta llega null y el nombre/foto hay que sacarlos de los participantes
  // (get_conversation_participants si los trae, con o sin mensajes).
  const otherParticipant = !isGroup && !isChannel ? participants.find((p) => p.user_id !== user?.id) : undefined;
  const headerTitle = isChannel
    ? meta?.channel_title || 'Canal de Nospi'
    : isGroup
    ? meta?.event_name || 'Chat del evento'
    : meta?.other_user_name || otherParticipant?.name || 'Chat';
  const otherUserPhoto = !isGroup && !isChannel
    ? meta?.other_user_photo || otherParticipant?.profile_photo_url || null
    : null;

  const unlockAt = isGroup && meta?.event_date
    ? new Date(new Date(meta.event_date).getTime() - CHAT_UNLOCK_MINUTES_BEFORE * 60 * 1000)
    : null;
  const isLocked = !!unlockAt && Date.now() < unlockAt.getTime();

  if (loading) {
    return (
      <LinearGradient colors={['#1a0010', '#880E4F', '#AD1457']} style={styles.gradient}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#F06292" />
        </View>
      </LinearGradient>
    );
  }

  if (isLocked) {
    return (
      <LinearGradient colors={['#1a0010', '#880E4F', '#AD1457']} style={styles.gradient}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={handleBack} style={styles.headerBackButton} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>{headerTitle}</Text>
          </View>
          <View style={styles.headerActionButton} />
        </View>
        <View style={styles.lockedContainer}>
          <Text style={styles.lockedEmoji}>🔒</Text>
          <Text style={styles.lockedTitle}>Este chat aún no se habilita</Text>
          <Text style={styles.lockedSubtitle}>
            Se abre {unlockAt ? `a las ${formatBogotaTime(unlockAt)}` : 'pronto'}, 30 minutos antes del evento, y queda
            disponible durante todo el evento.
          </Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#1a0010', '#880E4F', '#AD1457']} style={styles.gradient}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={handleBack} style={styles.headerBackButton} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={28} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            {isChannel ? (
              <View style={styles.headerAvatarPlaceholder}>
                <Text style={{ fontSize: 16 }}>{meta?.conv_type === 'channel_global' ? '📢' : '📣'}</Text>
              </View>
            ) : isGroup ? (
              <View style={styles.headerAvatarPlaceholder}>
                <Image source={eventIconSource(meta?.event_type)} style={styles.headerEventIcon} resizeMode="contain" />
              </View>
            ) : (
              <ChatAvatar
                uri={otherUserPhoto}
                name={headerTitle}
                size={30}
                marginRight={8}
                onPress={otherUserPhoto ? () => setZoomedPhoto(otherUserPhoto) : undefined}
              />
            )}
            <Text style={styles.headerTitle} numberOfLines={1}>
              {headerTitle}
            </Text>
          </View>

          {isGroup ? (
            <TouchableOpacity onPress={() => setShowParticipants(true)} style={styles.headerActionButton}>
              <IconSymbol ios_icon_name="person.2.fill" android_material_icon_name="group" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          ) : (
            <View style={styles.headerActionButton} />
          )}
        </View>
        {isGroup && (
          <TouchableOpacity style={styles.directChatBanner} onPress={() => setShowParticipants(true)} activeOpacity={0.8}>
            <Text style={styles.directChatBannerText}>💬 Toca aquí para escribirle en privado a alguien del grupo</Text>
          </TouchableOpacity>
        )}

        {activePinned && (
          <TouchableOpacity
            style={styles.pinnedBar}
            activeOpacity={0.8}
            onPress={() => {
              scrollToMessage(activePinned.id);
              if (pinnedMessages.length > 1) setPinnedIndex((i) => (i + 1) % pinnedMessages.length);
            }}
          >
            <Text style={styles.pinnedIcon}>📌</Text>
            <View style={styles.pinnedTextBox}>
              <Text style={styles.pinnedLabel}>
                Mensaje fijado
                {pinnedMessages.length > 1 ? ` ${(pinnedIndex % pinnedMessages.length) + 1} de ${pinnedMessages.length}` : ''}
              </Text>
              <Text style={styles.pinnedPreview} numberOfLines={1}>
                {messagePreviewText(activePinned) || 'Mensaje'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => togglePinned(activePinned)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.pinnedRemove}>✕</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        )}

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesContainer}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const isMine = item.sender_id === user?.id;
            const isSystem = item.sender_id === NOSPI_SYSTEM_USER_ID;
            const sender = participantsById[item.sender_id];
            const senderName = isSystem ? 'Equipo Nospi' : sender?.name || 'Alguien';
            const senderPhoto = isSystem ? null : sender?.profile_photo_url || null;
            const showSenderInfo = (isGroup || isChannel) && !isMine;

            // Si este mensaje responde a otro, buscamos el original para citarlo.
            const repliedMsg = item.reply_to ? messages.find((m) => m.id === item.reply_to) : undefined;
            const repliedName = repliedMsg
              ? (repliedMsg.sender_id === user?.id
                  ? 'Tú'
                  : repliedMsg.sender_id === NOSPI_SYSTEM_USER_ID
                  ? 'Equipo Nospi'
                  : participantsById[repliedMsg.sender_id]?.name || 'Alguien')
              : null;

            return (
              <>
              <View style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowTheirs]}>
                {showSenderInfo && !isSystem && (
                  <ChatAvatar
                    uri={senderPhoto}
                    name={senderName}
                    size={26}
                    marginRight={6}
                    onPress={senderPhoto ? () => setZoomedPhoto(senderPhoto) : undefined}
                  />
                )}
                {showSenderInfo && isSystem && (
                  <View style={[styles.messageAvatar, styles.messageAvatarPlaceholder]}>
                    <Text style={{ fontSize: 14 }}>📣</Text>
                  </View>
                )}
                <SwipeToReply onReply={() => setReplyingTo(item)}>
                <TouchableOpacity
                  ref={(el) => { bubbleRefs.current[item.id] = el; }}
                  activeOpacity={0.9}
                  onLongPress={() => {
                    // Medimos donde quedo la burbuja en pantalla para abrir el
                    // menu justo ahi, en vez de al fondo.
                    const node: any = bubbleRefs.current[item.id];
                    if (node?.measureInWindow) {
                      node.measureInWindow((_x: number, y: number, _w: number, h: number) => {
                        setActionAnchor({ y, height: h, isMine });
                        setActionMsg(item);
                      });
                    } else {
                      setActionAnchor(null);
                      setActionMsg(item);
                    }
                  }}
                  delayLongPress={250}
                  style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}
                >
                  {showSenderInfo && <Text style={styles.senderName}>{senderName}</Text>}
                  {repliedMsg && (
                    <View style={[styles.quoteBox, isMine ? styles.quoteBoxMine : styles.quoteBoxTheirs]}>
                      <Text style={[styles.quoteName, isMine && styles.quoteNameMine]} numberOfLines={1}>{repliedName}</Text>
                      <Text style={[styles.quoteText, isMine && styles.quoteTextMine]} numberOfLines={1}>
                        {messagePreviewText(repliedMsg)}
                      </Text>
                    </View>
                  )}
                  {item.media_expired && (
                    <View style={styles.expiredMedia}>
                      <Text style={styles.expiredMediaIcon}>
                        {item.media_kind === 'video' ? '🎥' : '📷'}
                      </Text>
                      <Text style={[styles.expiredMediaText, isMine && styles.expiredMediaTextMine]}>
                        {item.media_kind === 'video' ? 'Video' : 'Foto'} no disponible{'\n'}
                        <Text style={styles.expiredMediaHint}>
                          Se eliminó a los {MEDIA_RETENTION_DAYS} días
                        </Text>
                      </Text>
                    </View>
                  )}
                  {!!item.media_path && item.media_kind === 'audio' && (
                    <VoiceNote
                      uri={signedUrls[item.media_path as string] || null}
                      duration={item.media_duration}
                      mine={isMine}
                    />
                  )}
                  {!!item.media_path && item.media_kind !== 'audio' && (() => {
                    const url = signedUrls[item.media_path as string];
                    const box = mediaBoxSize(item.media_width, item.media_height);
                    if (!url) {
                      return (
                        <View style={[styles.mediaPlaceholder, box]}>
                          <ActivityIndicator size="small" color={isMine ? '#FFFFFF' : nospiColors.purpleDark} />
                        </View>
                      );
                    }
                    if (item.media_kind === 'video') {
                      if (Platform.OS === 'web') {
                        return (
                          <View style={{ marginBottom: 6 }}>
                            {React.createElement('video', {
                              src: url,
                              controls: true,
                              playsInline: true,
                              style: {
                                width: box.width,
                                height: box.height,
                                borderRadius: 12,
                                backgroundColor: '#000',
                                display: 'block',
                              },
                            })}
                            <View style={styles.mediaActionsRow}>
                              <TouchableOpacity
                                onPress={() => handleMediaAction('download', url, 'video', mediaFileName(item.media_path, 'video'))}
                              >
                                <Text style={[styles.mediaActionLink, isMine && styles.mediaActionLinkMine]}>Descargar</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => handleMediaAction('share', url, 'video', mediaFileName(item.media_path, 'video'))}
                              >
                                <Text style={[styles.mediaActionLink, isMine && styles.mediaActionLinkMine]}>Compartir</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      }
                      return (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => setMediaActions({ url, kind: 'video', filename: mediaFileName(item.media_path, 'video') })}
                          style={[styles.mediaVideoBox, box]}
                        >
                          <View style={styles.mediaPlayCircle}>
                            <IconSymbol ios_icon_name="play.fill" android_material_icon_name="play-arrow" size={28} color="#FFFFFF" />
                          </View>
                          {!!item.media_size && (
                            <Text style={styles.mediaMeta}>{formatBytes(item.media_size)}</Text>
                          )}
                        </TouchableOpacity>
                      );
                    }
                    return (
                      <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() => openPhoto(url, mediaFileName(item.media_path, 'image'))}
                      >
                        <ExpoImage
                          source={{ uri: url }}
                          style={[styles.mediaImage, box]}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          transition={120}
                        />
                      </TouchableOpacity>
                    );
                  })()}
                  {item.poll_id ? (
                    <PollCard pollId={item.poll_id} />
                  ) : !!(item.content || '').trim() && (
                    <Text style={[styles.messageText, isMine && styles.messageTextMine]}>
                      {renderMessageContent(item.content, isMine, mentionRe)}
                    </Text>
                  )}
                  <Text style={[styles.messageTime, isMine && styles.messageTimeMine]}>
                    {formatBogotaTime(new Date(item.created_at))}
                  </Text>
                </TouchableOpacity>
                </SwipeToReply>
              </View>
              {/* Reacciones agrupadas por emoji con su contador. Van fuera de
                  la fila del mensaje para no alterar el ancho de la burbuja. */}
              {(() => {
                const list = reactions[item.id] || [];
                if (list.length === 0) return null;
                const byEmoji: Record<string, number> = {};
                for (const r of list) byEmoji[r.emoji] = (byEmoji[r.emoji] || 0) + 1;
                const mine = list.find(r => r.user_id === user?.id)?.emoji;
                return (
                  <View style={[styles.reactionChips, isMine ? styles.reactionChipsMine : styles.reactionChipsTheirs]}>
                    {Object.entries(byEmoji).map(([emo, count]) => (
                      <TouchableOpacity
                        key={emo}
                        style={[styles.reactionChip, mine === emo && styles.reactionChipMine]}
                        onPress={() => toggleReaction(item.id, emo)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.reactionChipEmoji}>{emo}</Text>
                        {count > 1 && <Text style={styles.reactionChipCount}>{count}</Text>}
                      </TouchableOpacity>
                    ))}
                  </View>
                );
              })()}
              </>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyMessages}>
              <Text style={styles.emptyMessagesText}>
                {isChannel
                  ? 'Aquí verás los avisos de Nospi 📢'
                  : isGroup
                  ? 'Sé el primero en saludar al grupo 👋'
                  : 'Escribe el primer mensaje para romper el hielo 👋'}
              </Text>
            </View>
          }
        />

        {mentionSuggestions.length > 0 && (
          <View style={styles.mentionBar}>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 190 }}>
              {mentionSuggestions.map((p) => (
                <TouchableOpacity
                  key={p.user_id}
                  style={styles.mentionRow}
                  onPress={() => applyMention(p.name)}
                  activeOpacity={0.7}
                >
                  <ChatAvatar uri={p.profile_photo_url} name={p.name} size={28} marginRight={9} />
                  <Text style={styles.mentionName}>{p.name}</Text>
                </TouchableOpacity>
              ))}
              {isGroup && (
                <TouchableOpacity style={styles.mentionRow} onPress={() => applyMention('todos')} activeOpacity={0.7}>
                  <View style={styles.mentionAllIcon}><Text style={{ fontSize: 14 }}>📣</Text></View>
                  <Text style={styles.mentionName}>todos <Text style={styles.mentionHint}>· avisar a todo el grupo</Text></Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        )}

        {replyingTo && (
          <View style={styles.replyPreview}>
            <View style={styles.replyPreviewBar} />
            <View style={{ flex: 1 }}>
              <Text style={styles.replyPreviewName} numberOfLines={1}>
                Respondiendo a {replyingTo.sender_id === user?.id
                  ? 'ti'
                  : replyingTo.sender_id === NOSPI_SYSTEM_USER_ID
                  ? 'Equipo Nospi'
                  : participantsById[replyingTo.sender_id]?.name || 'Alguien'}
              </Text>
              <Text style={styles.replyPreviewText} numberOfLines={1}>{messagePreviewText(replyingTo)}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.replyPreviewClose}>
              <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}

        {!!uploading && (
          <View style={styles.uploadingBar}>
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text style={styles.uploadingText}>
              {uploading.total > 1
                ? `Enviando ${uploading.current} de ${uploading.total} en calidad original...`
                : uploading.kind === 'video'
                ? 'Enviando video en calidad original...'
                : 'Enviando foto en calidad original...'}
            </Text>
          </View>
        )}

        {pendingAssets.length > 0 && (
          <View style={styles.pendingBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pendingScroll}>
              {pendingAssets.map((a) => (
                <View key={a.uri} style={styles.pendingItem}>
                  {a.type === 'video' ? (
                    <View style={[styles.pendingThumb, styles.pendingVideoThumb]}>
                      <IconSymbol ios_icon_name="play.fill" android_material_icon_name="play-arrow" size={20} color="#FFFFFF" />
                    </View>
                  ) : (
                    <ExpoImage source={{ uri: a.uri }} style={styles.pendingThumb} contentFit="cover" transition={0} />
                  )}
                  <TouchableOpacity style={styles.pendingRemove} onPress={() => removePendingAsset(a.uri)}>
                    <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={13} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
            <Text style={styles.pendingHint}>
              {pendingAssets.length === 1
                ? '1 adjunto listo. Toca enviar cuando quieras.'
                : `${pendingAssets.length} adjuntos listos. Toca enviar cuando quieras.`}
            </Text>
          </View>
        )}

        {channelReadOnly ? (
          // Canal en solo lectura: no se escribe, pero las encuestas de arriba
          // si se pueden responder.
          <View style={[styles.channelLockedBar, { paddingBottom: insets.bottom + 10 }]}>
            <Text style={styles.channelLockedText}>
              🔒 Solo el equipo de Nospi publica en este canal
            </Text>
          </View>
        ) : recording ? (
          <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
            <TouchableOpacity style={styles.attachButton} onPress={cancelRecording}>
              <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={22} color="#FF8A9B" />
            </TouchableOpacity>
            <View style={styles.recordingBox}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingTime}>
                {formatDuration(recordingMs / 1000)}
              </Text>
              <Text style={styles.recordingHint}>Grabando… toca ➤ para enviar</Text>
            </View>
            <TouchableOpacity style={styles.sendButton} onPress={sendRecording}>
              <IconSymbol ios_icon_name="paperplane.fill" android_material_icon_name="send" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        ) : (
        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
          <TouchableOpacity
            style={styles.attachButton}
            onPress={() => setShowAttachMenu(true)}
            disabled={!!uploading}
          >
            <IconSymbol ios_icon_name="paperclip" android_material_icon_name="attach-file" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            placeholder="Escribe un mensaje..."
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={draft}
                        onChangeText={(text) => { if (text.endsWith('\n')) { const trimmed = text.slice(0, -1); updateDraft(trimmed); if (pendingAssets.length > 0) { handleSendAll(); } else { handleSend(trimmed); } } else { updateDraft(text); } }}
            multiline
            maxLength={2000}
          />
          {!draft.trim() && pendingAssets.length === 0 ? (
            <TouchableOpacity
              style={styles.sendButton}
              onPress={startRecording}
              disabled={sendingVoice || !!uploading}
            >
              {sendingVoice ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <IconSymbol ios_icon_name="mic.fill" android_material_icon_name="mic" size={20} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.sendButton}
              onPress={handleSendAll}
              disabled={sending || !!uploading}
            >
              <IconSymbol ios_icon_name="paperplane.fill" android_material_icon_name="send" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>
        )}
      </KeyboardAvoidingView>

      <Modal visible={showAttachMenu} animationType="fade" transparent onRequestClose={() => setShowAttachMenu(false)}>
        <TouchableOpacity style={styles.attachOverlay} activeOpacity={1} onPress={() => setShowAttachMenu(false)}>
          <View style={styles.attachSheet}>
            <Text style={styles.attachSheetTitle}>Enviar archivo</Text>
            <Text style={styles.attachSheetHint}>
              Se envía en su calidad original, sin reducir la resolución. Máximo 25 MB por archivo.
              {'\n'}Las fotos y videos se eliminan a los {MEDIA_RETENTION_DAYS} días: descárgalos antes si los quieres guardar.
            </Text>
            <TouchableOpacity style={styles.attachOption} onPress={pickFromLibrary}>
              <IconSymbol ios_icon_name="photo.on.rectangle" android_material_icon_name="photo-library" size={22} color={nospiColors.purpleDark} />
              <Text style={styles.attachOptionText}>Foto o video de la galería</Text>
            </TouchableOpacity>
            {Platform.OS !== 'web' && (
              <TouchableOpacity style={styles.attachOption} onPress={takePhoto}>
                <IconSymbol ios_icon_name="camera.fill" android_material_icon_name="photo-camera" size={22} color={nospiColors.purpleDark} />
                <Text style={styles.attachOptionText}>Tomar foto o grabar video</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.attachCancel} onPress={() => setShowAttachMenu(false)}>
              <Text style={styles.attachCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showParticipants} animationType="slide" transparent onRequestClose={() => setShowParticipants(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Asistentes</Text>
              <TouchableOpacity onPress={() => setShowParticipants(false)}>
                <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={24} color={nospiColors.purpleDark} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Toca a alguien para chatear en privado</Text>
            <ScrollView style={styles.participantsScroll} showsVerticalScrollIndicator={false}>
              {participants
                .filter((p) => p.user_id !== user?.id)
                .map((p) => (
                  <TouchableOpacity
                    key={p.user_id}
                    style={styles.participantRow}
                    onPress={() => handleStartDirectChat(p.user_id)}
                    disabled={!!startingChatWith}
                  >
                    {p.profile_photo_url ? (
                      <TouchableOpacity onPress={() => setZoomedPhoto(p.profile_photo_url)} activeOpacity={0.8}>
                        <ExpoImage source={{ uri: p.profile_photo_url }} style={styles.participantAvatar} cachePolicy="memory-disk" transition={0} />
                      </TouchableOpacity>
                    ) : (
                      <View style={[styles.participantAvatar, styles.participantAvatarPlaceholder]}>
                        <Text style={{ fontSize: 18 }}>👤</Text>
                      </View>
                    )}
                    <Text style={styles.participantName}>{p.name}</Text>
                    {startingChatWith === p.user_id ? (
                      <ActivityIndicator size="small" color={nospiColors.purpleDark} />
                    ) : (
                      <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={20} color={nospiColors.gray400} />
                    )}
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Acciones al mantener presionado un mensaje. Sin boton Cancelar: se
          cierra tocando fuera del menu. */}
      <Modal visible={!!actionMsg} animationType="fade" transparent onRequestClose={() => { setActionMsg(null); setActionAnchor(null); }}>
        <TouchableOpacity
          style={styles.actionOverlay}
          activeOpacity={1}
          onPress={() => { setActionMsg(null); setActionAnchor(null); }}
        >
          {/* El menu se ancla JUNTO al mensaje presionado (como WhatsApp).
              Si la burbuja esta muy abajo, se abre hacia arriba para que no se
              salga de la pantalla. */}
          <View
            style={[
              styles.actionAnchored,
              actionAnchor
                ? (actionAnchor.y > SCREEN_H * 0.55
                    ? { bottom: SCREEN_H - actionAnchor.y + 8 }
                    : { top: actionAnchor.y + actionAnchor.height + 8 })
                : { bottom: 40 },
              actionAnchor?.isMine ? { right: 12, alignItems: 'flex-end' } : { left: 12, alignItems: 'flex-start' },
            ]}
          >
          {/* Barra de reacciones rapidas, los mismos 6 emojis de WhatsApp. */}
          <View style={styles.reactionBar}>
            {QUICK_REACTIONS.map((emo) => {
              const mine = actionMsg
                ? (reactions[actionMsg.id] || []).find(r => r.user_id === user?.id)?.emoji === emo
                : false;
              return (
                <TouchableOpacity
                  key={emo}
                  style={[styles.reactionBarBtn, mine && styles.reactionBarBtnActive]}
                  onPress={() => { const m = actionMsg; setActionMsg(null); setActionAnchor(null); if (m) toggleReaction(m.id, emo); }}
                >
                  <Text style={styles.reactionBarEmoji}>{emo}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.actionSheetCompact}>
            <TouchableOpacity
              style={styles.attachOption}
              onPress={() => { const m = actionMsg; setActionMsg(null); setActionAnchor(null); if (m) setReplyingTo(m); }}
            >
              <Text style={{ fontSize: 20, width: 22, textAlign: 'center' }}>↩︎</Text>
              <Text style={styles.attachOptionText}>Responder</Text>
            </TouchableOpacity>
            {!!(actionMsg?.content || '').trim() && (
              <TouchableOpacity
                style={styles.attachOption}
                onPress={() => { const m = actionMsg; setActionMsg(null); setActionAnchor(null); copyMessageText(m); }}
              >
                <IconSymbol ios_icon_name="doc.on.doc" android_material_icon_name="content-copy" size={22} color={nospiColors.purpleDark} />
                <Text style={styles.attachOptionText}>Copiar</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.attachOption}
              onPress={() => { const m = actionMsg; setActionMsg(null); setActionAnchor(null); togglePinned(m); }}
            >
              <Text style={{ fontSize: 19, width: 22, textAlign: 'center' }}>📌</Text>
              <Text style={styles.attachOptionText}>
                {actionMsg?.pinned_at ? 'Quitar de fijados' : 'Fijar mensaje'}
              </Text>
            </TouchableOpacity>
          </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!mediaActions} animationType="fade" transparent onRequestClose={() => setMediaActions(null)}>
        <TouchableOpacity style={styles.attachOverlay} activeOpacity={1} onPress={() => setMediaActions(null)}>
          <View style={styles.attachSheet}>
            <Text style={styles.attachSheetTitle}>Video</Text>
            <TouchableOpacity
              style={styles.attachOption}
              onPress={() => { const m = mediaActions; setMediaActions(null); if (m) openVideo(m.url); }}
            >
              <IconSymbol ios_icon_name="play.fill" android_material_icon_name="play-arrow" size={22} color={nospiColors.purpleDark} />
              <Text style={styles.attachOptionText}>Reproducir</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.attachOption}
              disabled={!!busyAction}
              onPress={() => { const m = mediaActions; setMediaActions(null); if (m) handleMediaAction('download', m.url, m.kind, m.filename); }}
            >
              <IconSymbol ios_icon_name="arrow.down.circle" android_material_icon_name="file-download" size={22} color={nospiColors.purpleDark} />
              <Text style={styles.attachOptionText}>Descargar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.attachOption}
              disabled={!!busyAction}
              onPress={() => { const m = mediaActions; setMediaActions(null); if (m) handleMediaAction('share', m.url, m.kind, m.filename); }}
            >
              <IconSymbol ios_icon_name="square.and.arrow.up" android_material_icon_name="share" size={22} color={nospiColors.purpleDark} />
              <Text style={styles.attachOptionText}>Compartir</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachCancel} onPress={() => setMediaActions(null)}>
              <Text style={styles.attachCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!zoomedPhoto} animationType="fade" transparent onRequestClose={() => setZoomedPhoto(null)}>
        <View style={styles.photoViewerOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setZoomedPhoto(null)} />
          {zoomedPhoto && (
            <ExpoImage source={{ uri: zoomedPhoto }} style={styles.photoViewerImage} contentFit="contain" cachePolicy="memory-disk" transition={0} />
          )}
          <View style={[styles.photoViewerActions, { bottom: insets.bottom + 28 }]}>
            <TouchableOpacity
              style={styles.photoViewerActionButton}
              disabled={!!busyAction}
              onPress={() => zoomedPhoto && handleMediaAction('download', zoomedPhoto, 'image', zoomedFileName)}
            >
              {busyAction === 'download' ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <IconSymbol ios_icon_name="arrow.down.circle" android_material_icon_name="file-download" size={20} color="#FFFFFF" />
              )}
              <Text style={styles.photoViewerActionText}>Descargar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.photoViewerActionButton}
              disabled={!!busyAction}
              onPress={() => zoomedPhoto && handleMediaAction('share', zoomedPhoto, 'image', zoomedFileName)}
            >
              {busyAction === 'share' ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <IconSymbol ios_icon_name="square.and.arrow.up" android_material_icon_name="share" size={20} color="#FFFFFF" />
              )}
              <Text style={styles.photoViewerActionText}>Compartir</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.photoViewerClose, { top: insets.top + 12 }]}
            onPress={() => setZoomedPhoto(null)}
          >
            <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={26} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lockedContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  lockedEmoji: { fontSize: 48, marginBottom: 16 },
  lockedTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', marginBottom: 8, textAlign: 'center' },
  lockedSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  headerActionButton: { padding: 8, width: 40, alignItems: 'center' },
  directChatBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)', paddingVertical: 10, marginHorizontal: 12, marginBottom: 8, borderRadius: 10 },
  directChatBannerText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  headerAvatar: { width: 30, height: 30, borderRadius: 15, marginRight: 8 },
  headerAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 10,
    marginRight: 8,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEmoji: { fontSize: 16 },
  headerEventIcon: { width: 20, height: 20, tintColor: '#880E4F' },
  headerTitle: { flexShrink: 1, color: '#FFFFFF', fontSize: 17, fontWeight: '700', textAlign: 'left' },
  messagesContainer: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 1 },
  messageRow: { marginBottom: 10, flexDirection: 'row', alignItems: 'flex-end', width: '100%' },
  messageRowMine: { justifyContent: 'flex-end' },
  messageRowTheirs: { justifyContent: 'flex-start' },
  messageAvatar: { width: 26, height: 26, borderRadius: 13, marginRight: 6 },
  messageAvatarPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { backgroundColor: '#AD1457', alignItems: 'center', justifyContent: 'center' },
  quoteBox: { borderLeftWidth: 3, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 6 },
  quoteBoxMine: { backgroundColor: 'rgba(255,255,255,0.18)', borderLeftColor: 'rgba(255,255,255,0.7)' },
  quoteBoxTheirs: { backgroundColor: 'rgba(136,14,79,0.08)', borderLeftColor: '#AD1457' },
  quoteName: { fontSize: 11.5, fontWeight: '800', color: '#AD1457', marginBottom: 1 },
  quoteNameMine: { color: 'rgba(255,255,255,0.95)' },
  quoteText: { fontSize: 12.5, color: '#6a6a70' },
  quoteTextMine: { color: 'rgba(255,255,255,0.8)' },
  bubble: { maxWidth: '100%', flexShrink: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },

  // ── Reacciones con emoji ──────────────────────────────────────────────────
  actionOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  actionAnchored: { position: 'absolute', maxWidth: 300 },
  actionSheetCompact: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 4,
    minWidth: 168,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 8,
  },
  reactionBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 8,
    paddingVertical: 7,
    marginBottom: 10,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 8,
  },
  reactionBarBtn: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 20 },
  reactionBarBtnActive: { backgroundColor: '#FCE4EC' },
  reactionBarEmoji: { fontSize: 26 },
  reactionChips: { flexDirection: 'row', gap: 4, marginTop: -6, marginBottom: 8 },
  reactionChipsMine: { justifyContent: 'flex-end', paddingRight: 4 },
  reactionChipsTheirs: { justifyContent: 'flex-start', paddingLeft: 32 },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  reactionChipMine: { borderColor: '#AD1457', backgroundColor: '#FCE4EC' },
  reactionChipEmoji: { fontSize: 13 },
  reactionChipCount: { fontSize: 11, fontWeight: '700', color: '#6b5560' },

  // ── Encuestas dentro del chat ──────────────────────────────────────────
  // ── Menciones ──────────────────────────────────────────────────────────
  // Foto o video que ya se borro por antiguedad.
  expiredMedia: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 10, paddingVertical: 9, paddingHorizontal: 11,
    marginBottom: 5, minWidth: 175,
  },
  expiredMediaIcon: { fontSize: 17, opacity: 0.5 },
  expiredMediaText: { fontSize: 12.5, color: '#6b5560', lineHeight: 17 },
  expiredMediaTextMine: { color: 'rgba(255,255,255,0.85)' },
  expiredMediaHint: { fontSize: 11, opacity: 0.75 },

  // ── Notas de voz ───────────────────────────────────────────────────────
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 9, minWidth: 172, paddingVertical: 2 },
  voiceButton: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  voiceBody: { flex: 1, minWidth: 96 },
  voiceTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.15)', overflow: 'hidden' },
  voiceTrackMine: { backgroundColor: 'rgba(255,255,255,0.3)' },
  voiceFill: { height: 4, backgroundColor: nospiColors.purpleDark },
  voiceFillMine: { backgroundColor: '#FFFFFF' },
  voiceFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  voiceTime: { fontSize: 11, color: '#6b5560' },
  voiceRate: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9,
    backgroundColor: 'rgba(136,14,79,0.12)',
  },
  voiceRateMine: { backgroundColor: 'rgba(255,255,255,0.22)' },
  voiceRateOff: { opacity: 0.55 },
  voiceRateText: { fontSize: 10.5, fontWeight: '700', color: nospiColors.purpleDark },
  voiceRateTextMine: { color: '#FFFFFF' },
  voiceTimeMine: { color: 'rgba(255,255,255,0.75)' },

  // Barra que sustituye a la caja de texto mientras se graba.
  recordingBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  recordingDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#FF5A6E' },
  recordingTime: { fontSize: 14, fontWeight: '700', color: '#FFFFFF', minWidth: 40 },
  recordingHint: { fontSize: 11.5, color: 'rgba(255,255,255,0.6)', flexShrink: 1 },

  mentionText: { fontWeight: '700', color: nospiColors.purpleDark },
  mentionTextMine: { color: '#FFD9EC' },
  mentionBar: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  mentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  mentionName: { fontSize: 14, color: '#FFFFFF', fontWeight: '600' },
  mentionHint: { fontSize: 11.5, color: 'rgba(255,255,255,0.6)', fontWeight: '400' },
  mentionAllIcon: {
    width: 28, height: 28, borderRadius: 14, marginRight: 9,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },

  // ── Banda de mensaje fijado ────────────────────────────────────────────
  pinnedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: 'rgba(0,0,0,0.22)',
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  pinnedIcon: { fontSize: 15 },
  pinnedTextBox: { flex: 1, minWidth: 0 },
  pinnedLabel: { fontSize: 10.5, fontWeight: '700', color: '#F8BBD0', marginBottom: 1 },
  pinnedPreview: { fontSize: 12.5, color: 'rgba(255,255,255,0.9)' },
  pinnedRemove: { fontSize: 15, color: 'rgba(255,255,255,0.65)', paddingHorizontal: 4 },

  pollLoading: { fontSize: 13, color: 'rgba(255,255,255,0.7)', paddingVertical: 6 },
  pollCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 12,
    padding: 11,
    minWidth: 220,
    marginBottom: 4,
  },
  pollQuestion: { fontSize: 14, fontWeight: '700', color: '#1a0d14', marginBottom: 9, lineHeight: 19 },
  pollOption: {
    borderWidth: 1,
    borderColor: '#E6DDE2',
    borderRadius: 9,
    paddingVertical: 9,
    paddingHorizontal: 11,
    marginBottom: 6,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  pollOptionMine: { borderColor: nospiColors.purpleDark, borderWidth: 1.5 },
  pollOptionFill: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    backgroundColor: '#FCE4EC',
  },
  pollOptionText: { fontSize: 13.5, color: '#1a0d14', flex: 1 },
  pollOptionTextMine: { fontWeight: '700', color: nospiColors.purpleDark },
  pollOptionPct: { fontSize: 12, fontWeight: '700', color: '#6b5560', marginLeft: 8 },
  pollStarsRow: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  pollStar: { fontSize: 31, color: '#CBD5E1', lineHeight: 36 },
  pollStarOn: { color: '#F59E0B' },
  pollStarDisabled: { opacity: 0.6 },
  pollFooter: { fontSize: 11, color: '#6b5560', marginTop: 5 },

  // Canal en solo lectura: sustituye a la barra de escribir.
  channelLockedBar: {
    paddingTop: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  channelLockedText: { fontSize: 13, color: 'rgba(255,255,255,0.8)', textAlign: 'center' },
  bubbleMine: { backgroundColor: '#880E4F', borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4 },
  senderName: { fontSize: 11, fontWeight: '700', color: '#AD1457', marginBottom: 2 },
  messageText: { fontSize: 15, color: '#2a2a2e', lineHeight: 20 },
  messageTextMine: { color: '#FFFFFF' },
  linkText: { color: '#0a58ca', textDecorationLine: 'underline' },
  linkTextMine: { color: '#dce9ff', textDecorationLine: 'underline' },
  messageTime: { fontSize: 10, color: 'rgba(42,42,46,0.45)', marginTop: 3, alignSelf: 'flex-end' },
  messageTimeMine: { color: 'rgba(255,255,255,0.65)' },
  emptyMessages: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyMessagesText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center' },
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 2,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
  },
  replyPreviewBar: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: '#F06292', marginRight: 8 },
  replyPreviewName: { color: '#F8BBD0', fontSize: 12, fontWeight: '800', marginBottom: 1 },
  replyPreviewText: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  replyPreviewClose: { padding: 6, marginLeft: 6 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  textInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#FFFFFF',
    // 16px es el minimo para que Safari en iOS no haga auto-zoom al enfocar
    // el input (con <16px, el navegador agranda toda la pagina al escribir,
    // lo que corta los botones de los extremos -- el bug reportado en web).
    fontSize: 16,
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: nospiColors.purpleLight,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { backgroundColor: 'rgba(255,255,255,0.2)' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: nospiColors.purpleDark },
  modalSubtitle: { fontSize: 13, color: nospiColors.gray500, marginBottom: 16 },
  participantsScroll: { maxHeight: 340 },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: nospiColors.gray100,
  },
  participantAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  participantAvatarPlaceholder: {
    backgroundColor: nospiColors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantName: { flex: 1, fontSize: 15, fontWeight: '600', color: nospiColors.gray800 },
  mediaImage: { borderRadius: 12, marginBottom: 6, backgroundColor: 'rgba(0,0,0,0.06)' },
  mediaPlaceholder: {
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaVideoBox: {
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaPlayCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaMeta: {
    position: 'absolute',
    bottom: 8,
    right: 10,
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  pendingBar: {
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  pendingScroll: { paddingHorizontal: 14, gap: 10 },
  pendingItem: { width: 62, height: 62 },
  pendingThumb: { width: 62, height: 62, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.2)' },
  pendingVideoThumb: { backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  pendingRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingHint: {
    marginTop: 8,
    paddingHorizontal: 16,
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
  },
  uploadingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  uploadingText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  attachButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  attachOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  attachSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
  },
  attachSheetTitle: { fontSize: 17, fontWeight: '800', color: nospiColors.gray800 },
  attachSheetHint: { fontSize: 13, color: nospiColors.gray400, marginTop: 4, marginBottom: 10 },
  attachOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: nospiColors.gray100,
  },
  attachOptionText: { fontSize: 15, fontWeight: '600', color: nospiColors.gray800 },
  attachCancel: { paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  attachCancelText: { fontSize: 15, fontWeight: '700', color: nospiColors.gray400 },
  mediaActionsRow: { flexDirection: 'row', gap: 16, marginTop: 6, marginBottom: 2 },
  mediaActionLink: { fontSize: 12, fontWeight: '700', color: '#6B21A8' },
  mediaActionLinkMine: { color: 'rgba(255,255,255,0.9)' },
  photoViewerActions: {
    position: 'absolute',
    flexDirection: 'row',
    gap: 12,
  },
  photoViewerActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  photoViewerActionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  photoViewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  photoViewerImage: { width: '90%', height: '75%' },
  photoViewerClose: {
    position: 'absolute',
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
