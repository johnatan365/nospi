import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
// El KeyboardAvoidingView de react-native NO compensa nada en Android cuando la
// app usa edge-to-edge: la ventana ya no se encoge al abrir el teclado. Este
// otro mide el teclado de verdad y funciona igual en las dos plataformas.
import { KeyboardAvoidingView, useKeyboardState, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Reanimated, {
  useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, withDelay,
} from 'react-native-reanimated';
import { Image as ExpoImage } from 'expo-image';
import { AvatarNospi, avatarPorGenero } from '@/components/AvatarNospi';
import { FichaPersona } from '@/components/FichaPersona';
import { anotarLeidoHasta } from '@/utils/leidoReciente';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { nospiColors } from '@/constants/Colors';
import { toque, toqueFuerte, error as hapticoError } from '@/lib/haptics';
import { useSupabase } from '@/contexts/SupabaseContext';
import { supabase } from '@/lib/supabase';
import { IconSymbol } from '@/components/IconSymbol';
// Para los checks se usa MaterialIcons DIRECTO y no IconSymbol: el doble
// check de verdad ('done-all') solo existe en el set de Material, y en iPhone
// IconSymbol usa SF Symbols, que no tiene equivalente. MaterialIcons es una
// fuente, asi que se ve igual en iPhone, Android y web.
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { CATEGORIAS_EMOJI, REACCIONES_RAPIDAS } from '@/constants/Emojis';
import { textoUltimaVez } from '@/constants/Privacidad';
import {
  anuncioDePresencia, idsPresentes, textoEnLinea, tocarUltimaVez, pedirUltimaVez,
  type AnuncioDePresencia,
} from '@/lib/presencia';
import { useMiPrivacidad } from '@/lib/useMiPrivacidad';
import { getCached, setCached } from '@/utils/cache';
import * as ImagePicker from 'expo-image-picker';
import {
  gifsBuscar,
  gifsTendencia,
  giphyConfigurado,
  GiphySinCupo,
  type Gif,
} from '@/lib/giphy';
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
import { requireOptionalNativeModule } from 'expo-modules-core';
import * as Notifications from 'expo-notifications';
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
// Antes duraba 1 hora, y como el enlace de una foto solo se pedia UNA vez por
// pantalla, al pasar esa hora las fotos dejaban de cargarse: justo lo que pasa
// si dejas el chat abierto durante un evento.
//
// Ademas, la duracion larga es lo que permite REUTILIZAR el mismo enlace entre
// sesiones. Como la cache de imagenes guarda por direccion, y cada firma nueva
// generaba una direccion distinta, la cache no servia de nada y cada foto se
// volvia a descargar entera cada vez que se abria el chat.
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 dias

// Se vuelve a firmar cuando le queda menos de un dia, para que nunca caduque
// mientras alguien la esta mirando.
const SIGNED_URL_RENEW_BEFORE_MS = 24 * 60 * 60 * 1000;

// Los enlaces se guardan en el telefono para reutilizarlos en la proxima
// sesion; asi la direccion no cambia y la cache de imagenes por fin acierta.
const SIGNED_URL_CACHE_KEY = 'nospi_chat_signed_urls_v1';

// Columnas que necesita la pantalla. Se centraliza para que la carga inicial y
// el insert al enviar devuelvan exactamente lo mismo.
const MESSAGE_COLUMNS =
  'id, conversation_id, sender_id, content, created_at, reply_to, media_path, media_kind, media_mime, media_width, media_height, media_size, media_duration, poll_id, pinned_at, pinned_by, media_expired';

// Tope por archivo, igual al que tiene el bucket. Se comprueba tambien aqui
// para poder explicarlo con palabras en vez de soltar el error crudo de Storage.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// media_path guarda normalmente una ruta dentro del bucket privado, que hay que
// firmar para poder mostrarla. Hay dos excepciones que se usan tal cual:
//   - los GIFs, que guardan el enlace publico de GIPHY;
//   - la foto que se esta subiendo, que mientras tanto se muestra desde el
//     archivo del propio telefono (file://, blob:, content://).
const esEnlaceDirecto = (path?: string | null) =>
  !!path && /^(https?|file|blob|data|content):/.test(path);

// Las fotos y videos se borran solos al mes; las notas de voz se quedan.
const MEDIA_RETENTION_DAYS = 30;

// Ancho maximo de una foto/video dentro de la burbuja. La altura se calcula
// con la proporcion real del archivo para que no se vea deformado.
const MEDIA_MAX_WIDTH = 210;

// La caja de escribir crece con el texto, como en WhatsApp: desde un renglon
// hasta seis, y de ahi en adelante se queda quieta y hace scroll por dentro.
// Sin esto solo se veia el renglon donde iba el cursor, asi que para corregir
// algo de mas arriba habia que adivinar donde estaba.
//
// 42 = un renglon (20 de linea + 22 de relleno), y es la misma altura que los
// botones de los lados, asi los tres quedan alineados.
// El chat SIEMPRE abre donde la persona se quedo leyendo, y si no quiere leerlo
// todo se baja con la flecha de la esquina.
//
// Pero la primera carga trae solo los ultimos PAGINA mensajes, y hay gente con
// cientos sin leer: su punto de lectura no viene en esa pagina. Cuando pasa, se
// extiende hacia atras HASTA la marca con una segunda consulta -- solo para
// quien lo necesita, no en cada apertura.
//
// Y con un techo: sin el, alguien que no entra a la Comunidad en meses abriria
// el chat cargando miles de mensajes. Si se pasa de aqui se abre en lo mas
// viejo que se trajo, con "Ver mensajes anteriores" arriba para seguir.
const MAX_MENSAJES_AL_ABRIR = 250;

// Donde se guarda la copia de la lista de participantes. Ver loadEverything.
const CLAVE_PARTICIPANTES = (id: string) => `chat_participantes_${id}`;

const INPUT_ALTURA_MIN = 42;
const INPUT_ALTURA_MAX = 142;
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

// Un sticker se manda como una imagen mas --media_kind 'image' con la URL
// publica-- porque asi reusa todo el camino que ya existe. Pero NO se tiene que
// ver como una foto: en WhatsApp va chico y sin globo de color, flotando sobre
// el fondo. Reconocerlo por la URL evita agregarle una columna a cada mensaje.
const CARPETA_STICKERS = '/storage/v1/object/public/stickers/';
const STICKER_EN_CHAT = 128;   // WhatsApp ronda este tamaño; una foto va al doble
function esSticker(path?: string | null): boolean {
  return !!path && path.includes(CARPETA_STICKERS);
}

// Extension y tipo MIME del archivo tal como lo entrega el selector. No se
// recomprime ni se redimensiona nada: lo que se sube es el original.
interface StickerDeNospi {
  id: string;
  url: string;
  etiqueta: string | null;
}

// ── Pegar imagenes: apagado hasta que salga el build que lo soporta ────────
//
// QUE PASO, PARA QUE NO SE REPITA
// El 7 de octubre se publico un OTA con esto encendido y la app se cerraba al
// tocar el "+". El archivo de expo-clipboard hace requireNativeModule al
// IMPORTARSE, y en un binario que no trae el modulo nativo eso no es una
// excepcion de JavaScript que se pueda atrapar: se cae por debajo. El
// try/catch que habia alrededor del require NO alcanzo. Se revirtio con
// `eas update:roll-back-to-embedded`.
//
// Ahora hay dos candados, y el de afuera es el que importa:
//
//   1. El interruptor. Mientras este en false, NINGUN camino llega a
//      expo-clipboard, asi que un OTA no puede romper nada por aqui. Se
//      enciende en el mismo cambio que suba la version del build -- o sea,
//      cuando el binario ya traiga el modulo.
//   2. requireOptionalNativeModule, que es la API que Expo hizo justo para
//      esto: pregunta por el modulo nativo y devuelve null en vez de reventar,
//      sin cargar el paquete. Es lo que se debio usar desde el principio.
//
// El candado 2 deberia bastar. El 1 esta porque no hay forma de probar un
// binario viejo desde aqui, y ya nos costo una caida en produccion.
const PEGAR_IMAGEN_DISPONIBLE = false;

let _clipboard: any | null = null;
let _clipboardProbado = false;
function portapapeles(): any | null {
  if (_clipboardProbado) return _clipboard;
  _clipboardProbado = true;
  if (!PEGAR_IMAGEN_DISPONIBLE) { _clipboard = null; return _clipboard; }
  try {
    // Se le pregunta al runtime SIN importar expo-clipboard.
    if (!requireOptionalNativeModule('ExpoClipboard')) { _clipboard = null; return _clipboard; }
    _clipboard = require('expo-clipboard');
  } catch { _clipboard = null; }
  return _clipboard;
}

// OJO SI ALGUIEN QUIERE DISTINGUIR LOS STICKERS: `kind` es lo que termina en
// chat_messages.media_kind, y get_expired_chat_media (la limpieza mensual) solo
// recoge 'image' y 'video'. Marcar un sticker como 'sticker' lo sacaria de esa
// consulta y el archivo se quedaria en el bucket para siempre, sin que nadie se
// entere. Si hace falta distinguirlos, que sea con otra columna, no con esta.
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
  // SOLO EN LA APP, nunca viene de la base: el mensaje ya se pinto pero el
  // servidor aun no lo confirma. Se dibuja con un relojito.
  pending?: boolean;
}

interface Participant {
  user_id: string;
  name: string;
  profile_photo_url: string | null;
  // Los trae get_conversation_participants para la ficha que se abre al tocar
  // una foto. Deliberadamente NO viene el rango de edad que la persona pidio:
  // mostrarlo reconstruiria la lectura de app de citas y expone una
  // preferencia privada.
  edad?: number | null;
  interests?: string[] | null;
  gender?: string | null;
  personality_traits?: string[] | null;
  city?: string | null;
  fotos?: string[] | null;
}

interface ConversationMeta {
  conv_type: 'event_group' | 'direct' | 'channel_global' | 'channel_event' | 'community';
  /** Genero de la otra persona en un privado, para el avatar por defecto. */
  other_user_gender?: string | null;
  // Solo en directos: 'pendiente' mientras la solicitud no se responda.
  estado?: 'pendiente' | 'aceptada' | 'ignorada' | null;
  solicitada_por?: string | null;
  event_name: string | null;
  event_type: string | null;
  event_date: string | null;
  // El id hace falta para pedir su "ultima vez" y para saber si esta en linea.
  other_user_id: string | null;
  other_user_name: string | null;
  other_user_photo: string | null;
  // Solo en canales: si la gente puede responder, y el nombre del canal.
  replies_open?: boolean | null;
  channel_title?: string | null;
}

function eventEmoji(eventType: string | null | undefined): string {
  return eventType === 'bar' ? '🍸' : eventType === 'caminata' ? '🚶' : eventType === 'cafe' ? '☕' : eventType === 'bolos' ? '🎳' : eventType === 'virtual' ? '🎥' : '🍽️';
}

// Mismos íconos PNG que usa la pestaña de Eventos. El require debe ser estático
// (literal) para que Metro lo empaquete; por eso se resuelve con un switch.
function eventIconSource(eventType: string | null | undefined) {
  switch (eventType) {
    case 'caminata': return require('@/assets/images/icon-caminata.png');
    case 'bar': return require('@/assets/images/icon-bar.png');
    case 'cafe': return require('@/assets/images/icon-cafe.png');
    case 'bolos': return require('@/assets/images/icon-bolos.png');
    case 'virtual': return require('@/assets/images/icon-videollamada.png');
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
// alignTop: pega la foto ARRIBA de la burbuja, a la altura del nombre, en vez
// de abajo. La fila del mensaje alinea al final (alignItems: 'flex-end') porque
// eso es lo correcto para la burbuja, pero arrastraba tambien la foto: en un
// mensaje de varias lineas el nombre quedaba arriba y el circulito alla abajo,
// sin relacion visible entre los dos.
//
// El marginTop de 3 lo centra con el renglon del nombre: la burbuja tiene 10 de
// relleno arriba y el nombre mide unos 13, asi que su centro cae a ~16,5 -- y el
// de una foto de 26 cae a 13.
function ChatAvatar({
  uri, name, size, marginRight = 0, onPress, alignTop = false, enLinea = false, gender,
}: {
  uri: string | null; name: string; size: number; marginRight?: number;
  onPress?: () => void; alignTop?: boolean;
  /** Punto verde en la esquina: la persona tiene la app abierta ahora. */
  enLinea?: boolean;
  /** Para pintar el personaje de Nospi cuando no hay foto. */
  gender?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: size / 2, marginRight } as const;
  const fuera = alignTop ? { alignSelf: 'flex-start' as const, marginTop: 3 } : null;
  // Quien no subio foto sale con el personaje de Nospi segun su genero, no con
  // la inicial: el 89% de las personas no tiene foto y una lista de chat
  // entera de iniciales se lee como una app a medio hacer. Si no hay genero
  // (o es "no binario"), AvatarNospi vuelve solo a la inicial.
  const porDefecto = !uri || failed ? avatarPorGenero(gender) : null;
  const inner = uri && !failed ? (
    // cache 'force-cache': una vez descargada, la foto se reusa desde el cache
    // (no se vuelve a bajar al salir y volver al chat) -> queda estática.
    <ExpoImage source={{ uri }} style={box} cachePolicy="memory-disk" transition={0} onError={() => setFailed(true)} />
  ) : porDefecto ? (
    <ExpoImage source={porDefecto} style={box} cachePolicy="memory-disk" transition={0} contentFit="cover" />
  ) : (
    <View style={[box, styles.avatarInitials]}>
      <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: size * 0.42 }}>{initialsOf(name)}</Text>
    </View>
  );
  // El punto va en una envoltura con position relative. El borde es del color
  // del fondo para que se lea como "encima de la foto" y no como un pegote.
  const conPunto = enLinea ? (
    <View style={{ position: 'relative' }}>
      {inner}
      <View style={[styles.puntoEnLinea, {
        width: Math.max(9, size * 0.34),
        height: Math.max(9, size * 0.34),
        borderRadius: Math.max(9, size * 0.34) / 2,
        right: marginRight,
      }]} />
    </View>
  ) : inner;

  if (onPress) {
    return <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={fuera}>{conPunto}</TouchableOpacity>;
  }
  return alignTop || enLinea ? <View style={fuera}>{conPunto}</View> : inner;
}

// Uno de los tres puntitos que saltan. Va en su propio componente porque cada
// uno necesita sus propios hooks de animacion: meterlos en un bucle dentro del
// padre romperia las reglas de los hooks.
function PuntoQueSalta({ retraso }: { retraso: number }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withDelay(retraso, withRepeat(
      withSequence(withTiming(-4, { duration: 300 }), withTiming(0, { duration: 500 })),
      -1, false,
    ));
  }, [retraso, y]);
  const estilo = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
    opacity: 0.55 + (-y.value / 4) * 0.45,
  }));
  return <Reanimated.View style={[styles.puntoEscribiendo, estilo]} />;
}

// "Fulano esta escribiendo", al final de la lista de mensajes.
//
// UNA SOLA FILA, pase lo que pase: hasta tres caras encimadas y el resto como
// "+N". Con una burbuja por persona, cuatro a la vez se comen unos 140 px --
// con el teclado abierto, casi la mitad de lo que queda visible-- y en la
// Comunidad (233 personas) podrian ser ocho. Asi el alto es el mismo con una
// que con ocho, y solo hay una cosa animandose en pantalla.
const CARAS_MAX = 3;

function FilaEscribiendo({
  quienes, onTocarCara,
}: {
  quienes: { user_id: string; nombre: string; foto: string | null; gender?: string | null }[];
  // Tocar la cara abre la ficha de esa persona, igual que en las burbujas y en
  // la cabecera. Devuelve undefined si no se tiene cargada: entonces no se
  // puede abrir nada y la foto no responde al toque.
  onTocarCara: (userId: string) => (() => void) | undefined;
}) {
  if (quienes.length === 0) return null;
  const caras = quienes.slice(0, CARAS_MAX);
  const sobran = quienes.length - caras.length;
  // El nombre solo cuando cabe y sirve. De tres en adelante el numero se lee
  // mas rapido que tres nombres, y no desborda.
  const texto = quienes.length === 1
    ? quienes[0].nombre
    : quienes.length === 2
    ? `${quienes[0].nombre} y ${quienes[1].nombre}`
    : `${quienes.length} escribiendo`;

  return (
    <View style={styles.filaEscribiendo}>
      <View style={styles.pilaCaras}>
        {caras.map((q, i) => (
          <View key={`${q.user_id}-${i}`} style={[styles.caraPila, i > 0 && styles.caraPilaEncimada]}>
            <ChatAvatar uri={q.foto} name={q.nombre} gender={q.gender} size={26} onPress={onTocarCara(q.user_id)} />
          </View>
        ))}
        {sobran > 0 && (
          <View style={[styles.caraPila, styles.caraPilaEncimada, styles.caraMas]}>
            <Text style={styles.caraMasTexto}>+{sobran}</Text>
          </View>
        )}
      </View>
      <View style={styles.burbujaPuntos}>
        <PuntoQueSalta retraso={0} />
        <PuntoQueSalta retraso={180} />
        <PuntoQueSalta retraso={360} />
      </View>
      <Text style={styles.textoEscribiendo} numberOfLines={1}>{texto}</Text>
    </View>
  );
}

// Detecta URLs (http/https o que empiecen por www.) para poder abrirlas al tocar.
const URL_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

// Detecta numeros de celular colombianos escritos como los escribe la gente:
// 3001234567, 300 123 4567, 300-1234567, +57 300 123 4567. Tambien fijos con
// el formato nuevo de 10 digitos (604...).
//
// Se exige la forma completa de 10 digitos empezando en 3 o en 60 justamente
// para NO marcar lo que no es un telefono: precios ($29.900), horas (7:30),
// fechas (12/09/2026) y anios quedan por fuera porque no llegan a esa forma.
// El (?!\d) del final evita comerse los primeros 10 digitos de un numero mas
// largo; que no venga pegado a un digito por la izquierda se valida aparte, en
// splitPhones, porque el lookbehind no es confiable en Hermes.
const PHONE_RE = /(?:\+?57[\s-]?)?(?:3\d{2}|60\d)[\s-]?\d{3}[\s-]?\d{4}(?!\d)/g;

// Deja el numero en el formato que piden wa.me y tel:, siempre con indicativo.
function phoneDigits(raw: string): string {
  const d = (raw || '').replace(/\D/g, '');
  if (d.length === 10) return `57${d}`;
  return d;
}

// Como se ve el numero al mostrarlo en el menu: +57 300 123 4567.
function phonePretty(raw: string): string {
  const d = phoneDigits(raw);
  if (d.length === 12 && d.startsWith('57')) {
    const n = d.slice(2);
    return `+57 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  }
  return raw;
}

// Parte un trozo de texto en pedazos, separando los telefonos del resto.
// Se usa exec() y no split() porque hace falta saber en que posicion quedo cada
// coincidencia para poder mirar el caracter anterior.
function splitPhones(part: string): { text: string; phone: boolean }[] {
  const out: { text: string; phone: boolean }[] = [];
  let last = 0;
  PHONE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PHONE_RE.exec(part)) !== null) {
    const start = m.index;
    // Si viene pegado a otro digito no es un telefono, es un pedazo de un
    // numero mas largo (una cedula, un codigo). Se deja como texto normal.
    if (start > 0 && /\d/.test(part[start - 1])) continue;
    if (start > last) out.push({ text: part.slice(last, start), phone: false });
    out.push({ text: m[0], phone: true });
    last = start + m[0].length;
  }
  if (last < part.length) out.push({ text: part.slice(last), phone: false });
  return out;
}

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

// Copias sin la bandera /g del regex de menciones, guardadas para no volver a
// compilarlas.
//
// Un regex global guarda lastIndex entre llamadas de .test(), asi que para
// probar hace falta una copia sin esa bandera. El problema era que se creaba
// UNA POR MENSAJE: mentionRegex mete TODOS los nombres del chat en una sola
// alternancia, y en el Canal Nospi son 3.574 -- unos 50 kB de expresion
// recompilados cincuenta veces seguidas, en el mismo hilo que pinta la
// pantalla. El WeakMap no retiene nada: la copia se va con el original.
const copiasSinG = new WeakMap<RegExp, RegExp>();
function regexParaProbar(re: RegExp): RegExp {
  let copia = copiasSinG.get(re);
  if (!copia) {
    copia = new RegExp(re.source, re.flags.replace(/g/g, ''));
    copiasSinG.set(re, copia);
  }
  return copia;
}

// A quien hay que poder NOMBRAR en pantalla: quien escribio algo de lo que esta
// cargado, quien tiene un mensaje fijado y quien reacciono.
//
// Es lo que sustituye al censo completo en los canales. El propio id va SIEMPRE
// aunque no se haya escrito nada: el aviso de "escribiendo" manda el nombre y la
// foto propios, y sin el perfil llegaria como "Alguien".
function idsQueHayQueNombrar(
  msgs: Message[],
  fijadosAhora: Message[],
  reacciones: Record<string, { emoji: string; user_id: string }[]>,
  yo?: string | null,
): string[] {
  const vistos = new Set<string>();
  const anadir = (id?: string | null) => {
    // El usuario del sistema no es participante de ningun chat: pedirlo seria
    // un id gastado en cada peticion.
    if (id && id !== NOSPI_SYSTEM_USER_ID) vistos.add(id);
  };
  anadir(yo);
  for (const m of msgs) anadir(m.sender_id);
  for (const m of fijadosAhora) anadir(m.sender_id);
  for (const lista of Object.values(reacciones || {})) {
    for (const r of lista || []) anadir(r.user_id);
  }
  return Array.from(vistos);
}

// Mete el mensaje REAL en la lista quitando el provisional que lo representaba.
//
// Hace falta porque el mensaje llega por DOS caminos que compiten: la respuesta
// del insert y el aviso de tiempo real. Sin esto, segun cual gane, el mensaje
// se veria dos veces.
//
// - Si ya esta por id, no se vuelve a meter.
// - Si viene por tiempo real (sin tempId) se busca el provisional propio con el
//   mismo texto, que es justamente el que este mensaje viene a confirmar.
function fusionarMensajeReal(prev: Message[], real: Message, tempId?: string | null): Message[] {
  const yaEsta = prev.some((m) => m.id === real.id);
  const sinProvisional = prev.filter((m) => {
    if (!m.pending) return true;
    if (tempId) return m.id !== tempId;
    return !(m.sender_id === real.sender_id && m.content === real.content);
  });
  return yaEsta ? sinProvisional : [...sinProvisional, real];
}

function renderMessageContent(
  text: string,
  mine: boolean,
  mentions?: RegExp | null,
  onPhone?: (raw: string) => void,
) {
  if (!text) return null;

  // ATAJO para el caso comun: si el mensaje no trae link, ni telefono, ni
  // mencion, se devuelve como texto PLANO. Antes hasta estos mensajes salian
  // envueltos en <Text> anidados y, con el lineHeight fijo de messageText, iOS
  // medita mal la altura y se comia la ULTIMA LINEA: el mensaje aparecia
  // cortado aunque en la base de datos estuviera completo.
  // Ojo con los regex: URL_RE y PHONE_RE son globales (/g) y .test() guarda
  // lastIndex entre llamadas, por eso aca se usan copias sin la bandera g.
  const tieneLink = /(https?:\/\/|www\.)/i.test(text);
  const tieneTelefono = new RegExp(PHONE_RE.source).test(text);
  // El text.includes('@') va primero y es casi gratis: la gran mayoria de los
  // mensajes no mencionan a nadie, y asi ni se toca el regex de menciones.
  const tieneMencion = mentions && text.includes('@')
    ? regexParaProbar(mentions).test(text)
    : false;
  if (!tieneLink && !tieneTelefono && !tieneMencion) return text;

  // Menciones dentro de un trozo que ya se sabe que no es link ni telefono.
  const withMentions = (part: string, key: string | number) => {
    if (mentions) {
      // El split conserva los grupos capturados, asi que las menciones quedan
      // en las posiciones impares del arreglo.
      const chunks = part.split(mentions);
      if (chunks.length > 1) {
        return (
          <Text key={key}>
            {chunks.map((c, j) =>
              j % 2 === 1
                ? <Text key={j} style={[styles.mentionText, mine && styles.mentionTextMine]}>{c}</Text>
                : <Text key={j}>{c}</Text>
            )}
          </Text>
        );
      }
    }
    return <Text key={key}>{part}</Text>;
  };

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
    // Los telefonos se buscan solo aca, sobre el texto que ya se sabe que no es
    // un link: asi un numero que viva dentro de una URL no se vuelve tocable.
    const pedazos = splitPhones(part);
    if (pedazos.some((p) => p.phone)) {
      return (
        <Text key={i}>
          {pedazos.map((p, j) =>
            p.phone ? (
              <Text
                key={j}
                style={[styles.linkText, mine && styles.linkTextMine]}
                onPress={() => onPhone?.(p.text)}
              >
                {p.text}
              </Text>
            ) : (
              withMentions(p.text, j)
            )
          )}
        </Text>
      );
    }

    return withMentions(part, i);
  });
}

// Envuelve cada mensaje para permitir DESLIZAR hacia la derecha y responder,
// igual que WhatsApp. Al arrastrar aparece una flecha ↩︎ y, si se pasa del
// umbral, se activa el responder al soltar. En web el arrastre con mouse es
// incomodo, asi que alli la via principal sigue siendo mantener presionado.
// Los 6 emojis de reaccion rapida, iguales a los de WhatsApp.
// Los seis de la barra rapida y el catalogo completo del boton "+" viven
// juntos en constants/Emojis.ts, para que no se desincronicen.
const QUICK_REACTIONS = REACCIONES_RAPIDAS;

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

  // Una nota vieja en WebM no se puede oir en iPhone (iOS no soporta ese
  // formato). Se detecta que el archivo llego pero el reproductor no lo cargo,
  // para poder decirlo en vez de que el boton no haga nada.
  const [noSePuede, setNoSePuede] = useState(false);
  useEffect(() => {
    if (!uri) return;
    const t = setTimeout(() => {
      if (status && status.isLoaded === false) setNoSePuede(true);
    }, 2500);
    return () => clearTimeout(t);
  }, [uri, status?.isLoaded]);

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
      {/* El boton y la barra van en la MISMA fila para que sus centros
          coincidan. Antes el boton se centraba contra todo el bloque --barra
          mas tiempo mas velocidad--, y como el tiempo cuelga debajo, la barra
          terminaba unos 11 px por encima del centro del boton. */}
      <View style={styles.voiceTop}>
        <TouchableOpacity onPress={toggle} disabled={!uri} style={styles.voiceButton} activeOpacity={0.7}>
          {!uri ? (
            <ActivityIndicator size="small" color={mine ? '#FFFFFF' : nospiColors.purpleDark} />
          ) : (
            <View style={!playing ? styles.voicePlayNudge : null}>
              {/* El triangulo de play tiene el peso visual a la izquierda y
                  dentro de un circulo se ve corrido. Un pixel a la derecha lo
                  deja donde el ojo lo espera. El de pausa es simetrico y no lo
                  necesita. */}
              <IconSymbol
                ios_icon_name={playing ? 'pause.fill' : 'play.fill'}
                android_material_icon_name={playing ? 'pause' : 'play-arrow'}
                size={19}
                color={mine ? '#FFFFFF' : nospiColors.purpleDark}
              />
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.voiceBody}>
          <View style={[styles.voiceTrack, mine && styles.voiceTrackMine]}>
            <View style={[styles.voiceFill, mine && styles.voiceFillMine, { width: `${pct}%` }]} />
          </View>
        </View>
      </View>
      <View style={styles.voiceFooter}>
          <Text style={[styles.voiceTime, mine && styles.voiceTimeMine]}>
            {formatDuration(playing || current > 0 ? current : total)}
          </Text>
          {noSePuede && (
            <Text style={[styles.voiceTime, mine && styles.voiceTimeMine]} numberOfLines={1}>
              No se puede reproducir aquí
            </Text>
          )}
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
    toqueFuerte();
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

  // Con el teclado abierto sobra el hueco que se reserva para la barra de
  // navegacion del sistema: el teclado ya la tapa, y ese espacio se ve como una
  // franja vacia entre el teclado y la barra de escribir.
  //
  // `progress` va de 0 (cerrado) a 1 (abierto) siguiendo la animacion real del
  // teclado, asi que el hueco se va encogiendo con el: si se hiciera con un
  // simple `visible ? 0 : insets.bottom` daria un salto justo al abrirlo.
  const { progress } = useReanimatedKeyboardAnimation();
  const padInput = useAnimatedStyle(() => ({
    paddingBottom: insets.bottom * (1 - progress.value) + 8,
  }));
  const padAviso = useAnimatedStyle(() => ({
    paddingBottom: insets.bottom * (1 - progress.value) + 10,
  }));


  const [messages, setMessages] = useState<Message[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);

  // Vuelve a pedir la lista de participantes.
  //
  // Hace falta porque en la media hora antes del evento la base solo devuelve a
  // quien YA escribio -- asi la conversacion tiene nombres sin revelar la lista
  // completa de quien va a ir. Como la lista se pide una sola vez al abrir el
  // chat, quien hable despues seguiria saliendo como "Un participante" hasta
  // cerrar y volver a entrar.
  const recargarParticipantes = useCallback(async () => {
    if (!conversationId) return;
    const { data, error } = await supabase.rpc('get_conversation_participants_v2', {
      p_conversation_id: conversationId,
    });
    if (error) { console.error('ChatThread: error recargando participantes', error); return; }
    if (data) setParticipants(data as Participant[]);
  }, [conversationId]);

  // Pide perfiles del chat. Con una lista de ids pide SOLO esos; con null, a
  // todos. Las reglas de quien se puede ver las aplica la base
  // (get_chat_perfiles), igual que para la lista completa: pasar ids de gente
  // ajena al chat no devuelve nada.
  //
  // Existe para los canales. El Canal Nospi tiene 3.574 participantes y pedir
  // el censo eran 1,5 MB por cada vez que se abria -- creciendo con cada
  // registro-- cuando ahi esa lista no se muestra en ninguna parte: el boton de
  // "Asistentes" solo sale si el chat es grupo o Comunidad.
  const pedirPerfiles = useCallback(async (ids: string[] | null): Promise<Participant[] | null> => {
    if (!conversationId) return null;
    // Sin ids que pedir no se llama: null significa "todos" en la base, y
    // mandarlo por descuido traeria justo el censo que queremos evitar.
    if (ids && ids.length === 0) return [];
    // Cuando se quiere a todos NO se manda el parametro, en vez de mandarlo en
    // null: la funcion ya lo tiene por defecto en null, y asi el resultado no
    // depende de como serialice PostgREST un null para un uuid[].
    const { data, error } = await supabase.rpc(
      'get_chat_perfiles',
      ids ? { p_conversation_id: conversationId, p_user_ids: ids }
          : { p_conversation_id: conversationId },
    );
    if (error) {
      console.error('ChatThread: error pidiendo perfiles', error);
      return null;
    }
    return (data as Participant[]) || [];
  }, [conversationId]);

  const [meta, setMeta] = useState<ConversationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  // Menu de acciones al mantener presionado un mensaje (Responder / Copiar).
  // Antes "responder" solo existia como gesto oculto de mantener presionado,
  // asi que mucha gente no sabia que se podia.
  const [actionMsg, setActionMsg] = useState<Message | null>(null);
  // Mensaje cuyas reacciones se estan mirando. Antes se veia el emoji y el
  // numero pero no quien habia reaccionado, que es lo primero que uno quiere
  // saber. El dato ya se guardaba (chat_message_reactions tiene user_id);
  // solo faltaba mostrarlo.
  const [reaccionesDe, setReaccionesDe] = useState<string | null>(null);

  // Buscar dentro de la conversacion.
  //
  // Se busca en el SERVIDOR y no entre los mensajes ya cargados: la lista
  // arranca con los ultimos 50 y las conversaciones largas -la mas larga tiene
  // 204 mensajes- se quedarian sin buscar en casi todo su historial. Las
  // politicas de la base ya dejan a un participante leer su conversacion, asi
  // que no hizo falta ninguna funcion nueva.
  const [buscando, setBuscando] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [resultados, setResultados] = useState<Message[] | null>(null);
  const [buscandoAhora, setBuscandoAhora] = useState(false);
  // Se esta viendo un tramo viejo al que se salto desde un resultado, en vez
  // del final de la conversacion.
  const [enTramoViejo, setEnTramoViejo] = useState(false);

  // "Fulano esta escribiendo...".
  //
  // Va por broadcast del canal de tiempo real y NO por una tabla: es
  // informacion que vale dos segundos y guardarla en la base seria escribir
  // miles de filas al dia para borrarlas enseguida.
  //
  // Se recuerda CUANDO aviso cada quien, no un si/no, porque si alguien cierra
  // la app a mitad de una palabra no llega ningun "ya pare" y el aviso se
  // quedaria pegado para siempre. Al no refrescarse, caduca solo.
  const [escribiendo, setEscribiendo] = useState<Record<string, { nombre: string; foto: string | null; ts: number }>>({});
  const canalRef = useRef<any>(null);
  const ultimoAvisoRef = useRef(0);

  // ── Donde abrir el chat y hasta donde marcar leido ────────────────────────
  //
  // `cortaNoLeidos` es mi last_read_at EN EL MOMENTO DE ABRIR, y se queda
  // congelado: si se moviera mientras se lee, la linea de "no leidos" iria
  // bajando sola y no se sabria donde se quedo uno.
  const [cortaNoLeidos, setCortaNoLeidos] = useState<string | null>(null);
  // Dos contadores, y la diferencia importa:
  //
  //  pendientesAlAbrir  se congela al abrir. Es el de la linea divisoria
  //                     ("10 mensajes sin leer"), que marca DONDE se quedo uno
  //                     y por eso no debe moverse mientras se lee.
  //
  //  pendientesVivos    baja a medida que los mensajes pasan por pantalla. Es
  //                     el del globito de la flecha. Antes el globito usaba el
  //                     congelado, asi que uno leia los 10, bajaba, volvia a
  //                     subir y la flecha seguia diciendo "10 sin leer".
  const [pendientesAlAbrir, setPendientesAlAbrir] = useState(0);
  const [pendientesVivos, setPendientesVivos] = useState(0);
  // La flecha de la esquina para bajar al ultimo mensaje. Es state y no ref
  // porque tiene que repintar al aparecer y desaparecer.
  const [mostrarBajar, setMostrarBajar] = useState(false);
  // A cuantos pixeles del final esta la vista. Se usa para traer a la vista el
  // aviso de "esta escribiendo", que es lo ultimo de la lista.
  const distanciaDelFinalRef = useRef(0);

  // ── Quien esta en linea ───────────────────────────────────────────────────
  // Los user_id presentes en el canal, sin contarme. Viene de Realtime
  // Presence, asi que es efimero: si alguien cierra la app desaparece solo.
  const [enLinea, setEnLinea] = useState<string[]>([]);
  // Mis dos interruptores. Si "en linea" esta apagado no me anuncio Y tampoco
  // leo el de los demas (reciprocidad).
  const { privacidad: miPrivacidad, enLineaParaAnunciar } = useMiPrivacidad(user?.id);
  // En un ref ademas del state: el canal se arma una vez y no debe rehacerse
  // cada vez que llegan los interruptores, pero sus manejadores si necesitan
  // el valor al dia.
  const mostrarRef = useRef(enLineaParaAnunciar);
  mostrarRef.current = enLineaParaAnunciar;
  const anuncioRef = useRef<AnuncioDePresencia | null>(null);
  // La ultima vez de la otra persona, solo en un chat privado.
  const [ultimaVezOtro, setUltimaVezOtro] = useState<string | null>(null);

  // Selector de emojis completo (el boton "+" de la barra de reacciones).
  // Guarda el mensaje al que se le va a reaccionar, porque el menu de acciones
  // se cierra al abrirlo: si no, al elegir el emoji ya no se sabria de cual era.
  const [emojisParaMensaje, setEmojisParaMensaje] = useState<Message | null>(null);
  const [categoriaEmoji, setCategoriaEmoji] = useState(CATEGORIAS_EMOJI[0].clave);

  // El mensaje mas nuevo que de verdad ESTUVO EN PANTALLA. Es lo que se manda
  // al marcar leido, en vez de now(): asi lo que no se vio no queda leido.
  const maxVistoRef = useRef<string | null>(null);
  // La colocacion inicial se hace una sola vez, en el primer onContentSizeChange.
  const yaColoqueInicialRef = useRef(false);

  // El id del primer mensaje sin leer: delante de el va la linea divisoria.
  // null si no hay pendientes o si ya no esta en lo cargado.
  const idPrimerNoLeido = useMemo(() => {
    if (!cortaNoLeidos || !user?.id) return null;
    const m = messages.find((x) => x.sender_id !== user.id && x.created_at > cortaNoLeidos);
    return m ? m.id : null;
  }, [messages, cortaNoLeidos, user?.id]);

  // Que mensajes estuvieron en pantalla. onViewableItemsChanged tiene que ser
  // una referencia ESTABLE o React Native avisa en consola, asi que la funcion
  // va en un ref y el handler nunca cambia.
  const vistosRef = useRef<Set<string>>(new Set());
  // De que conversacion es el set de arriba. Sirve para no borrarlo en una
  // recarga de la MISMA conversacion (ver loadEverything).
  const convDelSetRef = useRef<string | null>(null);
  // Alto de la ventana de la lista y alto de su contenido. Si el contenido cabe
  // sin desplazar, todo lo cargado esta literalmente en pantalla.
  const altoVistaRef = useRef(0);
  const altoContenidoRef = useRef(0);
  const alVerItemsRef = useRef<any>(null);
  alVerItemsRef.current = ({ viewableItems }: any) => {
    for (const v of viewableItems || []) {
      const ts = v?.item?.created_at;
      if (v?.item?.id) vistosRef.current.add(v.item.id);
      if (ts && (!maxVistoRef.current || ts > maxVistoRef.current)) maxVistoRef.current = ts;
    }
    // Cuantos quedan sin leer DE VERDAD: los de otros, posteriores a la marca,
    // que todavia no han pasado por pantalla.
    if (!cortaNoLeidos || !user?.id) return;
    const quedan = messages.filter(
      (m) => m.sender_id !== user.id && m.created_at > cortaNoLeidos && !vistosRef.current.has(m.id),
    ).length;
    // Solo si cambio: esto se dispara en cada desplazamiento y repintar la
    // pantalla por un numero igual no sirve de nada.
    setPendientesVivos((prev) => (prev === quedan ? prev : quedan));
  };
  const alVerItems = useCallback((info: any) => { alVerItemsRef.current?.(info); }, []);

  // Red de seguridad para onViewableItemsChanged, que no es de fiar.
  //
  // En la web, con pocos mensajes y nada que desplazar, la lista no siempre
  // reporta los items como visibles: no hay evento de desplazamiento que lo
  // dispare y la primera medida llega con el alto en cero. Eso deja el set de
  // vistos vacio, hastaDondeLei no encuentra ahi el mensaje, no mueve la marca
  // y el chat se queda sin leer PARA SIEMPRE por mas veces que se abra. Es
  // exactamente lo que pasaba en un chat de un solo mensaje: se veia en la
  // base que mark_conversation_read si corria (last_delivered_at avanzaba),
  // pero siempre con la misma marca vieja.
  //
  // Cuando el contenido cabe sin desplazar no hay nada que interpretar: todos
  // los mensajes cargados estan en pantalla. Darlos por vistos es la verdad,
  // no una concesion. Si hay que desplazar, esto no se aplica y sigue
  // decidiendo la lectura contigua de siempre.
  const marcarVistoSiTodoCabe = useCallback(() => {
    const vista = altoVistaRef.current;
    const contenido = altoContenidoRef.current;
    if (vista <= 0 || contenido <= 0) return;
    if (contenido > vista + 4) return;
    if (messages.length === 0) return;
    for (const m of messages) vistosRef.current.add(m.id);
    const ultimo = messages[messages.length - 1]?.created_at;
    if (ultimo && (!maxVistoRef.current || ultimo > maxVistoRef.current)) {
      maxVistoRef.current = ultimo;
    }
    setPendientesVivos((prev) => (prev === 0 ? prev : 0));
  }, [messages]);

  // Hasta donde se puede decir honestamente que se leyo.
  //
  // last_read_at es UNA sola fecha, asi que marcar "hasta el mas nuevo que vi"
  // marcaria de paso todo lo anterior. En un chat abierto abajo con 200
  // pendientes, ver el ultimo mensaje borraria los 200 -- justo lo que se
  // queria evitar.
  //
  // Por eso la marca avanza solo de forma CONTIGUA: desde donde se habia
  // quedado, mientras cada mensaje siguiente haya estado en pantalla. Si se
  // salto el hueco, la marca no lo cruza y esos mensajes siguen pendientes.
  const hastaDondeLei = useCallback((): string | null => {
    const vistos = vistosRef.current;
    const corta = cortaNoLeidos;
    // Sin pendientes al abrir: basta con lo mas nuevo que se vio.
    if (!corta) return maxVistoRef.current;

    // LLEGAR AL FINAL CUENTA COMO HABER LEIDO.
    //
    // La regla contigua de abajo tiene un hueco que se veia en la Comunidad: con
    // 77 pendientes, bajar al final --o tocar la flecha, que existe justo para
    // eso-- salta unos 70 mensajes que nunca se renderizaron, el recorrido se
    // corta en el primero de ellos y la marca se queda donde estaba. El
    // contador bajaba a cero en pantalla, pero al servidor le llegaba una fecha
    // vieja: al volver a entrar reaparecian los 77. En un privado no se notaba
    // porque con dos o tres pendientes se ven todos de una.
    //
    // Si se vio el ULTIMO mensaje no queda nada por volver a buscar, asi que la
    // contiguidad deja de importar. Es lo que hace WhatsApp. Si, marca como
    // leido lo que se salto -- y eso es mejor que un globo que no se apaga
    // nunca, porque ese enseña a no mirar el globo.
    const ultimo = messages[messages.length - 1];
    if (ultimo && (vistos.has(ultimo.id)
        || (maxVistoRef.current && maxVistoRef.current >= ultimo.created_at))) {
      return ultimo.created_at;
    }

    let marca: string | null = corta;
    for (const m of messages) {
      if (m.created_at <= corta) continue;        // ya estaba leido
      if (m.sender_id === user?.id) { marca = m.created_at; continue; }  // lo propio no cuenta
      if (!vistos.has(m.id)) break;              // aqui se corto la lectura
      marca = m.created_at;
    }
    return marca;
  }, [messages, cortaNoLeidos, user?.id]);

  // Marcar leido al SALIR, por cualquier camino.
  //
  // Antes esto vivia solo en handleBack, el boton de atras de la cabecera. Si
  // alguien salia deslizando, con el boton del sistema, cambiando de pestaña o
  // cerrando la app, no se marcaba nada: se leian los mensajes, el contador
  // bajaba a cero en pantalla, y al volver a entrar aparecian otra vez como sin
  // leer. Que es justo lo que se veia.
  //
  // El ref hace falta porque el limpiador del efecto se crea UNA vez (deps
  // vacias, para que corra solo al desmontar) y sin el se quedaria con la
  // version vieja de la funcion, sin los mensajes que se leyeron despues.
  const marcarLeidoRef = useRef<(hasta?: string | null) => void>(() => {});
  useEffect(() => () => { marcarLeidoRef.current(); tocarUltimaVez(); }, []);

  // Al entrar, se quitan de la bandeja las notificaciones de ESTE chat.
  //
  // En Android el numero del icono lo arma el sistema contando lo que sigue en
  // la bandeja. Leer dentro de la app no las borraba, asi que el numero se
  // quedaba pegado aunque ya no hubiera nada sin leer.
  //
  // Solo las de esta conversacion: borrarlas todas apagaria tambien avisos de
  // otro chat que la persona no ha visto.
  useEffect(() => {
    if (!conversationId || Platform.OS === 'web') return;
    (async () => {
      try {
        const puestas = await Notifications.getPresentedNotificationsAsync();
        for (const n of puestas) {
          const datos: any = n.request?.content?.data || {};
          if (datos.conversation_id === conversationId) {
            await Notifications.dismissNotificationAsync(n.request.identifier);
          }
        }
      } catch { /* si el sistema no deja, no pasa nada: el numero se corrige en la lista */ }
    })();
  }, [conversationId]);

  // Y tambien al mandar la app al fondo: ahi no se desmonta nada, asi que sin
  // esto quien lee y bloquea el telefono pierde la lectura.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'background' || estado === 'inactive') {
        marcarLeidoRef.current();
        tocarUltimaVez();
      }
    });
    return () => sub.remove();
  }, []);

  const marcarLeido = useCallback((hasta?: string | null) => {
    if (!conversationId) return;
    const p_hasta = hasta ?? hastaDondeLei();
    // Nada que marcar: no se vio ni un mensaje (y la funcion trataria el null
    // como "hasta ahora", que es lo que se quiere evitar).
    if (!p_hasta) return;
    // Se anota ANTES de que responda el servidor: la pestana de Chats recarga
    // su lista al mismo tiempo que se escribe esto, y sin la anotacion gana la
    // lectura vieja y el globo reaparece (ver utils/leidoReciente).
    anotarLeidoHasta(conversationId, p_hasta);
    supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId, p_hasta })
      .then(() => {}, (err: unknown) => console.error('ChatThread: error marcando leido', err));
  }, [conversationId, hastaDondeLei]);

  marcarLeidoRef.current = marcarLeido;
  const [ahora, setAhora] = useState(Date.now());

  // Un reloj lento solo mientras haya alguien escribiendo: sirve para que el
  // aviso desaparezca solo al caducar, sin repintar la pantalla el resto del
  // tiempo.
  useEffect(() => {
    if (Object.keys(escribiendo).length === 0) return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [escribiendo]);

  // El aviso de "esta escribiendo" es lo ULTIMO de la lista, asi que si la
  // vista esta un poco subida aparece por debajo del borde y no se ve.
  //
  // El desplazamiento automatico de onContentSizeChange no alcanzaba: usa un
  // margen de 120 px, y basta estar 150 arriba --algo que pasa a cada rato, con
  // una foto que carga o despues de leer el ultimo mensaje-- para que no haga
  // nada. Aqui el margen es de 400: si se esta leyendo cerca del final, se baja
  // a mostrarlo; si se esta arriba leyendo historia, no se mueve nada.
  const habiaAlguienRef = useRef(false);
  useEffect(() => {
    const hayAlguien = Object.keys(escribiendo).length > 0;
    const apenasAparecio = hayAlguien && !habiaAlguienRef.current;
    habiaAlguienRef.current = hayAlguien;
    if (!apenasAparecio) return;
    if (distanciaDelFinalRef.current > 400) return;
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [escribiendo]);

  // ── Checks de WhatsApp ────────────────────────────────────────────────────
  //
  //   ✓        se envio (esta en el servidor)
  //   ✓✓ gris  le llego a TODOS los demas (abrieron la app despues)
  //   ✓✓ azul  TODOS abrieron este chat despues del mensaje
  //
  // En grupos la regla es la misma que en WhatsApp: azul solo cuando lo leyeron
  // todos. En un grupo de 150 eso casi nunca pasa, y por eso existe "Info del
  // mensaje", que si dice uno por uno quien lo leyo.
  //
  // Se pide un RESUMEN (dos fechas) y no la lista de participantes: para pintar
  // dos palitos no vale la pena traerse 149 filas cada 20 segundos. Si el que va
  // mas atrasado leyo hasta las 8:03, todo lo anterior a las 8:03 lo leyeron
  // todos. La lista completa solo se baja al abrir "Info del mensaje".
  const [estadoResumen, setEstadoResumen] = useState<{ leidoHasta: number; entregadoHasta: number } | null>(null);
  const [infoMensaje, setInfoMensaje] = useState<{ ms: number; filas: any[] } | null>(null);
  const [infoCargando, setInfoCargando] = useState(false);

  const cargarEstadoResumen = useCallback(async () => {
    if (!conversationId) return;
    const { data, error } = await supabase.rpc('estado_conversacion_resumen', {
      p_conversation_id: conversationId,
    });
    if (error) return;
    const fila: any = Array.isArray(data) ? data[0] : data;
    if (!fila) return;
    setEstadoResumen({
      leidoHasta: fila.leido_hasta ? new Date(fila.leido_hasta).getTime() : 0,
      entregadoHasta: fila.entregado_hasta ? new Date(fila.entregado_hasta).getTime() : 0,
    });
  }, [conversationId]);

  // Cada 20 segundos mientras el chat este abierto. No va por realtime a
  // proposito: avisar a todo el mundo cada vez que alguien abre un chat seria
  // un chorro de eventos para dibujar dos palitos.
  useEffect(() => {
    cargarEstadoResumen();
    const t = setInterval(cargarEstadoResumen, 20000);
    return () => clearInterval(t);
  }, [cargarEstadoResumen]);

  const checksDe = useCallback((m: any): 'enviando' | 'enviado' | 'entregado' | 'leido' => {
    if (m?.pending) return 'enviando';
    const t = new Date(m.created_at).getTime();
    if (estadoResumen && estadoResumen.leidoHasta >= t) return 'leido';
    if (estadoResumen && estadoResumen.entregadoHasta >= t) return 'entregado';
    return 'enviado';
  }, [estadoResumen]);

  const abrirInfoMensaje = useCallback(async (m: any) => {
    if (!conversationId || !m) return;
    setInfoCargando(true);
    setInfoMensaje({ ms: new Date(m.created_at).getTime(), filas: [] });
    const { data, error } = await supabase.rpc('estado_conversacion', {
      p_conversation_id: conversationId,
    });
    setInfoCargando(false);
    if (error) { setInfoMensaje(null); return; }
    setInfoMensaje({ ms: new Date(m.created_at).getTime(), filas: (data as any[]) || [] });
  }, [conversationId]);
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
    toque();
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
    toque();
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
    const actualizado = { ...m, pinned_at: willPin ? new Date().toISOString() : null, pinned_by: willPin ? (user?.id ?? null) : null };
    setMessages(prev => prev.map(x => x.id === m.id ? { ...x, ...actualizado } : x));
    // El mensaje puede no estar en la pagina cargada (se fijo hace meses), asi
    // que la lista aparte se actualiza sola.
    setFijados(prev => willPin
      ? [actualizado, ...prev.filter(x => x.id !== m.id)]
      : prev.filter(x => x.id !== m.id));
  }, [user?.id]);

  // Editar y borrar lo propio, con la misma ventana que WhatsApp: 15 minutos.
  // Pasado ese rato el mensaje queda fijo — si no, alguien podria reescribir
  // hoy lo que dijo la semana pasada y dejar la conversacion sin sentido.
  const VENTANA_EDICION_MS = 15 * 60 * 1000;
  const sePuedeEditar = useCallback((m: Message | null | undefined) => {
    if (!m || m.sender_id !== user?.id) return false;
    return Date.now() - new Date(m.created_at).getTime() < VENTANA_EDICION_MS;
  }, [user?.id]);

  const [editando, setEditando] = useState<Message | null>(null);
  const [textoEdicion, setTextoEdicion] = useState('');
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  const avisarChat = useCallback((titulo: string, texto: string) => {
    if (Platform.OS === 'web') window.alert(texto);
    else Alert.alert(titulo, texto);
  }, []);

  const guardarEdicion = useCallback(async () => {
    if (!editando) return;
    const nuevo = textoEdicion.trim();
    if (!nuevo) { avisarChat('Editar', 'El mensaje no puede quedar vacío.'); return; }
    if (nuevo === (editando.content || '')) { setEditando(null); return; }
    setGuardandoEdicion(true);
    const { error } = await supabase.rpc('editar_mi_mensaje', {
      p_id: editando.id,
      p_contenido: nuevo,
    });
    setGuardandoEdicion(false);
    if (error) {
      avisarChat('Editar', error.message?.includes('15 minutos')
        ? 'Ya pasaron los 15 minutos para editar este mensaje.'
        : 'No se pudo editar el mensaje.');
      return;
    }
    setMessages(prev => prev.map(x => x.id === editando.id ? { ...x, content: nuevo } : x));
    setEditando(null);
  }, [editando, textoEdicion, avisarChat]);

  const eliminarMiMensaje = useCallback(async (m: Message | null) => {
    if (!m) return;
    const hacerlo = async () => {
      const { error } = await supabase.rpc('borrar_mi_mensaje', { p_id: m.id });
      if (error) {
        avisarChat('Eliminar', error.message?.includes('15 minutos')
          ? 'Ya pasaron los 15 minutos para eliminar este mensaje.'
          : 'No se pudo eliminar el mensaje.');
        return;
      }
      setMessages(prev => prev.filter(x => x.id !== m.id));
    };
    if (Platform.OS === 'web') {
      if (window.confirm('¿Eliminar este mensaje? Desaparece para todos.')) await hacerlo();
    } else {
      Alert.alert('Eliminar mensaje', 'Desaparece para todos. No se puede deshacer.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: hacerlo },
      ]);
    }
  }, [avisarChat]);

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
  const [respondiendoSolicitud, setRespondiendoSolicitud] = useState(false);

  // Aceptar o ignorar una solicitud de mensaje.
  //
  // Al ignorar se sale del chat: para quien recibio, esa conversacion deja de
  // existir. Para quien la envio sigue ahi sin respuesta — nunca se le avisa
  // que fue descartada, porque decirle "te rechazaron" no le sirve a nadie.
  const responderSolicitud = useCallback(async (aceptar: boolean) => {
    if (!conversationId || respondiendoSolicitud) return;
    setRespondiendoSolicitud(true);
    try {
      const { error } = await supabase.rpc(
        aceptar ? 'aceptar_solicitud_chat' : 'ignorar_solicitud_chat',
        { p_conversation_id: conversationId },
      );
      if (error) throw error;
      if (aceptar) {
        setMeta((m) => (m ? { ...m, estado: 'aceptada' } : m));
      } else {
        router.back();
      }
    } catch (e: any) {
      const msg = e?.message || 'Inténtalo de nuevo.';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('No se pudo', msg);
    } finally {
      setRespondiendoSolicitud(false);
    }
  }, [conversationId, respondiendoSolicitud, router]);

  // Tras enviar en un chat privado hay que volver a preguntarle el estado a la
  // base. El primer mensaje es el que convierte la conversacion en solicitud,
  // y quien decide si lo es no es la app sino la base: depende de si las dos
  // personas ya se cruzaron en un evento. Por eso no se puede adivinar aqui --
  // si ya se conocen no hay solicitud, y anunciar "Solicitud enviada" seria
  // mentira.
  //
  // Sin esto el aviso no aparecia hasta salir y volver a entrar al chat, que
  // era justo cuando la persona ya habia pensado que el mensaje no salio.
  const refrescarEstadoDirecto = useCallback(async () => {
    if (!conversationId) return;
    const { data, error } = await supabase
      .from('chat_conversations')
      .select('type, estado, solicitada_por')
      .eq('id', conversationId)
      .maybeSingle();
    if (error || !data) return;
    const fila = data as any;
    if (fila.type !== 'direct') return;

    setMeta((m) => {
      if (m) {
        return {
          ...m,
          estado: fila.estado ?? m.estado,
          solicitada_por: fila.solicitada_por ?? m.solicitada_por,
        };
      }
      // meta venia en NULL, y este es el caso que importa.
      //
      // get_my_conversations_v2 no devuelve los privados que todavia no tienen
      // ningun mensaje (pide lm.created_at is not null), asi que al abrir un
      // chat nuevo con alguien loadEverything no encuentra la fila y meta se
      // queda sin llenar. Justo el chat donde se envia la primera solicitud.
      //
      // Se arma aqui con lo minimo que necesita el aviso. El nombre sale de
      // los participantes, que si llegan en un chat sin mensajes.
      const otro = participants.find((pp) => pp.user_id !== user?.id) ?? null;
      return {
        conv_type: 'direct',
        estado: fila.estado ?? null,
        solicitada_por: fila.solicitada_por ?? null,
        event_name: null,
        event_type: null,
        event_date: null,
        other_user_id: otro?.user_id ?? null,
        other_user_name: otro?.name ?? null,
        other_user_photo: otro?.profile_photo_url ?? null,
      } as ConversationMeta;
    });
  }, [conversationId, participants, user?.id]);

  // Persona cuya ficha se esta viendo. Se abre al tocar su foto en un mensaje o
  // en la lista de participantes.
  //
  // Antes tocar una foto abria el visor de imagenes, el mismo de las fotos que
  // se mandan por el chat — con botones de Descargar y Compartir. O sea que
  // cualquiera podia bajarse la foto de perfil de otro asistente y reenviarla.
  // Tocar la cara de alguien pregunta "quien es este", no "muestrame esta
  // imagen mas grande": la ficha responde eso y ademas no deja bajar la foto.
  const [perfilVisto, setPerfilVisto] = useState<Participant | null>(null);
  // La lista de quienes estan conectados, al tocar "N en línea" del encabezado.
  const [verEnLinea, setVerEnLinea] = useState(false);
  // Ficha que se quiere abrir DESDE la lista de participantes.
  //
  // En iOS no se pueden presentar dos <Modal> a la vez: el segundo no aparece,
  // y si la persona insiste, las presentaciones se encolan y la pantalla se
  // congela. Como la lista de participantes ya es un modal, la ficha no se
  // abre de una: se guarda aca, se cierra la lista, y solo cuando esa se
  // cerro de verdad se muestra la ficha.
  const [perfilPendiente, setPerfilPendiente] = useState<Participant | null>(null);

  // Numero tocado en un mensaje. Guarda tambien de quien era el mensaje, para
  // poder proponer ese nombre al guardar el contacto.
  const [phoneMenu, setPhoneMenu] = useState<{ raw: string; from: string } | null>(null);

  // Copiar un texto suelto (no el de un mensaje). Mismo camino que
  // copyMessageText: sin dependencias nuevas.
  const copyPlainText = useCallback(async (txt: string) => {
    if (!txt) return;
    try {
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          await navigator.clipboard.writeText(txt);
        }
      } else {
        const { Clipboard } = require('react-native');
        Clipboard.setString(txt);
      }
    } catch (e) {
      console.error('copyPlainText error:', e);
    }
  }, []);

  // Guardar en contactos. Se hace con una tarjeta .vcf y no con `tel:` porque
  // en iOS `tel:` LLAMA de una, no abre el marcador para editar: el atajo que
  // sirve en Android alli seria una llamada sin querer. El .vcf en cambio abre
  // la pantalla de contacto nuevo, ya llena, en los dos sistemas.
  const savePhoneToContacts = useCallback(async (raw: string, name: string) => {
    const numero = `+${phoneDigits(raw)}`;
    const nombre = (name || 'Contacto Nospi').trim();
    const vcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `N:;${nombre};;;`,
      `FN:${nombre}`,
      `TEL;TYPE=CELL:${numero}`,
      'NOTE:Contacto conocido en Nospi',
      'END:VCARD',
    ].join('\r\n');
    // Las tildes se quitan SOLO del nombre del archivo (que se ve en la hoja de
    // compartir); dentro de la tarjeta el nombre va completo y bien escrito.
    const slug = normalizeText(nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const filename = `${slug || 'contacto'}.vcf`;
    try {
      if (Platform.OS === 'web') {
        const blob = new Blob([vcard], { type: 'text/vcard' });
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
      await FileSystem.writeAsStringAsync(target, vcard);
      if (!(await Sharing.isAvailableAsync())) {
        // Sin hoja de compartir no hay como entregar el .vcf: al menos que el
        // numero quede copiado y la persona lo pegue en Contactos.
        copyPlainText(numero);
        Alert.alert('Número copiado', 'Este dispositivo no permite abrir la tarjeta de contacto, así que copiamos el número.');
        return;
      }
      await Sharing.shareAsync(target, {
        dialogTitle: 'Guardar contacto',
        mimeType: 'text/vcard',
        UTI: 'public.vcard',
      });
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (!/abort|cancel/i.test(msg)) {
        Alert.alert('No se pudo guardar', msg || 'Inténtalo de nuevo.');
      }
    }
  }, [copyPlainText]);

  const [showParticipants, setShowParticipants] = useState(false);

  // Texto del buscador de la lista de Asistentes. La Comunidad Nospi ya va por
  // 230 personas: encontrar a alguien bajando con el dedo es inviable, y en un
  // grupo de evento (hasta 28) tampoco es comodo. Se filtra en memoria porque
  // get_conversation_participants ya devuelve la lista completa -- no hace
  // falta ir al servidor por cada letra.
  const [buscaAsistente, setBuscaAsistente] = useState('');

  // La lista que se pinta: todos menos uno mismo, filtrados por lo que se
  // escriba. normalizeText quita tildes y mayusculas, asi que "martin"
  // encuentra a "Martín" y "jose" a "José" -- en una lista de nombres en
  // espanol eso no es un detalle, es la diferencia entre encontrar a alguien o
  // no. Se busca con includes y no con startsWith (como si hacen las menciones
  // con "@") porque aca la gente tambien busca por el apellido.
  const asistentesFiltrados = (() => {
    const base = participants.filter((p) => p.user_id !== user?.id);
    const q = normalizeText(buscaAsistente);
    if (!q) return base;
    return base.filter((p) => normalizeText(p.name).includes(q));
  })();

  // Abre la ficha SOLO cuando la lista de participantes ya se cerro. En iOS dos
  // <Modal> a la vez no funcionan: el segundo no aparece y, si la persona
  // insiste, las presentaciones se encolan y la pantalla se congela.
  // Va aqui abajo y no junto a perfilPendiente porque necesita showParticipants,
  // que se declara en esta linea: usarlo antes rompia en tiempo de ejecucion.
  useEffect(() => {
    if (!perfilPendiente || showParticipants) return;
    const t = setTimeout(() => {
      setPerfilVisto(perfilPendiente);
      setPerfilPendiente(null);
    }, Platform.OS === 'ios' ? 420 : 80);
    return () => clearTimeout(t);
  }, [perfilPendiente, showParticipants]);
  const [startingChatWith, setStartingChatWith] = useState<string | null>(null);
  // Candado de re-entrada. Va aparte del estado de arriba (que solo pinta el
  // spinner) para que un fallo no pueda dejar el boton muerto: este se limpia
  // en un finally, pase lo que pase.
  const startingRef = useRef(false);
  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null);
  const [zoomedFileName, setZoomedFileName] = useState<string>('foto-nospi.jpg');
  // Enlaces firmados de las fotos/videos, por ruta del archivo en el bucket.
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  // Si el portapapeles trae una imagen AHORA. Se consulta al abrir la hoja de
  // adjuntar: asi el boton de pegar no aparece muerto cuando no hay nada.
  const [hayImagenPegable, setHayImagenPegable] = useState(false);
  // Archivo sobre el que se abrio el menu de Descargar / Compartir.
  const [mediaActions, setMediaActions] = useState<{ url: string; kind: 'image' | 'video'; filename: string } | null>(null);
  const [busyAction, setBusyAction] = useState<null | 'download' | 'share'>(null);
  // Adjuntos elegidos que todavia NO se han enviado: se quedan en la bandeja
  // hasta que la persona toca el boton de enviar.
  const [pendingAssets, setPendingAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [uploading, setUploading] = useState<{ kind: 'image' | 'video'; current: number; total: number } | null>(null);
  // ── Selector de GIFs ──────────────────────────────────────────────────
  // Los GIFs vienen de GIPHY. Antes venian de Tenor, que era el catalogo de
  // WhatsApp, pero Google cerro esa API en junio de 2026. Ver lib/giphy.ts.
  // Stickers propios de Nospi. El catalogo vive en la base y se lee una vez
  // por sesion de chat: son pocas filas y no cambian mientras alguien escribe.
  const [showStickers, setShowStickers] = useState(false);
  const [stickers, setStickers] = useState<StickerDeNospi[]>([]);
  const [stickersCargando, setStickersCargando] = useState(false);
  const [stickerEnviando, setStickerEnviando] = useState<string | null>(null);

  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifQuery, setGifQuery] = useState('');
  const [gifResults, setGifResults] = useState<Gif[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifError, setGifError] = useState<string | null>(null);
  // Los ultimos que ESTA persona mando por Nospi. Es lo mas parecido a los
  // "favoritos" de WhatsApp que se puede tener: los de alla son privados de esa
  // app y no hay forma de leerlos desde afuera, asi que aca la lista se arma
  // sola con el uso.
  const [gifRecientes, setGifRecientes] = useState<Gif[]>([]);
  // Id del GIF que se esta subiendo, para poner el girador solo en ese.
  const [gifEnviando, setGifEnviando] = useState<string | null>(null);

  // ── Crear encuesta ────────────────────────────────────────────────────
  const [showPollForm, setShowPollForm] = useState(false);
  const [pollPregunta, setPollPregunta] = useState('');
  const [pollOpciones, setPollOpciones] = useState<string[]>(['', '']);
  const [pollEnviando, setPollEnviando] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);

  // Cuantos mensajes se traen de una. 50 llena mas de una pantalla en cualquier
  // telefono, asi que la conversacion se ve completa de entrada.
  const PAGINA = 50;
  const [hayAnteriores, setHayAnteriores] = useState(false);
  const [cargandoAnteriores, setCargandoAnteriores] = useState(false);
  // Mensajes fijados, que pueden ser mas viejos que la pagina cargada.
  const [fijados, setFijados] = useState<Message[]>([]);
  // Al traer mensajes viejos la lista crece por ARRIBA, y el salto automatico
  // al final mandaria a la persona de vuelta abajo justo cuando queria leer lo
  // de antes. Esta bandera lo salta una vez.
  const pegandoArribaRef = useRef(false);

  const listRef = useRef<FlatList<Message>>(null);

  // Al tocar la cita de una respuesta se salta al mensaje original, como en
  // WhatsApp. Se resalta un momento porque si no, en medio de la conversacion,
  // no queda claro a cual de todos se llego.
  // ¿La persona esta mirando el final de la conversacion, o se subio a leer
  // algo de antes? De esto depende si se la baja sola cuando cambia el
  // contenido. Va en una referencia y no en estado: cambia en cada pixel de
  // desplazamiento y no debe repintar la lista.
  const cercaDelFinalRef = useRef(true);

  const [resaltado, setResaltado] = useState<string | null>(null);
  const resaltadoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const irAlMensaje = useCallback((id: string) => {
    const i = messages.findIndex((m) => m.id === id);
    if (i < 0) return;
    toque();
    // Se marca que ya no esta en el final. Si no, cualquier cosa que cambie el
    // alto de la lista -una foto que termina de cargar, un mensaje nuevo- la
    // devolvia al ultimo mensaje a los pocos segundos, deshaciendo el salto.
    cercaDelFinalRef.current = false;
    listRef.current?.scrollToIndex({ index: i, animated: true, viewPosition: 0.5 });
    setResaltado(id);
    if (resaltadoTimer.current) clearTimeout(resaltadoTimer.current);
    resaltadoTimer.current = setTimeout(() => setResaltado(null), 1800);
  }, [messages]);

  useEffect(() => () => { if (resaltadoTimer.current) clearTimeout(resaltadoTimer.current); }, []);
  // Al abrir el teclado la lista se encoge pero conserva su posicion, asi que
  // los ultimos mensajes quedan por encima del recorte y parece que la
  // conversacion "salto" hacia atras. Se la baja de nuevo al final.
  //
  // Los 150 ms son para que el desplazamiento ocurra con la altura YA reducida;
  // hacerlo antes lo dejaria a mitad de camino. Es el mismo truco que ya se usa
  // al enviar un mensaje.
  const tecladoVisible = useKeyboardState((k) => k.isVisible);
  useEffect(() => {
    if (!tecladoVisible) return;
    // Solo si ya estaba mirando el final. Quien salto a un mensaje viejo y toca
    // el cuadro de escribir para responderlo no quiere que se lo lleven abajo.
    if (!cercaDelFinalRef.current) return;
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150);
    return () => clearTimeout(t);
  }, [tecladoVisible]);
  // Rutas para las que ya se pidio firma, para no volver a pedirlas en cada
  // render (y para no entrar en bucle si alguna falla).
  const signRequestedRef = useRef<Set<string>>(new Set());

  // Copia siempre fresca para usar DENTRO del canal de tiempo real: ese se
  // crea una sola vez, asi que si leyera participantsById directamente se
  // quedaria con la foto del primer render -- vacia-- y pediria la lista en
  // cada mensaje.
  const participantsByIdRef = useRef<Record<string, Participant>>({});

  const participantsById = participants.reduce<Record<string, Participant>>((acc, p) => {
    acc[p.user_id] = p;
    return acc;
  }, {});
  participantsByIdRef.current = participantsById;

  // Si la lista de participantes se cae en la carga inicial, los nombres salen
  // todos como "Un participante" y no se arreglaba hasta reiniciar la app:
  // solo se reintentaba al llegar un mensaje NUEVO de alguien sin identificar.
  // Paso en la Comunidad, que tiene 246 participantes.
  //
  // Aqui se mira lo contrario: si entre los mensajes YA cargados hay remitentes
  // que no se pueden nombrar, se vuelve a pedir la lista. Un solo reintento por
  // conversacion, para no quedar en bucle si de verdad no hay lista (antes de
  // que el chat abra, la base no devuelve a nadie a proposito).
  const reintentoParticipantesRef = useRef<string | null>(null);
  // La lista fresca viene en camino: no tiene sentido pedirla otra vez.
  const participantesEnVueloRef = useRef(false);
  // En que conversacion ya llego la lista FRESCA, para que una copia guardada
  // que tarde en leerse no la pise.
  const participantesFrescosRef = useRef<string | null>(null);
  // Que ids ya se pidieron en este canal. Cada uno se pide UNA vez: la base
  // puede no devolverlo nunca --alguien que se salio del canal-- y sin esto el
  // efecto de abajo lo volveria a pedir en cada render, para siempre.
  const idsPedidosRef = useRef<Set<string>>(new Set());

  // Un canal es de difusion. Se calcula aqui arriba y no junto a los demas
  // porque el efecto que sigue lo necesita en su lista de dependencias, y esa
  // se evalua al renderizar: declararlo mas abajo seria leerlo antes de existir.
  const esCanal = meta?.conv_type === 'channel_global' || meta?.conv_type === 'channel_event';

  // A quien hay que poder nombrar con lo que esta en pantalla ahora mismo.
  const idsNecesarios = useMemo(
    () => idsQueHayQueNombrar(messages, fijados, reactions, user?.id),
    [messages, fijados, reactions, user?.id],
  );
  useEffect(() => {
    if (loading || !conversationId || !user?.id) return;
    if (participantesEnVueloRef.current) return;   // ya viene en camino

    // En un canal no hay censo que reintentar: se piden los perfiles que van
    // haciendo falta --quien escribe, quien reacciona, quien aparece al subir
    // por el historial-- y nada mas.
    if (esCanal) {
      const faltan = idsNecesarios.filter(
        (id) => !participantsById[id] && !idsPedidosRef.current.has(id),
      );
      if (faltan.length === 0) return;
      faltan.forEach((id) => idsPedidosRef.current.add(id));
      participantesEnVueloRef.current = true;
      pedirPerfiles(faltan).then((nuevos) => {
        participantesEnVueloRef.current = false;
        if (!nuevos || nuevos.length === 0) return;
        setParticipants((prev) => {
          const yaEstan = new Set(prev.map((pp) => pp.user_id));
          const anadidos = nuevos.filter((pp) => !yaEstan.has(pp.user_id));
          return anadidos.length === 0 ? prev : [...prev, ...anadidos];
        });
      });
      return;
    }

    if (reintentoParticipantesRef.current === conversationId) return;
    const faltaAlguno = messages.some(
      (m) => m.sender_id !== user.id
        && m.sender_id !== NOSPI_SYSTEM_USER_ID
        && !participantsById[m.sender_id],
    );
    if (!faltaAlguno) return;
    reintentoParticipantesRef.current = conversationId;
    recargarParticipantes();
  }, [loading, conversationId, user?.id, messages, participantsById, recargarParticipantes,
      esCanal, idsNecesarios, pedirPerfiles]);

  // Con quien es el chat, cuando es privado. Se prefiere el de meta porque
  // llega antes que la lista de participantes.
  const otherParticipantId = meta?.conv_type === 'direct'
    ? (meta.other_user_id ?? participants.find((p) => p.user_id !== user?.id)?.user_id ?? null)
    : null;

  // La ultima vez del otro, solo en privado y solo si no esta conectado ahora
  // (si esta, lo que se muestra es "en linea" y esto sobra). La base aplica la
  // reciprocidad, asi que si yo la tengo apagada vuelve vacio.
  useEffect(() => {
    const otro = otherParticipantId;
    if (!otro || !miPrivacidad.ultimaVez || enLinea.includes(otro)) {
      setUltimaVezOtro(null);
      return;
    }
    let vivo = true;
    pedirUltimaVez([otro]).then((mapa) => { if (vivo) setUltimaVezOtro(mapa[otro] ?? null); });
    return () => { vivo = false; };
  }, [otherParticipantId, miPrivacidad.ultimaVez, enLinea]);

  // El equipo de Nospi puede escribir en un canal aunque este cerrado.
  const [isAdminUser, setIsAdminUser] = useState(false);
  useEffect(() => {
    let alive = true;
    supabase.rpc('is_admin').then(({ data }) => { if (alive) setIsAdminUser(!!data); });
    return () => { alive = false; };
  }, [user?.id]);

  const loadEverything = useCallback(async () => {
    if (!conversationId || !user?.id) return;

    // LA LISTA DE PARTICIPANTES NO VA AQUI, Y ES A PROPOSITO.
    //
    // Es, de lejos, lo mas gordo que se pide al abrir: en la Comunidad son 257
    // personas y 133 kB; en el Canal Nospi, 3.574 y 1,5 MB. Estaba dentro de
    // este Promise.all, que es el que decide cuando se pinta el chat, asi que
    // NADA aparecia hasta que bajara entera. La base la resuelve en 2 ms: todo
    // el tiempo era transporte.
    //
    // Ahora se pide igual, pero sin esperarla: el chat se pinta con la copia
    // guardada --que trae nombres y fotos, asi que no hay parpadeo de burbujas
    // sin nombre-- y la lista fresca la reemplaza cuando llega.
    participantesFrescosRef.current = null;
    idsPedidosRef.current = new Set();

    getCached<Participant[]>(CLAVE_PARTICIPANTES(conversationId))
      .then((guardados) => {
        if (!guardados || guardados.length === 0) return;
        // Si la fresca ya llego, manda ella: la copia es solo para el hueco.
        if (participantesFrescosRef.current === conversationId) return;
        setParticipants(guardados);
      })
      .catch(() => {});

    const [{ data: msgs, error: msgsError }, { data: convs }, { data: miFila }, { data: fijadosData }] =
      await Promise.all([
        // Solo la ultima pagina, no la conversacion entera.
        //
        // Antes esto pedia TODOS los mensajes desde el primer dia y la pantalla
        // no pintaba nada hasta que llegaran: en un grupo con meses de historia
        // eran miles de filas y varios segundos de espera cada vez que se
        // abria el chat. Se piden los ultimos PAGINA (uno de mas, para saber si
        // hay anteriores) y lo viejo se trae a demanda con el boton de arriba.
        supabase
          .from('chat_messages')
          .select(MESSAGE_COLUMNS)
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(PAGINA + 1),
        supabase.rpc('get_my_conversations_v2'),
        // Mi propia marca de lectura: es la que decide donde va la linea de
        // "no leidos" y si el chat abre atras o abajo. La politica de la tabla
        // ya deja leer la fila propia (user_id = auth.uid()).
        supabase
          .from('chat_participants')
          .select('last_read_at')
          .eq('conversation_id', conversationId)
          .eq('user_id', user.id)
          .maybeSingle(),
        // Los fijados van aparte justamente porque pueden ser mas viejos que la
        // pagina cargada; si dependieran de la lista, la banda de arriba se
        // vaciaria al paginar.
        supabase
          .from('chat_messages')
          .select(MESSAGE_COLUMNS)
          .eq('conversation_id', conversationId)
          .not('pinned_at', 'is', null)
          .order('pinned_at', { ascending: false })
          .limit(20),
      ]);

    if (msgsError) console.error('ChatThread: error loading messages', msgsError);

    const lote = ((msgs as Message[]) || []);
    const hay = lote.length > PAGINA;
    const visibles = (hay ? lote.slice(0, PAGINA) : lote).slice().reverse();

    // La marca de lectura se congela aqui, antes de pintar: es la que dice
    // donde va la linea de "no leidos" y donde abre el chat.
    const corta = (miFila as any)?.last_read_at ?? null;

    // Si la marca de lectura es MAS VIEJA que lo que trajimos, el punto donde
    // se quedo no esta en pantalla. Se extiende hacia atras hasta ahi (con
    // techo), para poder abrir el chat justo donde lo dejo.
    let listaFinal = visibles;
    let quedanAnteriores = hay;
    if (corta && visibles.length > 0 && visibles[0].created_at > corta) {
      const faltan = MAX_MENSAJES_AL_ABRIR - visibles.length;
      if (faltan > 0) {
        const { data: atras } = await supabase
          .from('chat_messages')
          .select(MESSAGE_COLUMNS)
          // gte y no gt: el mensaje de la marca es el ultimo que SI leyo, y
          // tenerlo arriba del divisor ayuda a ubicarse.
          .gte('created_at', corta)
          .lt('created_at', visibles[0].created_at)
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(faltan + 1);
        const lote2 = ((atras as Message[]) || []);
        const hay2 = lote2.length > faltan;
        const extra = (hay2 ? lote2.slice(0, faltan) : lote2).slice().reverse();
        if (extra.length > 0) {
          const yaEstan = new Set(visibles.map((m) => m.id));
          listaFinal = [...extra.filter((m) => !yaEstan.has(m.id)), ...visibles];
        }
        // Si se topo con el techo, todavia hay cosas antes de la marca.
        quedanAnteriores = hay2 || hay;
      }
    }

    // El conteo va sobre la lista YA extendida. Solo cuentan los mensajes de
    // OTROS: los propios nunca estan sin leer.
    const sinLeerCargados = corta
      ? listaFinal.filter((m) => m.sender_id !== user.id && m.created_at > corta).length
      : listaFinal.filter((m) => m.sender_id !== user.id).length;
    // Para la etiqueta se prefiere el numero REAL de la lista de chats: si se
    // topo con el techo, los cargados son menos que los que de verdad hay.
    const thisConv = (convs || []).find((c: any) => c.conversation_id === conversationId);
    const sinLeerReal = Number(thisConv?.unread_count ?? 0) || sinLeerCargados;

    setCortaNoLeidos(sinLeerCargados > 0 ? corta : null);
    setPendientesAlAbrir(Math.max(sinLeerReal, sinLeerCargados));
    setPendientesVivos(Math.max(sinLeerReal, sinLeerCargados));
    yaColoqueInicialRef.current = false;
    // El registro de "esto ya paso por pantalla" NO se borra si seguimos en la
    // misma conversacion.
    //
    // loadEverything no corre solo al abrir un chat: sus dependencias incluyen
    // el usuario, y el proveedor de sesion lo reemite cada vez que renueva el
    // token. Antes cada una de esas recargas invisibles vaciaba el set, y al
    // salir hastaDondeLei ya no encontraba ahi los mensajes que se habian
    // leido: cortaba la marca donde estaba y escribia la de siempre, que es un
    // no-op. Resultado, el globo de sin leer se quedaba pegado y no habia
    // forma de bajarlo por mas que se abriera el chat.
    if (convDelSetRef.current !== conversationId) {
      convDelSetRef.current = conversationId;
      vistosRef.current = new Set();
      maxVistoRef.current = corta;
    } else if (corta && (!maxVistoRef.current || corta > maxVistoRef.current)) {
      // Misma conversacion: la marca solo puede avanzar, nunca retroceder.
      maxVistoRef.current = corta;
    }
    reintentoParticipantesRef.current = null;

    setMessages(listaFinal);
    setHayAnteriores(quedanAnteriores);
    setEnTramoViejo(false);
    setFijados((fijadosData as Message[]) || []);

    if (thisConv) {
      setMeta({
        conv_type: thisConv.conv_type,
        event_name: thisConv.event_name,
        event_type: thisConv.event_type,
        event_date: thisConv.event_date,
        other_user_id: thisConv.other_user_id ?? null,
        other_user_name: thisConv.other_user_name,
        other_user_photo: thisConv.other_user_photo,
        replies_open: thisConv.replies_open,
        channel_title: thisConv.channel_title,
        estado: thisConv.estado,
        solicitada_por: thisConv.solicitada_por,
      });
    }

    setLoading(false);

    // Y ahora los perfiles. Van DESPUES del pintado, y eso es lo que permite
    // elegir cuales pedir: hasta aqui no se sabia que clase de chat es.
    //
    // En un canal se piden SOLO los de quien aparece en pantalla. En el Canal
    // Nospi el censo son 3.574 personas y 1,5 MB, y ahi esa lista no se muestra
    // en ningun sitio: el boton de "Asistentes" solo sale si el chat es grupo o
    // Comunidad. En un grupo o en la Comunidad se sigue pidiendo entera, porque
    // esa lista SI se abre y se busca por nombre.
    const esUnCanal = thisConv?.conv_type === 'channel_global'
      || thisConv?.conv_type === 'channel_event';
    const queIds = esUnCanal
      ? idsQueHayQueNombrar(listaFinal, (fijadosData as Message[]) || [], {}, user.id)
      : null;

    participantesEnVueloRef.current = true;
    const perfiles = await pedirPerfiles(queIds);
    participantesEnVueloRef.current = false;

    if (perfiles) {
      participantesFrescosRef.current = conversationId;
      if (queIds) queIds.forEach((id) => idsPedidosRef.current.add(id));
      setParticipants(perfiles);

      // Solo se guarda copia de la Comunidad y del Canal, que no filtran por
      // evento. En un grupo de evento la base esconde A PROPOSITO a quien no
      // asistio --"quien no fue no aparece para nadie"-- y una copia vieja lo
      // volveria a mostrar. Ademas ahi son seis personas: nada que ganar.
      const sinRestriccionPorEvento = !!thisConv
        && !thisConv.event_id
        && (thisConv.conv_type === 'community' || thisConv.conv_type === 'channel_global');
      if (sinRestriccionPorEvento) {
        setCached(CLAVE_PARTICIPANTES(conversationId), perfiles).catch(() => {});
      }
    }

    // OJO: aqui NO se marca leido. Antes se hacia, y era justo el problema: se
    // abria el chat, bajaba al ultimo mensaje y todo lo que no se vio quedaba
    // leido. Ahora lo marca onViewableItemsChanged, con lo que de verdad
    // estuvo en pantalla, y se guarda al salir.
    // pedirPerfiles solo depende de conversationId, que ya esta aqui: anadirlo
    // no provoca recargas extra.
  }, [conversationId, user, pedirPerfiles]);

  useEffect(() => {
    loadEverything();
  }, [loadEverything]);

  // Busca en todo el historial de la conversacion.
  const hacerBusqueda = useCallback(async (texto: string) => {
    const q = texto.trim();
    if (!conversationId || q.length < 2) { setResultados(null); return; }
    setBuscandoAhora(true);
    const { data, error } = await supabase
      .from('chat_messages')
      .select(MESSAGE_COLUMNS)
      .eq('conversation_id', conversationId)
      // El % de los extremos hace que encuentre la palabra en medio de la
      // frase; ilike ademas ignora mayusculas y minusculas.
      .ilike('content', `%${q}%`)
      .order('created_at', { ascending: false })
      .limit(50);
    setBuscandoAhora(false);
    setResultados(error ? [] : ((data as Message[]) || []));
  }, [conversationId]);

  // Trae el tramo de conversacion alrededor de un mensaje y lo deja en
  // pantalla. Hace falta porque un resultado puede ser de hace meses y no
  // estar entre los 50 que hay cargados.
  const abrirTramoDe = useCallback(async (m: Message) => {
    if (!conversationId) return;
    const [antes, despues] = await Promise.all([
      supabase.from('chat_messages').select(MESSAGE_COLUMNS)
        .eq('conversation_id', conversationId)
        .lte('created_at', m.created_at)
        .order('created_at', { ascending: false }).limit(25),
      supabase.from('chat_messages').select(MESSAGE_COLUMNS)
        .eq('conversation_id', conversationId)
        .gt('created_at', m.created_at)
        .order('created_at', { ascending: true }).limit(25),
    ]);
    const tramo = [
      ...(((antes.data as Message[]) || []).slice().reverse()),
      ...(((despues.data as Message[]) || [])),
    ];
    if (tramo.length === 0) return;
    setBuscando(false);
    setConsulta('');
    setResultados(null);
    setMessages(tramo);
    setHayAnteriores(true);
    setEnTramoViejo(true);
    // Que no se baje sola al final al cambiar el contenido de la lista.
    cercaDelFinalRef.current = false;
    pegandoArribaRef.current = true;
    setTimeout(() => irAlMensaje(m.id), 300);
  }, [conversationId, irAlMensaje]);

  const cargarAnteriores = useCallback(async () => {
    if (!conversationId || cargandoAnteriores) return;
    const masViejo = messages.find((m) => !m.pending);
    if (!masViejo) return;
    setCargandoAnteriores(true);
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select(MESSAGE_COLUMNS)
        .eq('conversation_id', conversationId)
        .lt('created_at', masViejo.created_at)
        .order('created_at', { ascending: false })
        .limit(PAGINA + 1);
      if (error) return;
      const lote = (data as Message[]) || [];
      const hay = lote.length > PAGINA;
      const nuevos = (hay ? lote.slice(0, PAGINA) : lote).slice().reverse();
      pegandoArribaRef.current = true;
      setMessages((prev) => {
        const yaEstan = new Set(prev.map((m) => m.id));
        return [...nuevos.filter((m) => !yaEstan.has(m.id)), ...prev];
      });
      setHayAnteriores(hay);
    } finally {
      setCargandoAnteriores(false);
    }
  }, [conversationId, messages, cargandoAnteriores]);

  // Pide enlaces firmados para las fotos/videos que todavia no tienen uno.
  // El bucket es privado, asi que sin esto la imagen no carga. La firma la
  // autoriza la politica de storage: solo si eres participante del chat.
  //
  // Los enlaces se guardan en el telefono y se reutilizan mientras sigan
  // vigentes. Esto es lo que hace que la cache de imagenes funcione: si en cada
  // sesion se firmara de nuevo, la direccion cambiaria y la foto se volveria a
  // descargar entera cada vez.

  // Hasta que no se lea la cache no se firma nada: si se firmara antes, se
  // pedirian enlaces nuevos en cada arranque y la cache no serviria para nada.
  const [cacheLeida, setCacheLeida] = useState(false);

  // Cuantas veces se ha reintentado firmar cada archivo. Sin este tope, una
  // foto que falle siempre (borrada del bucket, por ejemplo) entraria en un
  // bucle de firmar -> fallar -> firmar.
  const reintentosFirmaRef = useRef<Record<string, number>>({});
  const MAX_REINTENTOS_FIRMA = 2;

  // Lee del disco los enlaces que aun sirven, antes de pedir nada.
  useEffect(() => {
    let vivo = true;
    AsyncStorage.getItem(SIGNED_URL_CACHE_KEY)
      .then((raw) => {
        if (!vivo || !raw) return;
        const guardado: Record<string, { url: string; exp: number }> = JSON.parse(raw);
        const ahora = Date.now();
        const utiles: Record<string, string> = {};
        for (const [path, v] of Object.entries(guardado)) {
          if (v?.url && v.exp - ahora > SIGNED_URL_RENEW_BEFORE_MS) {
            utiles[path] = v.url;
            signRequestedRef.current.add(path);
          }
        }
        if (Object.keys(utiles).length > 0) {
          setSignedUrls((prev) => ({ ...utiles, ...prev }));
        }
      })
      .catch(() => { /* si la cache esta corrupta, se vuelve a firmar y ya */ })
      .finally(() => { if (vivo) setCacheLeida(true); });
    return () => { vivo = false; };
  }, []);

  // Guarda en disco lo que se vaya firmando, descartando lo ya vencido para
  // que el archivo no crezca sin control.
  const guardarEnCache = useCallback((nuevos: Record<string, string>) => {
    const exp = Date.now() + SIGNED_URL_TTL_SECONDS * 1000;
    AsyncStorage.getItem(SIGNED_URL_CACHE_KEY)
      .then((raw) => {
        const previo: Record<string, { url: string; exp: number }> = raw ? JSON.parse(raw) : {};
        const ahora = Date.now();
        const salida: Record<string, { url: string; exp: number }> = {};
        for (const [path, v] of Object.entries(previo)) {
          if (v?.exp > ahora) salida[path] = v;
        }
        for (const [path, url] of Object.entries(nuevos)) salida[path] = { url, exp };
        return AsyncStorage.setItem(SIGNED_URL_CACHE_KEY, JSON.stringify(salida));
      })
      .catch(() => { /* no poder guardar la cache no debe romper el chat */ });
  }, []);

  useEffect(() => {
    if (!cacheLeida) return;
    const pending = Array.from(
      new Set(
        messages
          // Los caducados ya no tienen archivo detras: pedir su enlace seria
          // una peticion condenada a fallar en cada carga del chat.
          .filter((m) => !m.media_expired)
          .map((m) => m.media_path)
          .filter((path): path is string => !!path && !esEnlaceDirecto(path) && !signRequestedRef.current.has(path))
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
        const nuevos: Record<string, string> = {};
        (data || []).forEach((item: any) => {
          if (item?.path && item?.signedUrl) nuevos[item.path] = item.signedUrl;
        });
        if (Object.keys(nuevos).length === 0) return;
        setSignedUrls((prev) => ({ ...prev, ...nuevos }));
        guardarEnCache(nuevos);
      })
      .catch(() => {
        pending.forEach((path) => signRequestedRef.current.delete(path));
      });

    return () => { active = false; };
  }, [messages, guardarEnCache, cacheLeida]);

  // Si una foto falla al cargarse (enlace vencido, o revocado), se pide uno
  // nuevo en vez de dejar el hueco. Antes esto no ocurria nunca: la ruta
  // quedaba marcada como "ya pedida" para siempre.
  const volverAFirmar = useCallback((path: string) => {
    const hechos = reintentosFirmaRef.current[path] || 0;
    if (hechos >= MAX_REINTENTOS_FIRMA) return; // el archivo no esta, no insistir
    reintentosFirmaRef.current[path] = hechos + 1;
    signRequestedRef.current.delete(path);
    setSignedUrls((prev) => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
  }, []);

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
  // Avisa a los demas que estas escribiendo. Con freno de 2 segundos: sin el
  // se mandaria un aviso por cada tecla, y basta con refrescar el estado.
  const avisarQueEscribo = useCallback(() => {
    if (!canalRef.current || !user?.id) return;
    const t = Date.now();
    if (t - ultimoAvisoRef.current < 2000) return;
    ultimoAvisoRef.current = t;
    canalRef.current.send({
      type: 'broadcast',
      event: 'escribiendo',
      // El nombre y la foto viajan en el aviso para no obligar a quien lo
      // recibe a buscarlos: en un grupo puede llegar de alguien que todavia no
      // tiene cargado en su lista de participantes.
      payload: {
        user_id: user.id,
        nombre: participantsById[user.id]?.name || 'Alguien',
        foto: participantsById[user.id]?.profile_photo_url || null,
      },
    });
  }, [user?.id, participantsById]);

  // Alto de la caja de escribir EN LA WEB. En iPhone y Android no se usa: ahi
  // el TextInput de varias lineas ya crece solo entre minHeight y maxHeight.
  // Un <textarea>, en cambio, nunca crece solo -- hay que medirlo a mano.
  const [alturaInputWeb, setAlturaInputWeb] = useState(INPUT_ALTURA_MIN);
  const inputRef = useRef<any>(null);

  // Se pone la altura en 'auto' ANTES de medir: el scrollHeight de un textarea
  // nunca baja de su altura actual, asi que sin este paso la caja crecia pero
  // no volvia a encogerse al borrar texto.
  const medirAlturaWeb = useCallback(() => {
    if (Platform.OS !== 'web') return;
    const nodo = inputRef.current as any;
    if (!nodo || !nodo.style) return;
    const previa = nodo.style.height;
    nodo.style.height = 'auto';
    const medida = nodo.scrollHeight || INPUT_ALTURA_MIN;
    nodo.style.height = previa;
    setAlturaInputWeb(Math.max(INPUT_ALTURA_MIN, Math.min(INPUT_ALTURA_MAX, medida)));
  }, []);

  const updateDraft = useCallback((text: string) => {
    setDraft(text);
    // Al enviar se limpia el borrador: la caja vuelve a un renglon de una vez,
    // sin esperar a que el navegador vuelva a medir.
    if (!text) setAlturaInputWeb(INPUT_ALTURA_MIN);
    else if (Platform.OS === 'web') requestAnimationFrame(medirAlturaWeb);
    const m = text.match(/@([^\s@]{0,25})$/);
    setMentionQuery(m ? m[1] : null);
    if (!conversationId) return;
    if (text) AsyncStorage.setItem(DRAFT_KEY(conversationId), text).catch(() => {});
    else AsyncStorage.removeItem(DRAFT_KEY(conversationId)).catch(() => {});
  }, [conversationId, medirAlturaWeb]);

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
          setMessages((prev) => fusionarMensajeReal(prev, newMsg));
          // Si escribe alguien que no tenemos identificado, se pide la lista de
          // nuevo: acaba de "presentarse" al hablar.
          if (newMsg.sender_id && !participantsByIdRef.current[newMsg.sender_id]) {
            recargarParticipantes();
          }
          // Ya mando el mensaje: el "esta escribiendo" sobra. Sin esto se
          // quedaria hasta caducar y se veria el aviso junto al mensaje ya
          // entregado, que es justo lo que delata que esta mal hecho.
          setEscribiendo((prev) => {
            if (!prev[newMsg.sender_id]) return prev;
            const copia = { ...prev };
            delete copia[newMsg.sender_id];
            return copia;
          });
          // Llego un mensaje con el chat abierto: si se esta mirando el final,
          // se ve de inmediato, asi que cuenta como leido hasta el.
          if (cercaDelFinalRef.current) marcarLeido(newMsg.created_at);
          // Solo si ya estaba abajo. Que llegue un mensaje mientras lees algo
          // de antes no es motivo para sacarte de donde estas.
          if (cercaDelFinalRef.current) {
            setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
          }
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
      // Quien esta conectado. Va en ESTE canal y no en uno aparte para no
      // abrir dos por conversacion.
      .on('presence', { event: 'sync' }, () => {
        // Si yo tengo el interruptor apagado, tampoco leo el de los demas. Y
        // mientras no se sepa tampoco: en cuanto se sepa que esta encendido se
        // anuncia, y ese anuncio dispara otro sync que ya pinta la lista.
        if (mostrarRef.current !== true) { setEnLinea([]); return; }
        setEnLinea(idsPresentes(channel.presenceState() as any, user?.id));
      })
      .on('broadcast', { event: 'escribiendo' }, ({ payload }) => {
        const p = payload as { user_id?: string; nombre?: string; foto?: string | null };
        if (!p?.user_id || p.user_id === user?.id) return;   // lo propio no cuenta
        setEscribiendo((prev) => ({
          ...prev,
          [p.user_id!]: {
            nombre: p.nombre || 'Alguien',
            // Si ya tenemos a la persona cargada, se prefiere su foto local:
            // esta cacheada y evita descargarla otra vez.
            foto: participantsByIdRef.current[p.user_id!]?.profile_photo_url ?? p.foto ?? null,
            ts: Date.now(),
          },
        }));
      });

    canalRef.current = channel;

    // El anuncio se arma ANTES de suscribirse, no despues: si se armara
    // despues y 'SUBSCRIBED' llegara primero, no habria nadie escuchando y no
    // se anunciaria nunca. Hoy el callback siempre tarda --va por websocket--
    // pero depender de eso es exactamente el tipo de suposicion que no se ve
    // venir cuando se rompe.
    if (user?.id) {
      const anuncio = anuncioDePresencia(channel, user.id);
      anuncio.alSaberElAjuste(mostrarRef.current);
      anuncioRef.current = anuncio;
    }

    // Anunciarse SOLO si el interruptor esta encendido: esa es la mitad de la
    // reciprocidad que de verdad se puede garantizar, porque sin track() no se
    // aparece en el estado del canal y nadie puede verlo. Quien decide es el
    // anuncio, que espera a saber el ajuste si hace falta.
    channel.subscribe((estado) => {
      if (estado === 'SUBSCRIBED') anuncioRef.current?.alSuscribirse();
    });

    return () => {
      canalRef.current = null;
      anuncioRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [conversationId, loadReactions, user?.id]);

  // El ajuste llega por una consulta y el canal se suscribe por websocket: son
  // dos esperas en paralelo, asi que cualquiera de las dos puede ganar. Esto
  // cubre el caso de que gane el canal, y ademas el de apagar el interruptor
  // con el chat abierto --que antes dejaba el anuncio puesto--.
  useEffect(() => {
    anuncioRef.current?.alSaberElAjuste(enLineaParaAnunciar);
  }, [enLineaParaAnunciar]);

  // Carga inicial de las reacciones al abrir el chat.
  useEffect(() => { loadReactions(); }, [loadReactions]);

    const handleSend = async (overrideContent?: string) => {
    const content = (overrideContent ?? draft).trim();
    if (!content || !user?.id || !conversationId || sending) return;

    setSending(true);
    setDraft('');

    const replyId = replyingTo?.id ?? null;
    const respuestaPrevia = replyingTo;

    // Los mencionados van DENTRO del mensaje para que la notificacion, que se
    // dispara al insertarlo, ya sepa a quien avisarle distinto.
    const norm = normalizeText(content);
    const mentionAll = /@todos\b/i.test(content);
    const mentionIds = participants
      .filter((pp) => pp.user_id !== user.id)
      .filter((pp) => mentionAll || norm.includes('@' + normalizeText(pp.name)))
      .map((pp) => pp.user_id);

    // El mensaje se pinta YA, sin esperar al servidor.
    //
    // Antes se esperaba la respuesta de Supabase para mostrarlo, asi que al
    // enviar quedaba un hueco de varios cientos de milisegundos -- mas si la
    // senal es mala -- en el que parecia que no habia pasado nada. Es la
    // interaccion mas usada del chat, y era la que mas lo hacia sentir lento.
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const provisional: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      content,
      created_at: new Date().toISOString(),
      reply_to: replyId,
      pending: true,
    };
    setMessages((prev) => [...prev, provisional]);
    setReplyingTo(null);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    toqueFuerte();

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
      // Se retira el provisional y se devuelve TODO como estaba -- texto y
      // respuesta citada -- para poder reintentar sin perder nada.
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setReplyingTo(respuestaPrevia);
      updateDraft(content); // se restaura y se vuelve a guardar el borrador
      hapticoError();
    } else if (data) {
      setMessages((prev) => fusionarMensajeReal(prev, data as Message, tempId));
      if (conversationId) AsyncStorage.removeItem(DRAFT_KEY(conversationId)).catch(() => {});
      // Este mensaje pudo acabar de convertir el chat en una solicitud.
      //
      // La condicion NO puede exigir meta.conv_type === 'direct': en un chat
      // recien creado meta es null (ver refrescarEstadoDirecto), que es
      // precisamente cuando hace falta preguntar. Por eso basta con que meta
      // falte, o que sea un privado sin aceptar todavia; el type lo confirma
      // la consulta. Un grupo nunca entra, porque ahi meta si viene llena.
      const puedeHaberseVueltoSolicitud =
        !meta || (meta.conv_type === 'direct' && meta.estado !== 'aceptada');
      if (puedeHaberseVueltoSolicitud) {
        refrescarEstadoDirecto();
      }
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

    // La foto se ve YA, mientras se sube.
    //
    // Antes la burbuja no aparecia hasta que el archivo terminaba de subir: con
    // una foto pesada y datos moviles eso son varios segundos mirando una
    // pantalla que no reacciona, y la sensacion es que la app se colgo. Ahora
    // se pinta al instante usando el archivo que ya esta en el telefono
    // (asset.uri) y se sube por detras; al terminar, el provisional se cambia
    // por el de verdad. Si falla la subida, se quita y se avisa.
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const provisional: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      content: caption,
      created_at: new Date().toISOString(),
      reply_to: replyId,
      media_path: asset.uri,
      media_kind: kind,
      media_mime: mime,
      media_width: asset.width ?? null,
      media_height: asset.height ?? null,
      pending: true,
    } as Message;
    setMessages((prev) => [...prev, provisional]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      await uploadToBucket(asset, path, mime);
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      throw e;
    }

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

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      throw new Error(error.message);
    }
    if (data) {
      setMessages((prev) => fusionarMensajeReal(prev, data as Message, tempId));
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

  // En iPhone, si no se configura la sesion de audio, el interruptor lateral de
  // silencio deja las notas de voz mudas aunque el archivo este perfecto. Se
  // configura al abrir el chat, no solo al grabar.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

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
    toqueFuerte();
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
        // audio/mp4 es el tipo estandar; 'audio/m4a' no lo es y algunos
        // reproductores lo rechazan.
        mime = 'audio/mp4';
        ext = 'm4a';
        payload = { uri: recorder.uri };
      }

      if (seconds < 0.7) return; // toque accidental: no se manda nada

      // Red de seguridad: antes se subieron notas de 5 bytes que aparecian en
      // el chat pero no sonaban. Mejor avisar que mandar algo mudo. Va ANTES de
      // pintar la burbuja, para no tener que quitarla despues.
      if (payload instanceof Blob && payload.size < 1024) {
        avisar('La grabación no se guardó bien. Vuelve a intentarlo.');
        return;
      }

      const path = `${conversationId}/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const replyId = replyingTo?.id ?? null;

      // La burbuja se pinta YA, igual que las fotos, y la subida va por detras.
      //
      // Antes no aparecia nada hasta que terminaran las cuatro cosas que pasan
      // al soltar el boton --cerrar el archivo, revisar la sesion, subir y
      // crear el mensaje--, una detras de otra. Toda esa espera se veia como si
      // la app se hubiera trabado, que es justo lo que se reporto en iPhone. El
      // archivo ya esta en el telefono, asi que la nota se puede oir de
      // inmediato: esEnlaceDirecto acepta file: y blob:, de modo que suena del
      // disco sin pedirle nada al servidor.
      const uriLocal = payload instanceof Blob
        ? URL.createObjectURL(payload)
        : (payload as { uri: string }).uri;
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const provisional: Message = {
        id: tempId,
        conversation_id: conversationId,
        sender_id: user.id,
        content: '',
        created_at: new Date().toISOString(),
        reply_to: replyId,
        media_path: uriLocal,
        media_kind: 'audio',
        media_mime: mime,
        media_duration: seconds,
        pending: true,
      } as Message;
      setMessages((prev) => [...prev, provisional]);
      setReplyingTo(null);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);

      try {
        if (payload instanceof Blob) {
          const { error: upError } = await supabase.storage
            .from(MEDIA_BUCKET)
            .upload(path, payload, { contentType: mime, cacheControl: '3600', upsert: false });
          if (upError) throw new Error(upError.message);
        } else {
          await uploadToBucket(payload as ImagePicker.ImagePickerAsset, path, mime);
        }
      } catch (e) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        throw e;
      }

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

      if (error) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        throw new Error(error.message);
      }
      if (data) {
        setMessages((prev) => fusionarMensajeReal(prev, data as Message, tempId));
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

  // ── GIFs ───────────────────────────────────────────────────────────────
  // Clave donde se guardan los ultimos GIFs usados. Va por dispositivo y no por
  // conversacion: si alguien usa siempre el mismo GIF de "jajaja", lo quiere a
  // la mano en TODOS sus chats, no solo en el que lo estreno.
  const GIF_RECIENTES_KEY = 'chat_gifs_recientes';
  const GIF_RECIENTES_MAX = 24;

  const guardarGifReciente = async (gif: Gif) => {
    try {
      const sinRepetir = [gif, ...gifRecientes.filter((g) => g.id !== gif.id)].slice(0, GIF_RECIENTES_MAX);
      setGifRecientes(sinRepetir);
      await AsyncStorage.setItem(GIF_RECIENTES_KEY, JSON.stringify(sinRepetir));
    } catch {
      // Que no se pueda guardar el historial no es motivo para tumbar el envio.
    }
  };

  // ── Stickers de Nospi ──────────────────────────────────────────────────
  const abrirStickers = async () => {
    setShowAttachMenu(false);
    setShowStickers(true);
    if (stickers.length > 0) return;      // ya estan, no se vuelve a pedir
    setStickersCargando(true);
    try {
      const { data, error } = await supabase
        .from('stickers')
        .select('id, url, etiqueta, orden, pack_id, sticker_packs!inner(orden, activo)')
        .eq('activo', true)
        .eq('sticker_packs.activo', true)
        .order('orden', { ascending: true });
      if (error) throw error;
      setStickers(((data as any[]) || []).map((s) => ({ id: s.id, url: s.url, etiqueta: s.etiqueta })));
    } catch (e: any) {
      console.error('stickers:', e?.message || e);
    } finally {
      setStickersCargando(false);
    }
  };

  // Se manda igual que un GIF: lo que viaja es la URL publica, no una copia.
  // El archivo del sticker es compartido por todo el mundo, asi que copiarlo a
  // chat-media por cada envio lo duplicaria mil veces y la limpieza mensual lo
  // borraria a los 30 dias, rompiendo de golpe todos los mensajes que lo usan.
  const enviarSticker = async (s: StickerDeNospi) => {
    if (!user?.id || !conversationId || stickerEnviando || uploading) return;
    const caption = draft.trim();
    const replyId = replyingTo?.id ?? null;
    setStickerEnviando(s.id);
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: caption,
          reply_to: replyId,
          media_path: s.url,
          media_kind: 'image',
          media_mime: s.url.endsWith('.webp') ? 'image/webp' : 'image/png',
        })
        .select(MESSAGE_COLUMNS)
        .single();
      if (error) throw error;
      if (data) setMessages((prev) => [...prev, data as Message]);
      setShowStickers(false);
      setReplyingTo(null);
      if (caption) updateDraft('');
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (e: any) {
      avisar('No se pudo enviar el sticker. ' + (e?.message || ''));
    } finally {
      setStickerEnviando(null);
    }
  };

  const abrirGifs = async () => {
    setShowAttachMenu(false);
    setShowGifPicker(true);
    setGifQuery('');
    setGifError(null);
    try {
      const guardados = await AsyncStorage.getItem(GIF_RECIENTES_KEY);
      if (guardados) {
        const parsed = JSON.parse(guardados);
        if (Array.isArray(parsed)) setGifRecientes(parsed);
      }
    } catch {
      // historial ilegible: se arranca en limpio
    }
  };

  // Busqueda con freno: se espera a que la persona deje de escribir antes de
  // pedirle nada a GIPHY. Sin esto se gastaria una peticion por cada letra, y el
  // cupo gratis son 100 por hora para toda la app.
  useEffect(() => {
    if (!showGifPicker) return;
    if (!giphyConfigurado()) {
      setGifError('El buscador de GIFs todavía no está configurado.');
      setGifResults([]);
      return;
    }
    let vivo = true;
    const consulta = gifQuery.trim();
    setGifLoading(true);
    setGifError(null);
    const t = setTimeout(async () => {
      try {
        const res = consulta ? await gifsBuscar(consulta) : await gifsTendencia();
        if (!vivo) return;
        setGifResults(res);
        if (res.length === 0 && consulta) setGifError(`No encontramos GIFs de "${consulta}".`);
      } catch (e: any) {
        if (!vivo) return;
        setGifResults([]);
        // El cupo gratis de GIPHY es de 100 busquedas por hora para toda la
        // app. Cuando se llena conviene decir la verdad en cristiano, no
        // "error 429", y sobre todo no dejar la pantalla en blanco.
        setGifError(
          e instanceof GiphySinCupo
            ? 'Hoy se buscaron muchos GIFs en Nospi. Inténtalo en un rato.'
            : 'No se pudieron cargar los GIFs. Revisa tu conexión.'
        );
      } finally {
        if (vivo) setGifLoading(false);
      }
    }, consulta ? 400 : 0);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [showGifPicker, gifQuery]);

  // Se baja el GIF de GIPHY y se sube al bucket del chat como un adjunto mas.
  // Se hace asi, y no guardando el enlace de GIPHY, porque de esta forma el GIF
  // hereda TODO lo que ya existe: enlace firmado, vista en el admin, descargar,
  // compartir y el aviso push. Y ademas sigue estando aunque GIPHY mueva o
  // borre ese archivo, o aunque un dia cierre como cerro Tenor.
  const enviarGif = async (gif: Gif) => {
    if (!user?.id || !conversationId || gifEnviando || uploading) return;
    if (gif.fullSize > MAX_UPLOAD_BYTES) {
      avisar('Ese GIF pesa demasiado. Prueba con otro.');
      return;
    }

    const caption = draft.trim();
    const replyId = replyingTo?.id ?? null;
    setGifEnviando(gif.id);

    try {
      // El GIF NO se copia a nuestro Storage: se guarda el enlace de GIPHY tal
      // cual. Antes el telefono lo bajaba entero (hasta 2 MB) y lo volvia a
      // subir antes de que el mensaje apareciera — el mismo archivo viajando
      // dos veces por los datos de la persona, que es lo que se sentia lento.
      // GIPHY sirve esos enlaces desde su propia red y para siempre.
      //
      // Aguas con esto: media_path deja de ser siempre una ruta del bucket y
      // puede ser una URL. Todo lo que lo use tiene que mirar si empieza por
      // http (firmar enlaces, la limpieza mensual del servidor).
      const path = gif.fullUrl;

      const { data, error: insErr } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: caption,
          reply_to: replyId,
          media_path: path,
          media_kind: 'image',
          media_mime: 'image/gif',
          media_width: gif.previewWidth || null,
          media_height: gif.previewHeight || null,
          media_size: gif.fullSize || null,
        })
        .select(MESSAGE_COLUMNS)
        .single();

      if (insErr) throw new Error(insErr.message);
      if (data) {
        setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data as Message]));
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      }

      await guardarGifReciente(gif);

      setShowGifPicker(false);
      setReplyingTo(null);
      if (caption) updateDraft('');
    } catch (e: any) {
      console.error('enviarGif error:', e);
      avisar('No se pudo enviar el GIF. ' + (e?.message || ''));
    } finally {
      setGifEnviando(null);
    }
  };

  // ── Crear encuesta ─────────────────────────────────────────────────────
  // La regla de permiso vive en la base (funcion crear_encuesta): si puedes
  // escribir en esta conversacion, puedes lanzar una encuesta en ella. Aca solo
  // se arma el formulario y se muestran los errores que devuelva.
  const abrirEncuesta = () => {
    setShowAttachMenu(false);
    setPollPregunta('');
    setPollOpciones(['', '']);
    setPollError(null);
    setShowPollForm(true);
  };

  const cambiarOpcion = (i: number, txt: string) => {
    setPollOpciones((prev) => prev.map((o, j) => (j === i ? txt : o)));
  };

  // Hasta 5: mas opciones no caben en la tarjeta del chat sin volverse ilegibles.
  const agregarOpcion = () => {
    setPollOpciones((prev) => (prev.length >= 5 ? prev : [...prev, '']));
  };

  const quitarOpcion = (i: number) => {
    setPollOpciones((prev) => (prev.length <= 2 ? prev : prev.filter((_, j) => j !== i)));
  };

  const pollListo =
    pollPregunta.trim().length >= 3 &&
    pollOpciones.filter((o) => o.trim().length > 0).length >= 2;

  const enviarEncuesta = async () => {
    if (!conversationId || pollEnviando || !pollListo) return;
    setPollEnviando(true);
    setPollError(null);
    try {
      const { error } = await supabase.rpc('crear_encuesta', {
        p_conversation_id: conversationId,
        p_question: pollPregunta.trim(),
        p_options: pollOpciones.map((o) => o.trim()).filter((o) => o.length > 0),
      });
      if (error) {
        setPollError(error.message);
        return;
      }
      setShowPollForm(false);
      // La encuesta llega por realtime como un mensaje mas; no hay que
      // insertarla a mano en la lista.
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 300);
    } catch (e: any) {
      setPollError(e?.message || 'No se pudo crear la encuesta.');
    } finally {
      setPollEnviando(false);
    }
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

  // ── Pegar una imagen del portapapeles ──────────────────────────────────
  //
  // Es lo que de verdad resuelve lo que pidio Esteban ("me estoy privando de
  // enviar algunos"): los stickers de los teclados de terceros no salen de un
  // catalogo, se pasan por el portapapeles.
  //
  // En la WEB se captura solo, con el evento `paste` (ver el efecto de abajo).
  // En el CELULAR no se puede: React Native no tiene ese evento, y cuando
  // alguien pega dentro del TextInput el sistema solo entrega texto -- la
  // imagen nunca llega a la app. Por eso aqui hace falta algo visible que
  // tocar. Es mas feo que el pegado invisible, pero la alternativa era
  // reemplazar el TextInput del chat por uno nativo de terceros, y eso es
  // cambiar una pieza central por una libreria que apenas esta poniendose al
  // dia con las versiones recientes de RN.
  //
  // Nada se envia aqui: la imagen entra a la bandeja de adjuntos como una foto
  // mas, para que se pueda ver antes de mandarla y ponerle pie de foto.
  const meterEnLaBandeja = (asset: any) => {
    if ((asset.fileSize ?? 0) > MAX_UPLOAD_BYTES) {
      const msg = `Esa imagen pesa ${formatMB(asset.fileSize)} y el máximo son 25 MB.`;
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('Imagen muy pesada', msg);
      return;
    }
    setPendingAssets((prev) => (prev.length >= 10 ? prev : [...prev, asset]));
  };

  const revisarPortapapeles = useCallback(async () => {
    const C = portapapeles();
    // Sin modulo nativo (app vieja recibiendo un OTA) no hay boton que mostrar.
    if (Platform.OS === 'web' || !C) { setHayImagenPegable(false); return; }
    try { setHayImagenPegable(await C.hasImageAsync()); }
    catch { setHayImagenPegable(false); }
  }, []);

  const pegarImagen = async () => {
    setShowAttachMenu(false);
    try {
      // PNG y no JPEG: un sticker casi siempre tiene fondo transparente, y
      // pasarlo a JPEG lo dejaria con un cuadro blanco detras.
      //
      // LIMITACION CONOCIDA, Y NO TIENE ARREGLO DESDE AQUI: muchos stickers
      // --los de WhatsApp sobre todo-- son webp ANIMADOS. expo-clipboard solo
      // sabe devolver 'png' o 'jpeg' (ver GetImageOptions) y no expone los
      // bytes originales por ninguna via, asi que en el celular la animacion se
      // pierde y llega el primer fotograma quieto. En la web no pasa: ahi el
      // navegador entrega el archivo tal cual, webp animado incluido.
      //
      // Arreglarlo exigiria codigo nativo que lea el portapapeles sin convertir.
      // Si algun dia expo-clipboard acepta 'webp' en format, con cambiarlo aqui
      // basta.
      const C = portapapeles();
      if (!C) { Alert.alert('No disponible', 'Esta versión de la app todavía no puede pegar imágenes. Se activa con la próxima actualización.'); return; }
      const img = await C.getImageAsync({ format: 'png' });
      if (!img?.data) {
        Alert.alert('No hay imagen', 'El portapapeles no tiene ninguna imagen copiada.');
        return;
      }
      const base64 = img.data.replace(/^data:image\/[a-z]+;base64,/, '');
      // FileSystem.uploadAsync necesita un archivo de verdad, no una cadena.
      const uri = `${FileSystem.cacheDirectory}pegado-${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
      const info = await FileSystem.getInfoAsync(uri, { size: true });
      meterEnLaBandeja({
        uri,
        type: 'image',
        fileName: 'pegado.png',
        mimeType: 'image/png',
        width: img.size?.width ?? null,
        height: img.size?.height ?? null,
        fileSize: (info as any)?.size ?? null,
      });
    } catch (e: any) {
      Alert.alert('No se pudo pegar', e?.message || 'Inténtalo de nuevo.');
    }
  };

  // Web: Cmd/Ctrl+V con una imagen en el portapapeles. El navegador si entrega
  // el archivo, asi que aqui no hace falta ningun boton.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const alPegar = async (ev: any) => {
      const archivos: File[] = Array.from(ev.clipboardData?.files || []);
      const imagenes = archivos.filter((f) => (f.type || '').startsWith('image/'));
      if (imagenes.length === 0) return;   // pegado de texto normal: no se toca
      ev.preventDefault();
      for (const f of imagenes.slice(0, 10)) {
        const uri = URL.createObjectURL(f);
        // El alto y ancho sirven para que la burbuja reserve el espacio justo y
        // la lista no pegue un salto cuando la imagen termina de cargar.
        const medidas = await new Promise<{ w: number | null; h: number | null }>((listo) => {
          const im = new (window as any).Image();
          im.onload = () => listo({ w: im.naturalWidth || null, h: im.naturalHeight || null });
          im.onerror = () => listo({ w: null, h: null });
          im.src = uri;
        });
        meterEnLaBandeja({
          uri,
          type: 'image',
          fileName: f.name || 'pegado.png',
          mimeType: f.type || 'image/png',
          width: medidas.w,
          height: medidas.h,
          fileSize: f.size ?? null,
        });
      }
    };
    document.addEventListener('paste', alPegar);
    return () => document.removeEventListener('paste', alPegar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (!otherUserId || otherUserId === user?.id) return;
    // El candado va en un ref y NO en el estado. Antes el guardia era
    // `startingChatWith`, que ademas deja el boton disabled: si el RPC LANZABA
    // (sin try/catch no habia quien lo limpiara), esa variable se quedaba
    // puesta para siempre y el boton moria en silencio — ni abria el chat, ni
    // llamaba al servidor, ni avisaba nada. El ref se limpia siempre en el
    // finally, incluso si algo explota.
    if (startingRef.current) return;
    startingRef.current = true;
    setStartingChatWith(otherUserId);

    let data: any = null;
    let error: any = null;
    try {
      const res = await supabase.rpc('get_or_create_direct_chat', {
        p_other_user_id: otherUserId,
      });
      data = res.data;
      error = res.error;
    } catch (e: any) {
      error = e;
    } finally {
      startingRef.current = false;
      setStartingChatWith(null);
    }

    setShowParticipants(false);

    if (error) {
      console.error('ChatThread: error starting direct chat', error);
      // El unico error "de negocio" que puede devolver get_or_create_direct_chat
      // es el limite de solicitudes sin responder, y lo lanza con errcode 42501.
      // Ese caso NO se resuelve reintentando, asi que se explica aparte en vez
      // de mostrar el mensaje generico de "intenta de nuevo".
      //
      // Antes este mismo 42501 se traducia como "solo puedes escribirle a
      // personas que asistieron contigo a un evento", que era la regla vieja:
      // desde que existen las solicitudes eso ya no es verdad, y la persona
      // leia una explicacion que no tenia nada que ver con lo que le paso.
      const msg = String(error.message || '');
      const limiteDeSolicitudes =
        (error as any).code === '42501' || msg.includes('solicitudes sin responder');
      const titulo = limiteDeSolicitudes ? 'Llegaste al límite del día' : 'No se pudo abrir el chat';
      const detalle = limiteDeSolicitudes
        ? 'Puedes tener hasta 10 solicitudes sin responder. En unas horas se liberan solas, y también se libera cada vez que alguien te acepta. Es para que nadie reciba mensajes en masa.'
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
      return;
    }

    // Ni error ni conversacion: no puede quedarse callado. "No pasa nada" es la
    // peor respuesta posible — el usuario vuelve a tocar y vuelve a no pasar
    // nada, sin ninguna pista de por que.
    const aviso = 'No pudimos abrir el chat. Vuelve a intentarlo.';
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.alert(aviso);
    } else {
      Alert.alert('Chat privado', aviso);
    }
  };

  const handleBack = () => {
    // El marcado de leido NO va aqui: va en el efecto de desmontaje, que cubre
    // TODAS las salidas. Ver el comentario de ese efecto.
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

  // Memoizados los dos: sin esto se rearmaban en CADA render, y mentionRegex
  // mete todos los nombres del chat en una sola alternancia.
  const mentionCandidates = useMemo(
    () => participants.filter((p) => p.user_id !== user?.id),
    [participants, user?.id],
  );
  const mentionRe = useMemo(
    () => mentionRegex(mentionCandidates.map((p) => p.name)),
    [mentionCandidates],
  );

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
  const pinnedMessages = (() => {
    const porId = new Map<string, Message>();
    // Primero los traidos aparte y despues los de la lista: si un mensaje esta
    // en las dos, gana el de la lista, que es el que refleja lo que la persona
    // acaba de fijar o desfijar sin esperar al servidor.
    for (const m of fijados) if (m.pinned_at) porId.set(m.id, m);
    for (const m of messages) {
      if (m.pinned_at) porId.set(m.id, m);
      else porId.delete(m.id);
    }
    return Array.from(porId.values())
      .sort((x, y) => (y.pinned_at || '').localeCompare(x.pinned_at || ''));
  })();
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
  // La comunidad es un chat de muchos, como un grupo de evento, pero no tiene
  // evento detras. Sin distinguirla aqui caia al camino de "chat directo" y el
  // encabezado mostraba a la primera participante de la lista como si fuera la
  // otra persona de una conversacion 1-a-1.
  const isComunidad = meta?.conv_type === 'community';
  // Para todo lo que signifique "esto NO es una conversacion de dos".
  const esGrupal = isGroup || isComunidad;
  // Un canal es de difusion: escribe el equipo de Nospi y, si esta abierto,
  // tambien responde la gente. Las encuestas se responden siempre. Se calcula
  // mucho mas arriba (esCanal) porque alla lo necesita un efecto.
  const isChannel = esCanal;
  const channelReadOnly = isChannel && !meta?.replies_open && !isAdminUser;

  // Una solicitud sin responder. Se distingue quien la envio: a quien la
  // recibio se le muestran los botones; a quien la envio, que espere.
  const esSolicitudPendiente = meta?.conv_type === 'direct' && meta?.estado === 'pendiente';
  const solicitudParaMi = esSolicitudPendiente && meta?.solicitada_por !== user?.id;
  const solicitudEnviadaPorMi = esSolicitudPendiente && meta?.solicitada_por === user?.id;
  // Para chats directos, "el otro" participante sirve de respaldo: cuando la
  // conversacion aun no tiene mensajes no aparece en get_my_conversations, asi
  // que meta llega null y el nombre/foto hay que sacarlos de los participantes
  // (get_conversation_participants si los trae, con o sin mensajes).
  const otherParticipant = !esGrupal && !isChannel ? participants.find((p) => p.user_id !== user?.id) : undefined;
  const headerTitle = isChannel
    ? meta?.channel_title || 'Canal de Nospi'
    : isComunidad
    ? meta?.channel_title || 'Comunidad Nospi'
    : isGroup
    ? meta?.event_name || 'Chat del evento'
    : meta?.other_user_name || otherParticipant?.name || 'Chat';
  const otherUserPhoto = !esGrupal && !isChannel
    ? meta?.other_user_photo || otherParticipant?.profile_photo_url || null
    : null;

  const unlockAt = isGroup && meta?.event_date
    ? new Date(new Date(meta.event_date).getTime() - CHAT_UNLOCK_MINUTES_BEFORE * 60 * 1000)
    : null;
  const isLocked = !!unlockAt && Date.now() < unlockAt.getTime();

  // Quien se queda esperando en la pantalla del candado ("Se abre a las
  // 8:30 p.m.") tenia que salir y volver a entrar para que se abriera: el
  // candado se calcula al dibujar, y nadie volvia a dibujar al llegar la hora.
  // Ahora se repinta solo en ese instante y se carga la conversacion.
  useEffect(() => {
    if (!isLocked || !unlockAt) return;
    const falta = unlockAt.getTime() - Date.now();
    // +1000 para caer despues del momento exacto, no justo antes.
    const t = setTimeout(() => { loadEverything(); }, falta + 1000);
    return () => clearTimeout(t);
  }, [isLocked, unlockAt?.getTime(), loadEverything]);

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
      {/* En la web el chat ocupaba TODO el ancho del navegador: en una pantalla
          de escritorio el "+" quedaba pegado al borde izquierdo, el cuadro de
          "Escribe un mensaje..." se estiraba como una franja de lado a lado y
          las burbujas quedaban perdidas en el medio. En el celular no se nota
          porque la pantalla ya es angosta. Aca se limita todo el chat a una
          columna centrada, como hacen WhatsApp Web y Telegram Web. */}
      {/* 'padding' en LAS DOS plataformas: antes en Android quedaba undefined
          y por eso el teclado tapaba la barra de escribir. Con este
          KeyboardAvoidingView (el de react-native-keyboard-controller) el mismo
          behavior sirve en iOS y en Android.
          El keyboardVerticalOffset se deja como estaba, distinto por
          plataforma: en iOS venia funcionando bien y no hay por que tocarlo. */}
      <KeyboardAvoidingView
        style={[{ flex: 1 }, styles.chatColumn]}
        behavior="padding"
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
            ) : isComunidad ? (
              // Mismo icono que en la lista de chats: si el encabezado muestra
              // otra cosa, parece que se entro a una conversacion distinta.
              <View style={styles.headerAvatarPlaceholder}>
                <IconSymbol
                  ios_icon_name="person.3.fill"
                  android_material_icon_name="groups"
                  size={18}
                  color="#FFFFFF"
                />
              </View>
            ) : isGroup ? (
              <View style={styles.headerAvatarPlaceholder}>
                <Image source={eventIconSource(meta?.event_type)} style={meta?.event_type === 'virtual' ? styles.headerEventIconAncho : styles.headerEventIcon} resizeMode="contain" />
              </View>
            ) : (
              <ChatAvatar
                uri={otherUserPhoto}
                name={headerTitle}
                gender={otherParticipant?.gender ?? meta?.other_user_gender}
                size={30}
                marginRight={8}
                enLinea={!!otherParticipantId && miPrivacidad.enLinea && enLinea.includes(otherParticipantId)}
                // En el privado, tocar la foto del otro tambien abre su ficha,
                // no el visor con Descargar y Compartir.
                onPress={otherParticipant ? () => setPerfilVisto(otherParticipant) : undefined}
              />
            )}
            {/* En el privado, el titulo ES el nombre de la otra persona, asi
                que tambien abre su ficha. En grupos y canales es el nombre del
                evento y no hay ficha que abrir. */}
            {/* El nombre y el "esta escribiendo" van en COLUMNA: headerCenter
                es una fila (para dejar la foto a la izquierda), asi que sin
                esta envoltura el aviso salia AL LADO del nombre, no debajo. Y
                como el nombre lleva flexShrink y el aviso no, el nombre se
                quedaba con todo el ancho y el aviso se exprimia a cero: el
                texto se pintaba pero no se veia nunca. */}
            <View style={styles.headerTitleColumna}>
              <Text
                style={styles.headerTitle}
                numberOfLines={1}
                onPress={otherParticipant ? () => setPerfilVisto(otherParticipant) : undefined}
                suppressHighlighting={!otherParticipant}
              >
                {headerTitle}
              </Text>
              {/* El "esta escribiendo" ya NO va aqui: se movio al final de la
                  lista de mensajes, como una burbuja mas (ver FilaEscribiendo y
                  el ListFooterComponent). Abajo es donde la persona tiene los
                  ojos mientras escribe.

                  Lo que SI va aqui es quien esta conectado. En un privado, "en
                  linea" o la ultima vez; en un grupo, cuantos hay. Y si no hay
                  nada que decir no se escribe NADA: poner "sin conexion" o
                  "oculto" delata que el otro lo apago, que es justo la pregunta
                  incomoda que el interruptor queria evitar. */}
              {(() => {
                if (!miPrivacidad.enLinea) return null;

                if (otherParticipantId) {
                  if (enLinea.includes(otherParticipantId)) {
                    return <Text style={styles.headerEnLinea} numberOfLines={1}>en línea</Text>;
                  }
                  // new Date() y no el reloj `ahora`: ese solo avanza mientras alguien
                  // escribe, asi que podria decir "hace 2 minutos" llevando 20.
                  const texto = textoUltimaVez(ultimaVezOtro, new Date());
                  return texto
                    ? <Text style={styles.headerUltimaVez} numberOfLines={1}>{texto}</Text>
                    : null;
                }

                // Grupos, comunidad y canales: el numero y no la lista. En la
                // Comunidad hay 246 personas.
                const cuantos = enLinea.length;
                if (cuantos === 0) return null;
                // Se toca para ver QUIENES son. El numero solo dice que hay
                // gente; en un grupo lo siguiente que uno quiere saber es si
                // esta alguien en particular.
                return (
                  <TouchableOpacity onPress={() => { toque(); setVerEnLinea(true); }} hitSlop={6}>
                    <Text style={styles.headerEnLinea} numberOfLines={1}>
                      {textoEnLinea(cuantos)} ›
                    </Text>
                  </TouchableOpacity>
                );
              })()}
            </View>
          </View>

          <TouchableOpacity onPress={() => { toque(); setBuscando(true); }} style={styles.headerActionButton}>
            <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={21} color="#FFFFFF" />
          </TouchableOpacity>
          {esGrupal ? (
            <TouchableOpacity onPress={() => setShowParticipants(true)} style={styles.headerActionButton}>
              <IconSymbol ios_icon_name="person.2.fill" android_material_icon_name="group" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          ) : (
            <View style={styles.headerActionButton} />
          )}
        </View>
        {esGrupal && (
          <TouchableOpacity style={styles.directChatBanner} onPress={() => setShowParticipants(true)} activeOpacity={0.8}>
            <Text style={styles.directChatBannerText}>
              {isComunidad
                // En la comunidad la mayoria NO ha coincidido en un evento, asi
                // que escribirle a alguien pasa casi siempre por una solicitud.
                // Decirlo aqui evita la sorpresa de "¿por que no puedo escribir?".
                ? '💬 Toca aquí para ver quién está y enviar una solicitud'
                : '💬 Toca aquí para escribirle en privado a alguien del grupo'}
            </Text>
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

        {/* La lista y la flecha van juntas en este contenedor a proposito: la
            flecha flota en el area de LA LISTA, que termina justo encima de la
            barra de escribir. Antes flotaba en el contenedor de toda la
            pantalla, con bottom: 14, y quedaba detras del boton del microfono.
            Un bottom fijo mas grande tampoco servia: la barra crece con el
            texto (hasta 142) y ademas la empujan otras barras --responder,
            subiendo archivos, menciones, canal cerrado--, asi que el numero
            correcto cambia todo el tiempo. */}
        <View style={styles.areaLista}>
        <FlatList
          ref={listRef}
          // flex:1 explicito: antes la lista era hija directa del contenedor de
          // la pantalla y heredaba el alto que quedaba. Ahora va dentro de
          // areaLista, y sin esto un ScrollView toma el alto de su CONTENIDO y
          // se desborda cuando la conversacion es larga.
          style={{ flex: 1 }}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesContainer}
          onViewableItemsChanged={alVerItems}
          onLayout={(e) => {
            altoVistaRef.current = e.nativeEvent.layout.height;
            marcarVistoSiTodoCabe();
          }}
          onContentSizeChange={(_w, h) => {
            // Se mide y se evalua ANTES de los cortes de abajo: esos sirven
            // para decidir el desplazamiento, y si se salen por ahi la medida
            // nunca llegaria.
            altoContenidoRef.current = h;
            marcarVistoSiTodoCabe();

            if (pegandoArribaRef.current) { pegandoArribaRef.current = false; return; }

            // La primera vez decide DONDE abrir: SIEMPRE donde la persona se
            // quedo leyendo, haya 3 pendientes o 300. Si no quiere leerlos
            // todos, baja con la flecha de la esquina.
            if (!yaColoqueInicialRef.current && messages.length > 0) {
              yaColoqueInicialRef.current = true;
              if (idPrimerNoLeido) {
                const i = messages.findIndex((m) => m.id === idPrimerNoLeido);
                if (i >= 0) {
                  cercaDelFinalRef.current = false;
                  setMostrarBajar(true);
                  listRef.current?.scrollToIndex({ index: i, animated: false, viewPosition: 0.25 });
                  return;
                }
              }
            }
            // Solo se baja sola si la persona ya estaba mirando el final. Si
            // subio a leer algo -o salto desde una cita-, se la deja donde
            // esta. Antes bajaba siempre, y como esto se dispara CADA vez que
            // algo cambia de alto (una foto que carga, por ejemplo), a los
            // pocos segundos la devolvia al ultimo mensaje.
            if (!cercaDelFinalRef.current) return;
            listRef.current?.scrollToEnd({ animated: false });
          }}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            const desdeElFinal = contentSize.height - contentOffset.y - layoutMeasurement.height;
            // 120 px de margen: con menos, el rebote del desplazamiento la
            // marcaba como "arriba" estando practicamente abajo.
            cercaDelFinalRef.current = desdeElFinal < 120;
            // La distancia exacta, no solo el si/no: la usa el aviso de
            // "esta escribiendo" para decidir si vale la pena bajar a mostrarlo.
            distanciaDelFinalRef.current = desdeElFinal;
            // La flecha para bajar: solo cuando hay algo abajo que no se ve.
            // El margen es mas ancho que el de arriba para que no parpadee al
            // rebotar el desplazamiento.
            setMostrarBajar(desdeElFinal > 220);
          }}
          scrollEventThrottle={100}
          onScrollToIndexFailed={(info) => {
            // Pasa cuando la fila destino todavia no se midio (mensajes largos,
            // fotos). Se acerca a ojo y se reintenta; sin esto el salto
            // simplemente no ocurre y parece que el toque no hizo nada.
            listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
            setTimeout(() => {
              listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
            }, 250);
          }}
          ListFooterComponent={(() => {
            // Caduca a los 4 s sin refresco. Quien cierra la app a mitad de una
            // palabra no manda ningun "ya pare", asi que el aviso tiene que
            // apagarse solo o se queda pegado.
            const activos = Object.entries(escribiendo)
              .filter(([, e]) => ahora - e.ts < 4000)
              // El genero se busca aqui y no se guarda en el estado de
              // "escribiendo": ese estado viene de un evento de presencia y
              // solo trae nombre y foto. La lista de participantes ya lo tiene.
              .map(([uid, e]) => ({
                user_id: uid, nombre: e.nombre, foto: e.foto,
                gender: participantsById[uid]?.gender ?? null,
              }));
            if (activos.length === 0) return null;
            return (
              <FilaEscribiendo
                quienes={activos}
                onTocarCara={(uid) => {
                  const p = participantsById[uid];
                  return p ? () => setPerfilVisto(p) : undefined;
                }}
              />
            );
          })()}
          ListHeaderComponent={hayAnteriores ? (
            <TouchableOpacity
              onPress={cargarAnteriores}
              disabled={cargandoAnteriores}
              style={styles.verAnteriores}
            >
              <Text style={styles.verAnterioresTexto}>
                {cargandoAnteriores ? 'Cargando…' : '↑ Ver mensajes anteriores'}
              </Text>
            </TouchableOpacity>
          ) : null}
          renderItem={({ item }) => {
            // Linea de "no leidos": va DELANTE del primer mensaje sin leer, y
            // se queda quieta mientras el chat este abierto (la marca que la
            // decide se congelo al abrir).
            const divisorNoLeidos = item.id === idPrimerNoLeido ? (
              <View style={styles.divisorNoLeidos}>
                <View style={styles.divisorNoLeidosRaya} />
                <Text style={styles.divisorNoLeidosTexto}>
                  {pendientesAlAbrir === 1 ? '1 mensaje sin leer' : `${pendientesAlAbrir} mensajes sin leer`}
                </Text>
                <View style={styles.divisorNoLeidosRaya} />
              </View>
            ) : null;
            const isMine = item.sender_id === user?.id;
            const isSystem = item.sender_id === NOSPI_SYSTEM_USER_ID;
            const sender = participantsById[item.sender_id];
            // Antes del evento no se resuelve el nombre a proposito: en esa ventana
            // no se puede ver quien va. 'Un participante' en vez de 'Alguien',
            // que sonaba a error.
            const senderName = isSystem ? 'Equipo Nospi' : sender?.name || 'Un participante';
            const senderPhoto = isSystem ? null : sender?.profile_photo_url || null;
            // En la comunidad tambien se muestra quien escribe: son 129
            // personas que en su mayoria no se conocen entre si.
            const showSenderInfo = (esGrupal || isChannel) && !isMine;

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
              {divisorNoLeidos}
              <View style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowTheirs]}>
                {showSenderInfo && !isSystem && (
                  <ChatAvatar
                    uri={senderPhoto}
                    name={senderName}
                    gender={sender?.gender}
                    size={26}
                    marginRight={6}
                    alignTop
                    // Abre la ficha, no el visor de fotos. Funciona aunque la
                    // persona no tenga foto: el nombre y la edad son lo que se
                    // quiere ver.
                    onPress={sender ? () => setPerfilVisto(sender) : undefined}
                  />
                )}
                {showSenderInfo && isSystem && (
                  <View style={[styles.messageAvatar, styles.messageAvatarPlaceholder, { alignSelf: 'flex-start', marginTop: 3 }]}>
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
                  style={[
                    styles.bubble,
                    isMine ? styles.bubbleMine : styles.bubbleTheirs,
                    // Un sticker suelto no lleva globo: flota sobre el fondo del
                    // chat, como en WhatsApp. Con pie de foto si lo lleva,
                    // porque entonces hay texto que leer.
                    esSticker(item.media_path) && !item.content?.trim() && styles.bubbleSticker,
                    resaltado === item.id && styles.bubbleResaltada,
                  ]}
                >
                  {/* El nombre abre la ficha igual que la foto: la gente toca
                      lo que esta leyendo, y en un mensaje lo que se lee es el
                      nombre, no el avatar de 26px.
                      Va envuelto en su propio TouchableOpacity y NO como
                      <Text onPress>: este nombre vive DENTRO de la burbuja,
                      que ya es un TouchableOpacity (el del menu al mantener
                      presionado). El onPress de un Text no le gana a ese padre
                      —por eso la foto si abria la ficha y el nombre no: la foto
                      esta afuera de la burbuja—. Un tocable anidado si gana el
                      responder. */}
                  {showSenderInfo && (
                    sender ? (
                      <TouchableOpacity onPress={() => setPerfilVisto(sender)} activeOpacity={0.6}>
                        <Text style={styles.senderName}>{senderName}</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.senderName}>{senderName}</Text>
                    )
                  )}
                  {repliedMsg && (
                    /* Tocar la cita lleva al mensaje original, como en WhatsApp.
                       Va como tocable anidado y no con un onPress en el <View>:
                       la burbuja entera ya es un TouchableOpacity -el del menu
                       al mantener presionado- y un hijo tocable es lo unico que
                       le gana el gesto. Mismo motivo por el que el nombre del
                       remitente esta envuelto aparte. */
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={`Ir al mensaje de ${repliedName}`}
                      activeOpacity={0.7}
                      onPress={() => irAlMensaje(repliedMsg.id)}
                      style={[styles.quoteBox, isMine ? styles.quoteBoxMine : styles.quoteBoxTheirs]}
                    >
                      <Text style={[styles.quoteName, isMine && styles.quoteNameMine]} numberOfLines={1}>{repliedName}</Text>
                      <Text style={[styles.quoteText, isMine && styles.quoteTextMine]} numberOfLines={1}>
                        {messagePreviewText(repliedMsg)}
                      </Text>
                    </TouchableOpacity>
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
                      uri={esEnlaceDirecto(item.media_path) ? (item.media_path as string) : (signedUrls[item.media_path as string] || null)}
                      duration={item.media_duration}
                      mine={isMine}
                    />
                  )}
                  {!!item.media_path && item.media_kind !== 'audio' && (() => {
                    const url = esEnlaceDirecto(item.media_path)
                      ? (item.media_path as string)
                      : signedUrls[item.media_path as string];
                    const box = esSticker(item.media_path)
                      ? { width: STICKER_EN_CHAT, height: STICKER_EN_CHAT }
                      : mediaBoxSize(item.media_width, item.media_height);
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
                          // Si el enlace ya no sirve, se pide uno nuevo en vez
                          // de dejar el hueco en blanco.
                          onError={() => { if (!esEnlaceDirecto(item.media_path)) volverAFirmar(item.media_path as string); }}
                        />
                      </TouchableOpacity>
                    );
                  })()}
                  {item.poll_id ? (
                    <PollCard pollId={item.poll_id} />
                  ) : !!(item.content || '').trim() && (
                    <Text style={[styles.messageText, isMine && styles.messageTextMine]}>
                      {renderMessageContent(item.content, isMine, mentionRe, (raw) =>
                        setPhoneMenu({ raw, from: isMine ? '' : senderName })
                      )}
                    </Text>
                  )}
                  <View style={styles.timeRow}>
                    <Text style={[styles.messageTime, isMine && styles.messageTimeMine]}>
                      {/* Mientras el servidor no confirma se muestra un reloj en
                          lugar de la hora, como en WhatsApp: asi se entiende que
                          ya salio y que aun va en camino. */}
                      {item.pending ? '🕐' : formatBogotaTime(new Date(item.created_at))}
                    </Text>
                    {/* Los checks solo en lo propio: en el mensaje de otro no
                        significan nada para quien lo lee. */}
                    {isMine && !item.pending && (() => {
                      const e = checksDe(item);
                      // Antes eran dos palitos de texto ('✓✓') pegados con
                      // letterSpacing negativo. Nunca quedo bien: el
                      // letterSpacing se comporta distinto en cada plataforma y
                      // se seguian viendo como dos marcas sueltas. 'done-all' ES
                      // el doble check, un solo glifo, igual que en WhatsApp.
                      return (
                        <MaterialIcons
                          name={e === 'enviado' ? 'done' : 'done-all'}
                          size={15}
                          color={e === 'leido' ? '#7FD3FF' : 'rgba(255,255,255,0.65)'}
                        />
                      );
                    })()}
                  </View>
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
                        /* Tocar abre QUIEN reacciono, como WhatsApp. Para poner
                           una reaccion se mantiene presionado el mensaje, que
                           es donde esta el selector de emojis; y para quitar la
                           propia se toca tu fila en esa lista. */
                        onPress={() => { toque(); setReaccionesDe(item.id); }}
                        accessibilityLabel={`Ver quién reaccionó con ${emo}`}
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
                  : esGrupal
                  ? 'Sé el primero en saludar al grupo 👋'
                  : 'Escribe el primer mensaje para romper el hielo 👋'}
              </Text>
            </View>
          }
        />

        {/* Flecha para bajar al ultimo mensaje. El chat abre siempre donde la
            persona se quedo leyendo, asi que esta es la salida para quien no
            quiere leerselo todo. Flota sobre la lista para no robarle alto, y
            solo aparece cuando de verdad hay algo abajo que no se ve. */}
        {mostrarBajar && (
          <TouchableOpacity
            style={styles.bajarAlFinal}
            onPress={() => {
              toque();
              cercaDelFinalRef.current = true;
              setMostrarBajar(false);
              listRef.current?.scrollToEnd({ animated: true });
            }}
            activeOpacity={0.85}
            accessibilityLabel="Ir al último mensaje"
          >
            <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="keyboard-arrow-down" size={22} color="#FFFFFF" />
            {pendientesVivos > 0 && (
              <View style={styles.bajarGlobo}>
                <Text style={styles.bajarGloboTexto}>
                  {pendientesVivos > 99 ? '99+' : pendientesVivos}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}
        </View>

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
                  <ChatAvatar uri={p.profile_photo_url} name={p.name} gender={p.gender} size={28} marginRight={9} />
                  <Text style={styles.mentionName}>{p.name}</Text>
                </TouchableOpacity>
              ))}
              {/* "@todos" NO va en la comunidad: son 129 personas y una
                  mencion asi le suena el telefono a todo el mundo. En una mesa
                  de 6 tiene sentido; en un grupo grande es una molestia que
                  cualquiera puede disparar. */}
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

        {/* Solo aparece si se salto a un tramo viejo desde un resultado de
            busqueda. Sin el no habria como volver al final: la lista ya no
            contiene los mensajes recientes, solo el tramo que se trajo.
            Va AFUERA del condicional de abajo -- adentro quedaria dentro de
            una rama de un ternario, que no admite un bloque suelto. */}
        {enTramoViejo && (
          <TouchableOpacity style={styles.volverAlFinal} onPress={() => { toque(); loadEverything(); }} activeOpacity={0.85}>
            <Text style={styles.volverAlFinalTexto}>↓ Ir a los mensajes recientes</Text>
          </TouchableOpacity>
        )}



        {solicitudParaMi ? (
          // Solicitud que me llego: hay que decidir antes de conversar. El campo
          // de escribir no aparece — la base tampoco dejaria enviar, y mostrar
          // un campo que no funciona es peor que no mostrarlo.
          <Reanimated.View style={[styles.solicitudBar, padAviso]}>
            <Text style={styles.solicitudTitulo}>
              {meta?.other_user_name || 'Esta persona'} quiere escribirte
            </Text>
            <Text style={styles.solicitudSub}>
              No se han cruzado en un evento todavía, así que solo te puede enviar este
              mensaje. Si aceptas, se abre el chat; si lo ignoras, no te vuelve a escribir.
            </Text>
            <View style={styles.solicitudBotones}>
              <TouchableOpacity
                style={styles.solicitudIgnorar}
                disabled={respondiendoSolicitud}
                onPress={() => responderSolicitud(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.solicitudIgnorarText}>Ignorar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.solicitudAceptar}
                disabled={respondiendoSolicitud}
                onPress={() => responderSolicitud(true)}
                activeOpacity={0.85}
              >
                {respondiendoSolicitud
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Text style={styles.solicitudAceptarText}>Aceptar</Text>}
              </TouchableOpacity>
            </View>
          </Reanimated.View>
        ) : solicitudEnviadaPorMi ? (
          // Quien envio tiene que entender tres cosas: que fue una solicitud,
          // que el otro SI va a leer su mensaje (por eso se manda uno solo), y
          // que hasta que no le acepten no puede escribir mas. Sin esto parece
          // que la app se rompio.
          <Reanimated.View style={[styles.channelLockedBar, padAviso]}>
            <Text style={styles.channelLockedText}>
              ✓ Solicitud enviada
            </Text>
            <Text style={styles.solicitudEnviadaSub}>
              {(meta?.other_user_name || 'Esta persona')} va a leer tu mensaje y decide si quieren
              conversar. Hasta que acepte no puedes escribir más.
            </Text>
          </Reanimated.View>
        ) : channelReadOnly ? (
          // Canal en solo lectura: no se escribe, pero las encuestas de arriba
          // si se pueden responder.
          <Reanimated.View style={[styles.channelLockedBar, padAviso]}>
            <Text style={styles.channelLockedText}>
              🔒 Solo el equipo de Nospi publica en este canal
            </Text>
          </Reanimated.View>
        ) : recording ? (
          <Reanimated.View style={[styles.inputBar, padInput]}>
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
          </Reanimated.View>
        ) : (
        <>
        {/* Ni en el grupo del evento ni en la comunidad se resuelve lo que
            necesita al equipo: nadie del grupo puede hacer nada y nosotros no
            estamos mirando el chat en vivo. Por eso los dos apuntan al
            WhatsApp, pero por motivos distintos.

            En la COMUNIDAD no va ninguno. Lo tuvo: explicaba para que era el
            grupo y por donde pedir soporte, para que no se volviera el buzon
            de quejas delante de 233 personas. Se quito porque es el chat mas
            activo que hay y esas cuatro lineas le estaban robando sitio a la
            conversacion, que es lo que la gente va a ver. Si vuelve a llenarse
            de reclamos, el sitio para decirlo es un mensaje fijado -- se lee
            igual y no ocupa alto. */}
        {isGroup && (
          <Text
            style={{
              fontSize: 11, color: '#9CA3AF', textAlign: 'center',
              paddingHorizontal: 22, paddingTop: 6, lineHeight: 15,
            }}
          >
            ¿Algo urgente del evento? Escríbenos por WhatsApp, ahí te respondemos más rápido — es el mismo número por donde te llegó la info del evento, y está en tu perfil.
          </Text>
        )}
        <Reanimated.View style={[styles.inputBar, padInput]}>
          <TouchableOpacity
            style={styles.attachButton}
            onPress={() => { revisarPortapapeles(); setShowAttachMenu(true); }}
            disabled={!!uploading}
            accessibilityLabel="Adjuntar"
          >
            <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          {/* Atajo directo al buscador de GIFs. Va escrito y no con un icono
              porque "GIF" ya ES la palabra que la gente reconoce; dibujarlo
              obligaria a inventar un simbolo que nadie entiende de una.
              Se muestra SIEMPRE: si faltara la llave, el buscador lo dice con
              palabras. Antes esto se escondia solo cuando la llave no se leia,
              y el dia que la lectura fallo el boton desaparecio sin dejar ni un
              error que seguir. */}
          <TouchableOpacity
            style={styles.gifShortcut}
            onPress={abrirGifs}
            disabled={!!uploading}
            accessibilityLabel="Buscar un GIF"
          >
            <Text style={styles.gifShortcutText}>GIF</Text>
          </TouchableOpacity>
          {/* Crece con el texto, hasta seis renglones (ver INPUT_ALTURA_MAX).
              Antes tenia numberOfLines={1} para que en la web el <textarea> no
              naciera con dos renglones de alto; el problema es que en Android
              eso ademas lo dejaba clavado en UN renglon, y en la web el estilo
              le fijaba height: 42, asi que no podia crecer en ninguna parte.
              Ahora la altura de la web la maneja alturaInputWeb y en nativo
              crece solo entre minHeight y maxHeight. */}
          <TextInput
            ref={inputRef}
            style={[styles.textInput, Platform.OS === 'web' ? { height: alturaInputWeb } : null]}
            placeholder="Escribe un mensaje..."
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={draft}
            // Enter hace un salto de linea, no envia.
            //
            // Antes, cualquier texto que terminara en \n disparaba el envio: era
            // la forma de que Enter mandara el mensaje. El costo es que se
            // volvia imposible escribir un mensaje de varios parrafos -- al
            // intentar bajar un renglon, el mensaje salia a medias.
            //
            // Para enviar esta el boton de la derecha. Es como funciona WhatsApp
            // en el celular.
            onChangeText={(text) => {
              updateDraft(text);
              if (text.trim()) avisarQueEscribo();
            }}
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
        </Reanimated.View>
        </>
        )}
      </KeyboardAvoidingView>

      {/* Menu de adjuntar: cuadricula de cuadros grandes en vez de una lista de
          renglones. Un cuadro de 64px con el icono a color se reconoce de un
          vistazo y se acierta con el dedo sin mirar; un renglon de texto toca
          leerlo. */}
      {/* Editar un mensaje propio. Se abre despues de cerrar el menu de
          acciones, nunca al tiempo: en iOS dos <Modal> a la vez no funcionan. */}
      <Modal visible={!!editando} animationType="fade" transparent onRequestClose={() => setEditando(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 22 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#1f2937', marginBottom: 10 }}>
              Editar mensaje
            </Text>
            <TextInput
              value={textoEdicion}
              onChangeText={setTextoEdicion}
              multiline
              autoFocus
              style={{
                backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#E0E0E0',
                borderRadius: 12, padding: 12, fontSize: 15, color: '#1a1a1a',
                minHeight: 90, maxHeight: 200, textAlignVertical: 'top',
              }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <TouchableOpacity onPress={() => setEditando(null)} style={{ paddingVertical: 10, paddingHorizontal: 16 }}>
                <Text style={{ fontSize: 14.5, fontWeight: '700', color: '#6b7280' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={guardarEdicion}
                disabled={guardandoEdicion}
                style={{
                  backgroundColor: '#880E4F', borderRadius: 20,
                  paddingVertical: 10, paddingHorizontal: 20, opacity: guardandoEdicion ? 0.6 : 1,
                }}
              >
                <Text style={{ fontSize: 14.5, fontWeight: '700', color: '#fff' }}>
                  {guardandoEdicion ? '…' : 'Guardar'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Todos los emojis, por categorias. Se abre con el "+" de la barra de
          reacciones. Una cuadricula y no una lista con buscador: el buscador
          necesitaria un nombre en espanol por cada uno de los 1.100 y mas emojis,
          y uno a medias es peor que ninguno -- se escribe "fiesta", no sale
          nada, y parece que el emoji no existe. */}
      <Modal
        visible={!!emojisParaMensaje}
        animationType="slide"
        transparent
        onRequestClose={() => setEmojisParaMensaje(null)}
      >
        <TouchableOpacity style={styles.attachOverlay} activeOpacity={1} onPress={() => setEmojisParaMensaje(null)}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            style={[styles.emojiSheet, { paddingBottom: insets.bottom + 10 }]}
          >
            <View style={styles.sheetGrabber} />

            {/* Pestanas de categoria. Van arriba y con scroll horizontal: son
                ocho y en un telefono angosto no caben todas de una. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.emojiTabs}
              contentContainerStyle={{ gap: 6, paddingHorizontal: 4 }}
            >
              {CATEGORIAS_EMOJI.map((c) => (
                <TouchableOpacity
                  key={c.clave}
                  onPress={() => setCategoriaEmoji(c.clave)}
                  style={[styles.emojiTab, categoriaEmoji === c.clave && styles.emojiTabActiva]}
                  accessibilityLabel={c.nombre}
                >
                  <Text style={{ fontSize: 20 }}>{c.icono}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.emojiCategoriaNombre}>
              {CATEGORIAS_EMOJI.find((c) => c.clave === categoriaEmoji)?.nombre}
            </Text>

            {/* numColumns fijo en 8 y no calculado: con un ancho de pantalla
                cualquiera, 8 columnas dejan el emoji en un tamano que se puede
                tocar sin apuntar. */}
            <FlatList
              key={categoriaEmoji}
              data={CATEGORIAS_EMOJI.find((c) => c.clave === categoriaEmoji)?.emojis || []}
              keyExtractor={(e, i) => `${categoriaEmoji}-${i}-${e}`}
              numColumns={8}
              style={styles.emojiGrid}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: emo }) => (
                <TouchableOpacity
                  style={styles.emojiCelda}
                  onPress={() => {
                    const m = emojisParaMensaje;
                    setEmojisParaMensaje(null);
                    if (m) { toque(); toggleReaction(m.id, emo); }
                  }}
                >
                  <Text style={styles.emojiCeldaTexto}>{emo}</Text>
                </TouchableOpacity>
              )}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showAttachMenu} animationType="fade" transparent onRequestClose={() => setShowAttachMenu(false)}>
        <TouchableOpacity style={styles.attachOverlay} activeOpacity={1} onPress={() => setShowAttachMenu(false)}>
          {/* activeOpacity + onPress vacio: sin esto, tocar dentro de la hoja
              cuenta como tocar el fondo y la cierra. */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            style={[styles.attachSheet, { paddingBottom: insets.bottom + 18 }]}
          >
            <View style={styles.sheetGrabber} />

            <View style={styles.attachGrid}>
              <TouchableOpacity style={styles.attachTile} onPress={takePhoto} activeOpacity={0.7}>
                <View style={[styles.attachTileBox, { backgroundColor: '#FFE9EE' }]}>
                  <IconSymbol ios_icon_name="camera.fill" android_material_icon_name="photo-camera" size={28} color="#F0325B" />
                </View>
                <Text style={styles.attachTileText}>Cámara</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.attachTile} onPress={pickFromLibrary} activeOpacity={0.7}>
                <View style={[styles.attachTileBox, { backgroundColor: '#E5EEFF' }]}>
                  <IconSymbol ios_icon_name="photo.on.rectangle" android_material_icon_name="photo-library" size={28} color="#2563EB" />
                </View>
                <Text style={styles.attachTileText}>Fotos y videos</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.attachTile} onPress={abrirStickers} activeOpacity={0.7}>
                <View style={[styles.attachTileBox, { backgroundColor: '#F3E8FB' }]}>
                  <IconSymbol ios_icon_name="face.smiling" android_material_icon_name="mood" size={28} color="#7C3AED" />
                </View>
                <Text style={styles.attachTileText}>Stickers</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.attachTile} onPress={abrirGifs} activeOpacity={0.7}>
                <View style={[styles.attachTileBox, { backgroundColor: '#DFF7F9' }]}>
                  <Text style={styles.attachTileGif}>GIF</Text>
                </View>
                <Text style={styles.attachTileText}>GIF</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.attachTile} onPress={abrirEncuesta} activeOpacity={0.7}>
                <View style={[styles.attachTileBox, { backgroundColor: '#FFF1DC' }]}>
                  <IconSymbol ios_icon_name="chart.pie.fill" android_material_icon_name="pie-chart" size={28} color="#F59E0B" />
                </View>
                <Text style={styles.attachTileText}>Crear encuesta</Text>
              </TouchableOpacity>

              {/* Solo cuando de verdad hay una imagen copiada: un boton que casi
                  siempre dice "no hay nada" es peor que no tenerlo. */}
              {hayImagenPegable && (
                <TouchableOpacity style={styles.attachTile} onPress={pegarImagen} activeOpacity={0.7}>
                  <View style={[styles.attachTileBox, { backgroundColor: '#EDE7FB' }]}>
                    <IconSymbol ios_icon_name="doc.on.clipboard.fill" android_material_icon_name="content-paste" size={28} color="#7C3AED" />
                  </View>
                  <Text style={styles.attachTileText}>Pegar imagen</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.attachSheetHint}>
              Las fotos y videos van en su calidad original, sin reducir la resolución. Máximo 25 MB por archivo, y se eliminan a los {MEDIA_RETENTION_DAYS} días.
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Selector de stickers. Mas bajo que el de GIFs a proposito: son pocos y
          conocidos, no hay que buscar nada, asi que no tiene por que tapar la
          conversacion. */}
      <Modal visible={showStickers} animationType="slide" transparent onRequestClose={() => setShowStickers(false)}>
        <TouchableOpacity style={styles.attachOverlay} activeOpacity={1} onPress={() => setShowStickers(false)}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            style={[styles.attachSheet, { paddingBottom: insets.bottom + 10, maxHeight: '58%' }]}
          >
            <View style={styles.sheetGrabber} />
            <View style={styles.gifHeader}>
              <Text style={styles.attachSheetTitle}>Stickers</Text>
              <TouchableOpacity onPress={() => setShowStickers(false)} hitSlop={10}>
                <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={22} color={nospiColors.gray400} />
              </TouchableOpacity>
            </View>

            {stickersCargando ? (
              <View style={styles.stickerVacio}>
                <ActivityIndicator color={nospiColors.purpleDark} />
              </View>
            ) : stickers.length === 0 ? (
              <View style={styles.stickerVacio}>
                <Text style={styles.stickerVacioTxt}>
                  Todavía no hay stickers. Se suben desde el panel de administración.
                </Text>
              </View>
            ) : (
              <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} showsVerticalScrollIndicator={false}>
                <View style={styles.stickerGrid}>
                  {stickers.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      style={styles.stickerCelda}
                      onPress={() => enviarSticker(s)}
                      disabled={!!stickerEnviando}
                      activeOpacity={0.6}
                    >
                      <ExpoImage
                        source={{ uri: s.url }}
                        style={styles.stickerImg}
                        contentFit="contain"
                        transition={120}
                        accessibilityLabel={s.etiqueta || 'sticker'}
                      />
                      {stickerEnviando === s.id && (
                        <View style={styles.stickerEnviando}>
                          <ActivityIndicator size="small" color={nospiColors.purpleDark} />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Buscador de GIFs. Ocupa casi toda la pantalla a proposito: una grilla
          de GIFs en una hoja bajita se vuelve imposible de mirar. */}
      <Modal visible={showGifPicker} animationType="slide" transparent onRequestClose={() => setShowGifPicker(false)}>
        <View style={styles.gifOverlay}>
          <View style={[styles.gifSheet, { paddingBottom: insets.bottom + 8 }]}>
            <View style={styles.gifHeader}>
              <Text style={styles.attachSheetTitle}>Enviar un GIF</Text>
              <TouchableOpacity onPress={() => setShowGifPicker(false)} hitSlop={10}>
                <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={22} color={nospiColors.gray400} />
              </TouchableOpacity>
            </View>

            <View style={styles.gifSearchBox}>
              <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={18} color={nospiColors.gray400} />
              <TextInput
                style={styles.gifSearchInput}
                placeholder="Buscar GIFs: jajaja, abrazo, gracias…"
                placeholderTextColor={nospiColors.gray400}
                value={gifQuery}
                onChangeText={setGifQuery}
                autoCorrect={false}
                returnKeyType="search"
              />
              {gifQuery.length > 0 ? (
                <TouchableOpacity onPress={() => setGifQuery('')} hitSlop={10}>
                  <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={18} color={nospiColors.gray400} />
                </TouchableOpacity>
              ) : (
                /* GIPHY exige dar credito visible a cambio de la llave gratis.
                   No lo quites. */
                <Text style={styles.gifBrand}>GIPHY</Text>
              )}
            </View>

            {/* Los recientes solo estorban cuando la persona ya esta buscando
                otra cosa, asi que se esconden al escribir. */}
            {gifRecientes.length > 0 && gifQuery.trim().length === 0 && (
              <View style={styles.gifRecentBlock}>
                <Text style={styles.gifSectionTitle}>Los que más usas</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gifRecentRow}>
                  {gifRecientes.map((g) => (
                    <TouchableOpacity
                      key={`rec-${g.id}`}
                      onPress={() => enviarGif(g)}
                      disabled={!!gifEnviando}
                      activeOpacity={0.7}
                    >
                      <ExpoImage source={{ uri: g.previewUrl }} style={styles.gifRecentThumb} contentFit="cover" transition={0} />
                      {gifEnviando === g.id && (
                        <View style={styles.gifBusy}>
                          <ActivityIndicator color="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {gifLoading && gifResults.length === 0 ? (
              <View style={styles.gifEmpty}>
                <ActivityIndicator color={nospiColors.purpleDark} />
              </View>
            ) : gifError && gifResults.length === 0 ? (
              <View style={styles.gifEmpty}>
                <Text style={styles.gifEmptyText}>{gifError}</Text>
              </View>
            ) : (
              <FlatList
                data={gifResults}
                keyExtractor={(g) => g.id}
                numColumns={2}
                columnWrapperStyle={styles.gifGridRow}
                contentContainerStyle={styles.gifGrid}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.gifCell}
                    onPress={() => enviarGif(item)}
                    disabled={!!gifEnviando}
                    activeOpacity={0.7}
                  >
                    <ExpoImage
                      source={{ uri: item.previewUrl }}
                      style={styles.gifCellImage}
                      contentFit="cover"
                      transition={0}
                      accessibilityLabel={item.description}
                    />
                    {gifEnviando === item.id && (
                      <View style={styles.gifBusy}>
                        <ActivityIndicator color="#FFFFFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                )}
              />
            )}

            <Text style={styles.gifFooter}>Powered by GIPHY</Text>
          </View>
        </View>
      </Modal>

      {/* Crear encuesta. Quien puede escribir en la conversacion puede lanzarla;
          esa regla la decide la base, no esta pantalla. */}
      <Modal visible={showPollForm} animationType="slide" transparent onRequestClose={() => setShowPollForm(false)}>
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.gifOverlay}
        >
          <View style={[styles.pollSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetGrabber} />
            <View style={styles.gifHeader}>
              <Text style={styles.attachSheetTitle}>Crear encuesta</Text>
              <TouchableOpacity onPress={() => setShowPollForm(false)} hitSlop={10}>
                <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={22} color={nospiColors.gray400} />
              </TouchableOpacity>
            </View>

            {/* flexShrink por lo mismo: con varias opciones el formulario se
                sale de la hoja y el boton de crear queda fuera de alcance. */}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ flexGrow: 0, flexShrink: 1 }}
            >
              <Text style={styles.pollLabel}>Pregunta</Text>
              <TextInput
                style={styles.pollInput}
                placeholder="¿A qué hora nos vemos?"
                placeholderTextColor={nospiColors.gray400}
                value={pollPregunta}
                onChangeText={setPollPregunta}
                maxLength={200}
                multiline
              />

              <Text style={styles.pollLabel}>Opciones</Text>
              {pollOpciones.map((op, i) => (
                <View key={`op-${i}`} style={styles.pollOptionRow}>
                  <TextInput
                    style={[styles.pollInput, styles.pollInputOption]}
                    placeholder={`Opción ${i + 1}`}
                    placeholderTextColor={nospiColors.gray400}
                    value={op}
                    onChangeText={(t) => cambiarOpcion(i, t)}
                    maxLength={80}
                  />
                  {/* Con dos opciones no se puede quitar ninguna: una encuesta
                      de una sola opcion no es una encuesta. */}
                  {pollOpciones.length > 2 && (
                    <TouchableOpacity onPress={() => quitarOpcion(i)} hitSlop={8} style={styles.pollRemove}>
                      <IconSymbol ios_icon_name="minus.circle.fill" android_material_icon_name="remove-circle" size={22} color={nospiColors.gray400} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              {pollOpciones.length < 5 && (
                <TouchableOpacity onPress={agregarOpcion} style={styles.pollAdd} activeOpacity={0.7}>
                  <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={18} color={nospiColors.purpleDark} />
                  <Text style={styles.pollAddText}>Agregar opción</Text>
                </TouchableOpacity>
              )}

              {!!pollError && <Text style={styles.pollError}>{pollError}</Text>}
            </ScrollView>

            <TouchableOpacity
              style={[styles.pollSend, !pollListo && styles.pollSendOff]}
              onPress={enviarEncuesta}
              disabled={!pollListo || pollEnviando}
              activeOpacity={0.8}
            >
              {pollEnviando ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.pollSendText}>Publicar encuesta</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={showParticipants}
        animationType="slide"
        transparent
        // El buscador arranca vacio cada vez que se abre la lista: si no, al
        // volver a entrar aparecerian solo los del filtro anterior y daria la
        // impresion de que falta gente.
        onShow={() => setBuscaAsistente('')}
        onRequestClose={() => { setBuscaAsistente(''); setShowParticipants(false); }}
      >
        {/* La hoja esta pegada abajo (modalOverlay va con justifyContent
            'flex-end'), asi que al abrirse el teclado para buscar taparia el
            campo y casi toda la lista. El KeyboardAvoidingView la sube.
            behavior="padding" en LAS DOS plataformas, igual que el de la
            pantalla del chat: dejarlo en undefined para Android es justo el
            error que ya se corrigio alla (con edge-to-edge la ventana no se
            encoge y el teclado tapaba la barra de escribir). */}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Asistentes</Text>
              <TouchableOpacity onPress={() => { setBuscaAsistente(''); setShowParticipants(false); }}>
                <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={24} color={nospiColors.purpleDark} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Toca a alguien para chatear en privado</Text>

            <View style={styles.buscaAsistenteBarra}>
              <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={18} color={nospiColors.gray400} />
              <TextInput
                style={styles.buscaAsistenteInput}
                placeholder="Buscar por nombre"
                placeholderTextColor={nospiColors.gray400}
                value={buscaAsistente}
                onChangeText={setBuscaAsistente}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                // Sin autoFocus a proposito: el teclado tapando media lista
                // estorba a quien solo queria mirar quien esta.
              />
              {!!buscaAsistente && (
                <TouchableOpacity onPress={() => setBuscaAsistente('')} hitSlop={10}>
                  <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={18} color={nospiColors.gray400} />
                </TouchableOpacity>
              )}
            </View>

            {asistentesFiltrados.length === 0 && (
              <Text style={styles.buscaAsistenteVacio}>
                {buscaAsistente.trim()
                  ? `Nadie con «${buscaAsistente.trim()}» en el nombre.`
                  : 'Todavia no hay nadie mas por aqui.'}
              </Text>
            )}

            <ScrollView style={styles.participantsScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {asistentesFiltrados
                .map((p) => (
                  <TouchableOpacity
                    key={p.user_id}
                    style={styles.participantRow}
                    // Antes la fila entera abria un chat privado de una. Ahora
                    // abre la ficha, y el "Escribir por privado" vive adentro:
                    // tocar a una persona muestra quien es, no le manda un
                    // mensaje sin querer.
                    // Se cierra la lista y la ficha se abre despues (ver
                    // perfilPendiente): dos modales a la vez no funcionan en iOS.
                    onPress={() => { setPerfilPendiente(p); setBuscaAsistente(''); setShowParticipants(false); }}
                  >
                    <TouchableOpacity
                      onPress={() => { setPerfilPendiente(p); setBuscaAsistente(''); setShowParticipants(false); }}
                      activeOpacity={0.8}
                    >
                      <AvatarNospi
                        url={p.profile_photo_url}
                        gender={p.gender}
                        nombre={p.name}
                        size={40}
                        style={styles.participantAvatar}
                        transition={0}
                      />
                    </TouchableOpacity>
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
        </KeyboardAvoidingView>
      </Modal>

      {/* Acciones al mantener presionado un mensaje. Sin boton Cancelar: se
          cierra tocando fuera del menu. */}
      {/* Buscar en la conversación. Panel completo y no una barra encima del
          chat: los resultados necesitan sitio para mostrar fecha y contexto,
          y con la barra sola habria que adivinar a que mensaje corresponde. */}
      <Modal visible={buscando} animationType="slide" onRequestClose={() => { setBuscando(false); setConsulta(''); setResultados(null); }}>
        <View style={{ flex: 1, backgroundColor: '#FFFFFF', paddingTop: insets.top }}>
          <View style={styles.buscarBarra}>
            <TouchableOpacity onPress={() => { setBuscando(false); setConsulta(''); setResultados(null); }} hitSlop={10}>
              <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={26} color={nospiColors.purpleDark} />
            </TouchableOpacity>
            <TextInput
              style={styles.buscarInput}
              placeholder="Buscar en esta conversación"
              placeholderTextColor={nospiColors.gray400}
              value={consulta}
              autoFocus
              returnKeyType="search"
              onChangeText={(t) => { setConsulta(t); hacerBusqueda(t); }}
            />
            {!!consulta && (
              <TouchableOpacity onPress={() => { setConsulta(''); setResultados(null); }} hitSlop={10}>
                <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={20} color={nospiColors.gray400} />
              </TouchableOpacity>
            )}
          </View>

          {consulta.trim().length < 2 ? (
            <Text style={styles.buscarAyuda}>Escribe al menos dos letras.</Text>
          ) : buscandoAhora ? (
            <ActivityIndicator color={nospiColors.purpleDark} style={{ marginTop: 28 }} />
          ) : (resultados || []).length === 0 ? (
            <Text style={styles.buscarAyuda}>Sin resultados para «{consulta.trim()}».</Text>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.buscarAyuda}>
                {resultados!.length === 50 ? 'Primeros 50 resultados' : `${resultados!.length} resultado${resultados!.length === 1 ? '' : 's'}`}
              </Text>
              {resultados!.map((r) => {
                const quien = r.sender_id === user?.id
                  ? 'Tú'
                  : r.sender_id === NOSPI_SYSTEM_USER_ID
                  ? 'Equipo Nospi'
                  : participantsById[r.sender_id]?.name || 'Alguien';
                return (
                  <TouchableOpacity key={r.id} style={styles.buscarFila} onPress={() => abrirTramoDe(r)} activeOpacity={0.7}>
                    <View style={styles.buscarFilaTop}>
                      <Text style={styles.buscarQuien} numberOfLines={1}>{quien}</Text>
                      <Text style={styles.buscarFecha}>
                        {new Date(r.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' })}
                        {' · '}
                        {formatBogotaTime(new Date(r.created_at))}
                      </Text>
                    </View>
                    <Text style={styles.buscarTexto} numberOfLines={2}>{r.content}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Quien reacciono a un mensaje. Se abre tocando la reaccion.
          Tocando tu propia fila la quitas, como en WhatsApp: si no, no habria
          forma de deshacerla, porque el toque en el globo ya no alterna. */}
      <Modal visible={!!reaccionesDe} animationType="slide" transparent onRequestClose={() => setReaccionesDe(null)}>
        <TouchableOpacity style={styles.attachOverlay} activeOpacity={1} onPress={() => setReaccionesDe(null)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.attachSheet, { paddingBottom: insets.bottom + 18, maxHeight: '70%' }]}>
            <View style={styles.sheetGrabber} />
            <Text style={styles.attachSheetTitle}>Reacciones</Text>
            {/* flexShrink: sin esto el scroll crece con la lista, se sale de la
                hoja --que tiene maxHeight-- y no hay forma de ver a los
                ultimos que reaccionaron. Mismo caso que la ficha de persona. */}
            <ScrollView style={{ flexGrow: 0, flexShrink: 1 }}>
              {(reactions[reaccionesDe || ''] || []).map((r) => {
                const esMia = r.user_id === user?.id;
                const quien = esMia
                  ? 'Tú'
                  : r.user_id === NOSPI_SYSTEM_USER_ID
                  ? 'Equipo Nospi'
                  : participantsById[r.user_id]?.name || 'Alguien';
                return (
                  <TouchableOpacity
                    key={r.user_id + r.emoji}
                    activeOpacity={0.7}
                    /* La fila propia quita tu reaccion; la de otra persona abre
                       su ficha, que es lo que uno quiere al ver un nombre que
                       no reconoce en un grupo grande. */
                    onPress={() => {
                      if (esMia) {
                        if (!reaccionesDe) return;
                        toggleReaction(reaccionesDe, r.emoji);
                        setReaccionesDe(null);
                        return;
                      }
                      const quienEs = participantsById[r.user_id];
                      if (!quienEs) return;
                      setReaccionesDe(null);
                      setPerfilVisto(quienEs);
                    }}
                    style={styles.reaccionFila}
                  >
                    <ChatAvatar
                      uri={participantsById[r.user_id]?.profile_photo_url || null}
                      name={quien}
                      gender={participantsById[r.user_id]?.gender}
                      size={34}
                      marginRight={10}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reaccionNombre}>{quien}</Text>
                      <Text style={styles.reaccionQuitar}>
                        {esMia ? 'Toca para quitar tu reacción' : 'Toca para ver su perfil'}
                      </Text>
                    </View>
                    <Text style={styles.reaccionEmoji}>{r.emoji}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

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
              (() => {
                if (!actionAnchor) return { bottom: 40, maxHeight: SCREEN_H - 120 };
                // Antes se decidia arriba/abajo comparando solo la posicion de
                // la burbuja contra la mitad de la pantalla, SIN mirar lo alto
                // que es el menu. En un mensaje cerca del borde de abajo el
                // menu se salia y quedaba cortado por la mitad.
                //
                // Ahora se mide cuanto espacio hay de cada lado y se abre hacia
                // donde quepa; ademas se le pone un techo para que, si no cabe
                // entero en ningun lado, se pueda desplazar en vez de cortarse.
                const margen = 8;
                const abajo = SCREEN_H - (actionAnchor.y + actionAnchor.height) - margen;
                const arriba = actionAnchor.y - margen;
                return abajo >= arriba
                  ? { top: actionAnchor.y + actionAnchor.height + margen, maxHeight: Math.max(200, abajo - 16) }
                  : { bottom: SCREEN_H - actionAnchor.y + margen, maxHeight: Math.max(200, arriba - 16) };
              })(),
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
            {/* Abre el catalogo completo. Cierra el menu de acciones primero y
                se guarda el mensaje aparte, porque al cerrarse el menu se
                pierde actionMsg y ya no se sabria a cual reaccionar. */}
            <TouchableOpacity
              style={[styles.reactionBarBtn, styles.reactionBarMas]}
              onPress={() => {
                const m = actionMsg;
                setActionMsg(null);
                setActionAnchor(null);
                if (m) { setCategoriaEmoji(CATEGORIAS_EMOJI[0].clave); setEmojisParaMensaje(m); }
              }}
              accessibilityLabel="Ver todos los emojis"
            >
              <MaterialIcons name="add" size={22} color={nospiColors.purpleDark} />
            </TouchableOpacity>
          </View>
          {/* Se puede desplazar por si el menu completo no cabe ni arriba ni
              abajo de la burbuja. Sin esto, en un mensaje pegado al borde las
              ultimas opciones quedaban cortadas y no habia forma de llegar a
              ellas. */}
          <ScrollView style={styles.actionSheetCompact} showsVerticalScrollIndicator={false} bounces={false}>
            <TouchableOpacity
              style={styles.actionSheetRow}
              onPress={() => { const m = actionMsg; setActionMsg(null); setActionAnchor(null); if (m) setReplyingTo(m); }}
            >
              <Text style={{ fontSize: 20, width: 22, textAlign: 'center' }}>↩︎</Text>
              <Text style={styles.attachOptionText}>Responder</Text>
            </TouchableOpacity>
            {!!(actionMsg?.content || '').trim() && (
              <TouchableOpacity
                style={styles.actionSheetRow}
                onPress={() => { const m = actionMsg; setActionMsg(null); setActionAnchor(null); copyMessageText(m); }}
              >
                <IconSymbol ios_icon_name="doc.on.doc" android_material_icon_name="content-copy" size={22} color={nospiColors.purpleDark} />
                <Text style={styles.attachOptionText}>Copiar</Text>
              </TouchableOpacity>
            )}
            {actionMsg?.sender_id === user?.id && (
              <TouchableOpacity
                style={styles.actionSheetRow}
                onPress={() => { const m = actionMsg; setActionMsg(null); setActionAnchor(null); abrirInfoMensaje(m); }}
              >
                <Text style={{ fontSize: 18, width: 22, textAlign: 'center' }}>👁</Text>
                <Text style={styles.attachOptionText}>Info del mensaje</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.actionSheetRow}
              onPress={() => { const m = actionMsg; setActionMsg(null); setActionAnchor(null); togglePinned(m); }}
            >
              <Text style={{ fontSize: 19, width: 22, textAlign: 'center' }}>📌</Text>
              <Text style={styles.attachOptionText}>
                {actionMsg?.pinned_at ? 'Quitar de fijados' : 'Fijar mensaje'}
              </Text>
            </TouchableOpacity>
            {sePuedeEditar(actionMsg) && !!(actionMsg?.content || '').trim() && (
              <TouchableOpacity
                style={styles.actionSheetRow}
                onPress={() => {
                  const m = actionMsg;
                  setActionMsg(null); setActionAnchor(null);
                  if (m) { setTextoEdicion(m.content || ''); setEditando(m); }
                }}
              >
                <Text style={{ fontSize: 18, width: 22, textAlign: 'center' }}>✏️</Text>
                <Text style={styles.attachOptionText}>Editar</Text>
              </TouchableOpacity>
            )}
            {sePuedeEditar(actionMsg) && (
              <TouchableOpacity
                style={[styles.actionSheetRow, styles.actionSheetRowLast]}
                onPress={() => { const m = actionMsg; setActionMsg(null); setActionAnchor(null); eliminarMiMensaje(m); }}
              >
                <Text style={{ fontSize: 18, width: 22, textAlign: 'center' }}>🗑</Text>
                <Text style={[styles.attachOptionText, { color: '#B91C1C' }]}>Eliminar</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Info del mensaje: lo que en WhatsApp sale al mantener presionado un
          mensaje propio. Aqui importa mas que en WhatsApp porque los grupos son
          de 150 personas y el doble check azul (todos leyeron) practicamente
          nunca se va a prender: lo util es ver cuantos y quienes. */}
      <Modal visible={!!infoMensaje} animationType="fade" transparent onRequestClose={() => setInfoMensaje(null)}>
        <TouchableOpacity style={styles.attachOverlay} activeOpacity={1} onPress={() => setInfoMensaje(null)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[styles.attachSheet, { paddingBottom: insets.bottom + 18, maxHeight: '75%' }]}>
            <View style={styles.sheetGrabber} />
            <Text style={styles.attachSheetTitle}>Info del mensaje</Text>

            {infoCargando ? (
              <ActivityIndicator size="small" color={nospiColors.purpleDark} style={{ marginVertical: 24 }} />
            ) : (() => {
              const ms = infoMensaje?.ms || 0;
              const filas = infoMensaje?.filas || [];
              const enMs = (v: any) => (v ? new Date(v).getTime() : 0);
              const leyeron = filas.filter(f => enMs(f.last_read_at) >= ms);
              const recibieron = filas.filter(f => enMs(f.last_read_at) < ms && enMs(f.last_delivered_at) >= ms);
              const pendientes = filas.filter(f => enMs(f.last_read_at) < ms && enMs(f.last_delivered_at) < ms);
              const cuando = (v: any) => (v ? formatBogotaTime(new Date(v)) : '');

              const seccion = (titulo: string, icono: string, gente: any[], conHora: boolean) => (
                gente.length === 0 ? null : (
                  <View key={titulo} style={{ marginTop: 14 }}>
                    <Text style={styles.infoSeccionTitulo}>{icono} {titulo} · {gente.length}</Text>
                    {gente.map((f: any) => (
                      <View key={f.user_id} style={styles.infoFila}>
                        <Text style={styles.infoNombre} numberOfLines={1}>{f.name || 'Alguien'}</Text>
                        {conHora ? <Text style={styles.infoHora}>{cuando(f.last_read_at)}</Text> : null}
                      </View>
                    ))}
                  </View>
                )
              );

              if (filas.length === 0) {
                return <Text style={styles.infoVacio}>Todavía no hay nadie más en esta conversación.</Text>;
              }

              return (
                <ScrollView style={{ maxHeight: 420 }}>
                  {seccion('Leído por', '✓✓', leyeron, true)}
                  {seccion('Le llegó, sin abrir', '✓✓', recibieron, false)}
                  {seccion('Todavía no le llega', '✓', pendientes, false)}
                  <Text style={styles.attachSheetHint}>
                    "Le llegó" quiere decir que abrió la app después de tu mensaje. "Leído" es que abrió este chat.
                  </Text>
                </ScrollView>
              );
            })()}
          </TouchableOpacity>
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

      {/* Quienes estan conectados ahora. Se abre al tocar "N en línea". */}
      <Modal
        visible={verEnLinea}
        animationType="slide"
        transparent
        onRequestClose={() => setVerEnLinea(false)}
      >
        <TouchableOpacity style={styles.attachOverlay} activeOpacity={1} onPress={() => setVerEnLinea(false)}>
          <TouchableOpacity
            style={[styles.perfilSheet, { paddingBottom: insets.bottom + 18, alignItems: 'stretch' }]}
            activeOpacity={1}
            onPress={() => {}}
          >
            <View style={styles.sheetGrabber} />
            <Text style={styles.enLineaSheetTitulo}>
              🟢 {textoEnLinea(enLinea.length)}
            </Text>

            {/* Lista y no cuadricula: se busca un nombre concreto, y en la
                Comunidad pueden ser varios. Con scroll por si no caben. */}
            <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
              {enLinea.map((uid) => {
                const p = participantsById[uid];
                // Puede no estar en la lista: antes de que el chat abra, la base
                // solo devuelve a quien ya escribio. Igual se muestra, porque
                // esconderlo seria decir que hay menos gente de la que hay.
                const nombre = p?.name || 'Un participante';
                return (
                  <TouchableOpacity
                    key={uid}
                    style={styles.enLineaFila}
                    activeOpacity={p ? 0.7 : 1}
                    disabled={!p}
                    onPress={() => { if (p) { setVerEnLinea(false); setPerfilVisto(p); } }}
                    accessibilityLabel={p ? `Ver el perfil de ${nombre}` : nombre}
                  >
                    <ChatAvatar uri={p?.profile_photo_url ?? null} name={nombre} gender={p?.gender} size={34} marginRight={11} enLinea />
                    <Text style={styles.enLineaNombre} numberOfLines={1}>{nombre}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={styles.perfilBoton} onPress={() => setVerEnLinea(false)} activeOpacity={0.85}>
              <Text style={styles.perfilBotonText}>Cerrar</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Ficha de una persona de la mesa. Se abre al tocar su foto. */}
      {/* Al cerrar la ficha tambien se limpia la foto ampliada: si no, al
          volver a abrir otra ficha aparecia la foto de la anterior encima. */}
      {/* La ficha de perfil es la MISMA de la dinamica y del perfil propio.
          Antes el chat tenia su propia hoja hecha a mano, y por eso aqui solo
          se veia UNA foto por mucho que la persona hubiera subido seis: era
          otro componente que no sabia de la galeria. Lo propio del chat (el
          aviso de solicitud y el boton de escribir por privado) va en el pie. */}
      <FichaPersona
        persona={perfilVisto && {
          ...perfilVisto,
          // El punto verde solo si esa persona dejo ver que esta en linea.
          en_linea: miPrivacidad.enLinea && enLinea.includes(perfilVisto.user_id),
        }}
        onClose={() => setPerfilVisto(null)}
        pie={perfilVisto && perfilVisto.user_id !== user?.id ? (
          <>
            {/* Esto hay que decirlo ANTES de tocar el boton: si no, la persona
                cree que mando un mensaje normal y no entiende por que no la
                dejan seguir escribiendo. */}
            <Text style={styles.perfilAvisoSolicitud}>
              Si no se han cruzado en un evento, tu mensaje le llega como solicitud: la otra
              persona lee ese primer mensaje y decide si se abre el chat.
            </Text>
            <TouchableOpacity
              style={styles.perfilBoton}
              disabled={!!startingChatWith}
              onPress={() => {
                const otro = perfilVisto.user_id;
                // Se cierran los DOS modales antes de tocar la navegacion. La
                // ficha suele abrirse encima del modal de participantes, y en
                // iOS un router.push mientras un Modal se esta cerrando se
                // pierde: la conversacion se creaba en la base pero la pantalla
                // no se abria, y parecia que el boton no hacia nada.
                setPerfilVisto(null);
                setShowParticipants(false);
                setTimeout(() => handleStartDirectChat(otro), 350);
              }}
              activeOpacity={0.85}
            >
              {startingChatWith === perfilVisto.user_id ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.perfilBotonText}>Escribir por privado</Text>
              )}
            </TouchableOpacity>
          </>
        ) : null}
      />

      {/* Menu de un numero de celular tocado en un mensaje. Mismo formato que
          el de video, para que no se sienta una pantalla ajena. */}
      <Modal visible={!!phoneMenu} animationType="fade" transparent onRequestClose={() => setPhoneMenu(null)}>
        <TouchableOpacity style={styles.attachOverlay} activeOpacity={1} onPress={() => setPhoneMenu(null)}>
          <View style={styles.attachSheet}>
            <Text style={styles.attachSheetTitle}>{phoneMenu ? phonePretty(phoneMenu.raw) : ''}</Text>
            <TouchableOpacity
              style={styles.attachOption}
              onPress={() => {
                const p = phoneMenu; setPhoneMenu(null);
                if (p) savePhoneToContacts(p.raw, p.from);
              }}
            >
              <IconSymbol ios_icon_name="person.crop.circle.badge.plus" android_material_icon_name="person-add" size={22} color={nospiColors.purpleDark} />
              {/* Se dice a nombre de quien va a quedar. Si no se dijera, alguien
                  podria guardar el numero del restaurante bajo el nombre de
                  quien lo compartio sin darse cuenta. */}
              <Text style={styles.attachOptionText}>
                {phoneMenu?.from ? `Guardar como ${phoneMenu.from}` : 'Guardar en contactos'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.attachOption}
              onPress={() => {
                const p = phoneMenu; setPhoneMenu(null);
                if (p) Linking.openURL(`https://wa.me/${phoneDigits(p.raw)}`).catch(() => {});
              }}
            >
              <IconSymbol ios_icon_name="message.fill" android_material_icon_name="chat" size={22} color={nospiColors.purpleDark} />
              <Text style={styles.attachOptionText}>Escribir por WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.attachOption}
              onPress={() => {
                const p = phoneMenu; setPhoneMenu(null);
                if (p) Linking.openURL(`tel:+${phoneDigits(p.raw)}`).catch(() => {});
              }}
            >
              <IconSymbol ios_icon_name="phone.fill" android_material_icon_name="call" size={22} color={nospiColors.purpleDark} />
              <Text style={styles.attachOptionText}>Llamar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.attachOption}
              onPress={() => {
                const p = phoneMenu; setPhoneMenu(null);
                if (p) copyPlainText(`+${phoneDigits(p.raw)}`);
              }}
            >
              <IconSymbol ios_icon_name="doc.on.doc" android_material_icon_name="content-copy" size={22} color={nospiColors.purpleDark} />
              <Text style={styles.attachOptionText}>Copiar número</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachCancel} onPress={() => setPhoneMenu(null)}>
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
  // Solo aplica en la web (en el celular queda un objeto vacio y no cambia
  // nada). Los bordes laterales tenues le dan a la columna un limite visible,
  // para que no parezca contenido flotando en el centro de la pantalla.
  chatColumn:
    Platform.OS === 'web'
      ? {
          width: '100%',
          maxWidth: 860,
          alignSelf: 'center',
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
        }
      : {},
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
  // Columna del nombre + "esta escribiendo". flexShrink para que un nombre
  // largo se siga cortando con puntos suspensivos y no empuje los botones.
  headerTitleColumna: { flexShrink: 1 },
  // "en línea" en verde; la última vez en gris, que es un dato de contexto y
  // no una señal de que puedas escribir ahora mismo.
  headerEnLinea: { color: '#6EE7A8', fontSize: 12, fontWeight: '700', marginTop: 1 },
  headerUltimaVez: { color: 'rgba(255,255,255,0.6)', fontSize: 11.5, marginTop: 1 },
  enLineaSheetTitulo: {
    fontSize: 15, fontWeight: '800', color: '#1F2937',
    textAlign: 'center', marginBottom: 12,
  },
  enLineaFila: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 9, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  enLineaNombre: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: '#1F2937' },
  // Borde BLANCO, no del color del fondo.
  //
  // El borde no es decoracion: separa el punto de la foto. Sin el, sobre una
  // foto con verdes o muy clara el punto se come con el fondo -- y es lo unico
  // que dice que esa persona esta conectada.
  //
  // Lo que estaba mal era el color. Al ponerle el del fondo de cada pantalla
  // quedaba un aro vinotinto, que sobre la lista blanca no pegaba con nada. El
  // blanco no es "un color mas": separa de cualquier foto sin pelearse con la
  // marca, y es lo que hacen WhatsApp, Instagram y Messenger.
  puntoEnLinea: {
    position: 'absolute', top: 0, backgroundColor: '#2BD97C',
    borderWidth: 2, borderColor: '#FFFFFF',
  },
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
  // Mismo caso que en la lista de chats: el de videollamada va mas grande.
  headerEventIconAncho: { width: 24, height: 24, tintColor: '#880E4F' },
  headerTitle: { flexShrink: 1, color: '#FFFFFF', fontSize: 17, fontWeight: '700', textAlign: 'left' },
  // paddingBottom mas grande que el de arriba a proposito: lo ultimo de la
  // lista --el ultimo mensaje, o el aviso de "esta escribiendo"-- queda pegado
  // a la barra de escribir con solo 12, y se lee como si estuviera cortado.
  messagesContainer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20, flexGrow: 1 },
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
  // Filas del menu de "Responder / Copiar / Fijar". Antes usaban attachOption,
  // que no trae padding horizontal: su contenedor (la hoja de adjuntar) ya lo
  // pone. Aca el contenedor no lo tiene, y los iconos quedaban pegados al borde.
  actionSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: nospiColors.gray100,
  },
  // La ultima fila no lleva linea: quedaba justo encima de la esquina redondeada.
  actionSheetRowLast: { borderBottomWidth: 0 },
  actionSheetCompact: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 4,
    minWidth: 176,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 8,
  },
  reactionBar: {
    flexDirection: 'row',
    // Sin esto los hijos se ESTIRAN al alto de la fila (alignItems por defecto
    // es 'stretch'). Con los emojis no se nota porque llenan ese alto, pero el
    // "+" es un icono de 22 y quedaba pegado arriba.
    alignItems: 'center',
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
  reactionBarBtn: {
    paddingHorizontal: 7, paddingVertical: 4, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
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

  // ── Stickers ───────────────────────────────────────────────────────────
  stickerGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 6, paddingBottom: 10 },
  // Tres por fila, como WhatsApp: mas chicos no se distinguen y mas grandes
  // obligan a desplazar para ver seis.
  stickerCelda: {
    width: '33.33%', aspectRatio: 1, padding: 7,
    alignItems: 'center', justifyContent: 'center',
  },
  stickerImg: { width: '100%', height: '100%' },
  stickerEnviando: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  stickerVacio: { paddingVertical: 34, paddingHorizontal: 26, alignItems: 'center' },
  stickerVacioTxt: { fontSize: 13, color: nospiColors.gray500, textAlign: 'center', lineHeight: 19 },

  // ── Notas de voz ───────────────────────────────────────────────────────
  // Columna: arriba el boton con la barra (centrados entre si), debajo el
  // tiempo y la velocidad. Antes era una sola fila y la barra quedaba alta.
  voiceRow: { minWidth: 172, paddingVertical: 2 },
  voiceTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  voiceButton: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  // Correccion optica del triangulo de play dentro del circulo.
  voicePlayNudge: { marginLeft: 2 },
  voiceBody: { flex: 1, minWidth: 96 },
  voiceTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.15)', overflow: 'hidden' },
  voiceTrackMine: { backgroundColor: 'rgba(255,255,255,0.3)' },
  voiceFill: { height: 4, backgroundColor: nospiColors.purpleDark },
  voiceFillMine: { backgroundColor: '#FFFFFF' },
  // marginLeft = ancho del boton (34) + el gap de la fila (9): el tiempo
  // arranca justo bajo el inicio de la barra, no bajo el boton.
  //
  // El marginTop NEGATIVO es el que hace que esto se vea como WhatsApp. La fila
  // de arriba mide 34 --lo que mide el boton-- y la barra va en su centro, a
  // los 17. Sin esto el tiempo empezaria en el 35, dejando 15 px muertos debajo
  // de la barra: la burbuja se estira y el 0:07 queda flotando lejos. Con -13
  // el tiempo sube hasta el 21, a dos pixeles de la barra, y se acomoda al lado
  // de la mitad baja del boton. No hay riesgo de que se solapen: el boton
  // termina en el 34 horizontal y este bloque empieza en el 43.
  voiceFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: -13, marginLeft: 43,
  },
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
  // Sticker suelto: sin fondo, sin relleno y sin sombra. Lo unico que se ve es
  // el dibujo con su transparencia.
  bubbleSticker: {
    backgroundColor: 'transparent', paddingHorizontal: 0, paddingVertical: 0,
    shadowOpacity: 0, elevation: 0,
  },
  bubbleTheirs: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 4 },
  // Marca el mensaje al que se acaba de saltar desde una cita. Es un borde y no
  // un cambio de fondo porque el fondo distingue quien escribio -propio vs
  // ajeno- y pisarlo confundiria de quien es el mensaje.
  bubbleResaltada: { borderWidth: 2, borderColor: '#F06292' },
  // ── "Fulano esta escribiendo", al final de la lista ──────────────────────
  // Una sola fila, siempre: con una persona o con ocho mide lo mismo.
  //
  // Las medidas son LAS MISMAS que las de un mensaje de verdad, a proposito.
  // Al principio eran mas pequenas en todo --foto 20 contra 26, relleno 9/12
  // contra 10/14, esquina 13 contra 18, 4 px de separacion contra 10-- y el
  // problema no era que fuera pequena en si: era mas pequena que TODO lo que
  // tenia alrededor, asi que el ojo no la registraba y quedaba pegada a la
  // barra de escribir. Igualada al mensaje se lee como lo que es, "viene un
  // mensaje", y cuesta 14 px de alto.
  filaEscribiendo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 10 },
  pilaCaras: { flexDirection: 'row', alignItems: 'center' },
  // El borde del color del fondo recorta la cara de atras y deja claro que
  // estan encimadas a proposito, no mal alineadas. 15 = (26 de la foto + 2 de
  // borde por lado) / 2.
  caraPila: { borderRadius: 15, borderWidth: 2, borderColor: nospiColors.purpleDark },
  caraPilaEncimada: { marginLeft: -9 },
  caraMas: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  caraMasTexto: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '800' },
  burbujaPuntos: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.16)',
    // 18 y la esquina de abajo recortada: identico a la burbuja de un mensaje.
    borderRadius: 18, borderBottomLeftRadius: 5,
    paddingVertical: 11, paddingHorizontal: 15,
  },
  puntoEscribiendo: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: 'rgba(255,255,255,0.75)' },
  textoEscribiendo: { flexShrink: 1, color: '#F8BBD0', fontSize: 12.5, fontWeight: '600' },
  volverAlFinal: {
    alignSelf: 'center', backgroundColor: nospiColors.purpleDark, borderRadius: 20,
    paddingVertical: 8, paddingHorizontal: 16, marginBottom: 8,
  },
  volverAlFinalTexto: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  // Flecha redonda flotante, abajo a la derecha. Flota (position absolute)
  // para no quitarle alto al chat, que con el teclado abierto ya va justo.
  // Ocupa lo que quede entre la cabecera y la barra de escribir. Es el marco
  // de referencia de la flecha.
  areaLista: { flex: 1 },
  bajarAlFinal: {
    position: 'absolute', right: 14, bottom: 12,
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: nospiColors.purpleDark,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 5,
  },
  // El globito con cuantos quedan sin leer, pegado arriba de la flecha.
  bajarGlobo: {
    position: 'absolute', top: -5, right: -4, minWidth: 19, height: 19,
    borderRadius: 10, backgroundColor: '#E91E63',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  bajarGloboTexto: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  // Linea de "no leidos". Raya a los lados y el texto en medio, como WhatsApp.
  divisorNoLeidos: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 6, marginBottom: 12,
  },
  divisorNoLeidosRaya: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.25)' },
  divisorNoLeidosTexto: {
    color: '#F8BBD0', fontSize: 11.5, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  buscarBarra: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  buscarInput: { flex: 1, fontSize: 16, color: '#1F2937', paddingVertical: 4 },
  buscarAyuda: { color: '#9CA3AF', fontSize: 13, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  buscarFila: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  buscarFilaTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 2 },
  buscarQuien: { flex: 1, fontSize: 14, fontWeight: '700', color: nospiColors.purpleDark },
  buscarFecha: { fontSize: 12, color: '#9CA3AF' },
  buscarTexto: { fontSize: 14, color: '#374151', lineHeight: 19 },
  reaccionFila: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  reaccionNombre: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  reaccionQuitar: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  reaccionEmoji: { fontSize: 22, marginLeft: 10 },
  senderName: { fontSize: 11, fontWeight: '700', color: '#AD1457', marginBottom: 2 },
  messageText: { fontSize: 15, color: '#2a2a2e', lineHeight: 20 },
  messageTextMine: { color: '#FFFFFF' },
  linkText: { color: '#0a58ca', textDecorationLine: 'underline' },
  linkTextMine: { color: '#dce9ff', textDecorationLine: 'underline' },
  messageTime: { fontSize: 10, color: 'rgba(42,42,46,0.45)', alignSelf: 'flex-end' },
  messageTimeMine: { color: 'rgba(255,255,255,0.65)' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginTop: 3 },
  verAnteriores: {
    alignSelf: 'center', marginBottom: 10,
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  verAnterioresTexto: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '700' },
  infoSeccionTitulo: { fontSize: 12.5, fontWeight: '800', color: nospiColors.purpleDark, marginBottom: 6 },
  infoFila: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', gap: 10,
  },
  infoNombre: { fontSize: 14, color: nospiColors.gray800, flex: 1 },
  infoHora: { fontSize: 11.5, color: nospiColors.gray400 },
  infoVacio: { fontSize: 13, color: nospiColors.gray400, textAlign: 'center', paddingVertical: 22 },
  // Los checks ya no son texto sino el icono 'done' / 'done-all' de Material
  // (ver la burbuja). El azul del leido es claro y no el de WhatsApp: sobre el
  // vinotinto de la burbuja propia, el azul oscuro se pierde.
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
    // Hasta seis renglones; de ahi en adelante hace scroll por dentro.
    maxHeight: INPUT_ALTURA_MAX,
    marginRight: 8,
    // 42 = la misma altura del boton "+" y del de enviar, asi los tres quedan
    // alineados cuando hay un solo renglon. La altura de la web va aparte, en
    // el style del propio TextInput, porque el <textarea> no se estira solo.
    minHeight: INPUT_ALTURA_MIN,
    ...Platform.select({
      web: { lineHeight: 20, paddingVertical: 11 },
      default: {},
    }),
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
  buscaAsistenteBarra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: nospiColors.gray100,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  buscaAsistenteInput: { flex: 1, fontSize: 15, color: '#1F2937', padding: 0 },
  buscaAsistenteVacio: {
    fontSize: 14,
    color: nospiColors.gray500,
    textAlign: 'center',
    paddingVertical: 24,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: nospiColors.gray100,
  },
  // Barra de solicitud de mensaje.
  solicitudBar: {
    backgroundColor: '#FFFFFF',
    paddingTop: 16,
    paddingHorizontal: 18,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  solicitudEnviadaSub: {
    fontSize: 12, color: 'rgba(255,255,255,0.75)', textAlign: 'center',
    marginTop: 4, lineHeight: 17, paddingHorizontal: 8,
  },
  // Aviso de la ficha de perfil: explica que el primer mensaje puede ir como
  // solicitud. Va arriba del boton, no debajo, para que se lea antes de tocarlo.
  perfilAvisoSolicitud: {
    fontSize: 12.5,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 14,
    paddingHorizontal: 6,
  },
  solicitudTitulo: { fontSize: 16, fontWeight: '800', color: '#1F2937', textAlign: 'center' },
  solicitudSub: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 4, lineHeight: 18 },
  solicitudBotones: { flexDirection: 'row', gap: 10, marginTop: 14 },
  solicitudIgnorar: {
    flex: 1, borderRadius: 14, paddingVertical: 13, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  solicitudIgnorarText: { color: '#6B7280', fontSize: 15, fontWeight: '700' },
  solicitudAceptar: {
    flex: 1, borderRadius: 14, paddingVertical: 13, alignItems: 'center',
    justifyContent: 'center', backgroundColor: '#AD1457', minHeight: 46,
  },
  solicitudAceptarText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  // Ficha de una persona de la mesa.
  perfilSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 24,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  perfilFoto: { width: 108, height: 108, borderRadius: 54, marginBottom: 14, backgroundColor: '#F3F4F6' },
  perfilFotoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  perfilFotoGrande: { width: '90%', height: '70%' },
  perfilNombre: { fontSize: 21, fontWeight: '800', color: '#1F2937', textAlign: 'center' },
  perfilEdad: { fontSize: 15, color: '#6B7280', marginTop: 2 },
  perfilChips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 16 },
  perfilChip: { backgroundColor: '#FCE7F3', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 12 },
  perfilChipText: { fontSize: 13, color: '#9D174D', fontWeight: '600' },
  perfilBoton: {
    marginTop: 20,
    alignSelf: 'stretch',
    backgroundColor: '#AD1457',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  perfilBotonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

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
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  // El "+" se distingue de los emojis: fondo gris claro y el signo en vinotinto.
  // Circulo de lado fijo para que quede del tamano de un emoji y no mas chico;
  // el paddingHorizontal del boton generico lo dejaria ovalado.
  reactionBarMas: {
    backgroundColor: '#F3F4F6',
    width: 34, height: 34, borderRadius: 17,
    paddingHorizontal: 0, paddingVertical: 0,
  },
  // Alto fijo (70% de la pantalla) y no "lo que ocupe": son mas de mil emojis,
  // asi que sin tope la hoja taparia la pantalla entera.
  emojiSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 12,
    paddingTop: 10,
    height: '70%',
  },
  emojiTabs: { flexGrow: 0, marginTop: 6, marginBottom: 2 },
  emojiTab: {
    paddingVertical: 6, paddingHorizontal: 9, borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  emojiTabActiva: { backgroundColor: '#FCE4EC', borderWidth: 1.5, borderColor: nospiColors.purpleDark },
  emojiCategoriaNombre: {
    fontSize: 11.5, fontWeight: '800', color: '#9CA3AF',
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingHorizontal: 6, paddingTop: 8, paddingBottom: 4,
  },
  emojiGrid: { flex: 1 },
  emojiCelda: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  emojiCeldaTexto: { fontSize: 26 },
  // La barrita gris de arriba: sin ella la hoja no se lee como algo que se
  // arrastra o se cierra, sobre todo en Android.
  sheetGrabber: {
    width: 38, height: 4, borderRadius: 2,
    backgroundColor: nospiColors.gray100,
    alignSelf: 'center', marginBottom: 16,
  },
  // ── Cuadricula del menu de adjuntar ────────────────────────────────────
  // Se reparte en filas de 4 con flexWrap. basis 25% menos el hueco: asi los
  // cuadros quedan del mismo ancho aunque sean 3 o 4, sin numeros magicos.
  attachGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 18 },
  attachTile: { width: '25%', alignItems: 'center', gap: 8 },
  attachTileBox: {
    width: 62, height: 62, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  attachTileGif: { fontSize: 19, fontWeight: '900', color: '#0FB5C9', letterSpacing: 0.5 },
  attachTileText: {
    fontSize: 11.5, fontWeight: '600', color: nospiColors.gray800,
    textAlign: 'center', paddingHorizontal: 2,
  },
  // Atajo "GIF" de la barra de escribir.
  gifShortcut: {
    height: 42, paddingHorizontal: 10, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginRight: 6,
  },
  gifShortcutText: {
    fontSize: 13, fontWeight: '900', color: 'rgba(255,255,255,0.85)', letterSpacing: 0.6,
  },
  attachSheetTitle: { fontSize: 17, fontWeight: '800', color: nospiColors.gray800 },
  attachSheetHint: {
    fontSize: 11.5, color: nospiColors.gray400, lineHeight: 16,
    marginTop: 20, textAlign: 'center',
  },
  attachOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: nospiColors.gray100,
  },
  attachOptionText: { fontSize: 15, fontWeight: '600', color: nospiColors.gray800 },
  // ── Buscador de GIFs ───────────────────────────────────────────────────
  gifOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  gifSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    // Casi toda la pantalla: una grilla de GIFs en una hoja bajita no se deja
    // mirar, toca desplazarse por todo.
    height: '82%',
  },
  gifHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gifSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: nospiColors.gray100,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
    marginTop: 12,
  },
  gifSearchInput: { flex: 1, fontSize: 15, color: nospiColors.gray800 },
  gifRecentBlock: { marginTop: 14 },
  gifSectionTitle: { fontSize: 12, fontWeight: '800', color: nospiColors.gray400, marginBottom: 8 },
  gifRecentRow: { gap: 8, paddingRight: 8 },
  gifRecentThumb: { width: 76, height: 76, borderRadius: 10, backgroundColor: nospiColors.gray100 },
  gifGrid: { paddingTop: 14, paddingBottom: 8 },
  gifGridRow: { gap: 8, marginBottom: 8 },
  gifCell: { flex: 1, aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: nospiColors.gray100 },
  gifCellImage: { width: '100%', height: '100%' },
  // Tapa el GIF mientras se sube, para que quede claro cual se toco y para que
  // un segundo toque no mande el mismo dos veces.
  gifBusy: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  gifEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  gifEmptyText: { fontSize: 14, color: nospiColors.gray400, textAlign: 'center' },
  // GIPHY pide que se diga de donde salen los GIFs. Es condicion de la llave.
  gifFooter: { fontSize: 11, color: nospiColors.gray400, textAlign: 'center', paddingTop: 6 },
  // El credito a GIPHY dentro de la barra de busqueda. Va discreto pero legible:
  // es una condicion de la llave gratis, no un adorno.
  gifBrand: { fontSize: 10, fontWeight: '900', color: nospiColors.gray400, letterSpacing: 0.8 },
  // ── Crear encuesta ─────────────────────────────────────────────────────
  pollSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 20, paddingTop: 10,
    maxHeight: '88%',
  },
  pollLabel: {
    fontSize: 11, fontWeight: '800', color: nospiColors.gray400,
    letterSpacing: 0.4, marginTop: 16, marginBottom: 8,
  },
  pollInput: {
    backgroundColor: nospiColors.gray100, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: nospiColors.gray800,
  },
  pollInputOption: { flex: 1 },
  pollOptionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  pollRemove: { padding: 2 },
  pollAdd: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
  pollAddText: { fontSize: 14, fontWeight: '700', color: nospiColors.purpleDark },
  pollError: { fontSize: 13, color: '#DC2626', marginTop: 10 },
  pollSend: {
    backgroundColor: nospiColors.purpleDark, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', marginTop: 16,
  },
  // Apagado mientras falte la pregunta o una segunda opcion: mas claro que
  // dejarlo encendido y responder con un error al tocarlo.
  pollSendOff: { opacity: 0.4 },
  pollSendText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
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
