import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { useSupabase } from '@/contexts/SupabaseContext';
import { AvatarNospi } from '@/components/AvatarNospi';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { useListaEnVivo, textoEscribiendoEnLista } from '@/lib/useListaEnVivo';
import { useMiPrivacidad } from '@/lib/useMiPrivacidad';
import { useRouter } from 'expo-router';
import { yaLeidoLocalmente } from '@/utils/leidoReciente';
import { SkeletonBox } from '@/components/SkeletonBox';
import { getCached, setCached } from '@/utils/cache';
import { Platform } from 'react-native';
import { enableWebPush, isWebPushSupported, needsHomeScreenOnIOS, webPushPermission } from '@/lib/webPush';
import * as Notifications from 'expo-notifications';
import { Linking } from 'react-native';
import { registerPushToken } from '@/hooks/usePushNotifications';

import { useIdioma } from '@/contexts/IdiomaContext';
import { nombreEventoIdioma } from '@/utils/nombreEvento';
interface ConversationRow {
  conversation_id: string;
  conv_type: 'event_group' | 'direct' | 'channel_global' | 'channel_event' | 'community';
  event_id: string | null;
  event_name: string | null;
  event_type: string | null;
  event_date: string | null;
  event_status: string | null;
  other_user_id: string | null;
  other_user_name: string | null;
  replies_open?: boolean | null;
  channel_title?: string | null;
  other_user_photo: string | null;
  /** Para pintar el personaje de Nospi cuando la otra persona no tiene foto. */
  other_user_gender?: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  // Solo para type='direct'. 'pendiente' = solicitud sin responder.
  // 'bloqueada' solo aparece en la comunidad, para quien aun no ha asistido.
  estado?: 'pendiente' | 'aceptada' | 'ignorada' | 'bloqueada' | 'bloqueada_sin_asistencia' | null;
  solicitada_por?: string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `${diffMin} min`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs} h`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays} d`;
  return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

function eventEmoji(eventType: string | null): string {
  return eventType === 'bar' ? '🍸' : eventType === 'caminata' ? '🚶' : eventType === 'cafe' ? '☕' : eventType === 'bolos' ? '🎳' : eventType === 'virtual' ? '🎥' : '🍽️';
}

// Mismos íconos PNG que usa la pestaña de Eventos. El require debe ser estático
// (literal) para que Metro lo empaquete; por eso se resuelve con un switch.
function eventIconSource(eventType: string | null) {
  switch (eventType) {
    case 'caminata': return require('@/assets/images/icon-caminata.png');
    case 'bar': return require('@/assets/images/icon-bar.png');
    case 'cafe': return require('@/assets/images/icon-cafe.png');
    case 'bolos': return require('@/assets/images/icon-bolos.png');
    case 'virtual': return require('@/assets/images/icon-videollamada.png');
    default: return require('@/assets/images/icon-restaurante.png');
  }
}

// El chat grupal de un evento se habilita 30 min antes de que empiece y
// queda abierto durante el evento. Antes de esa ventana mostramos la fila
// bloqueada con la hora en que se habilita (hora Bogota, sin depender del
// soporte de timeZone de Intl en el motor JS del dispositivo).
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

function getChatLockInfo(item: ConversationRow): { locked: boolean; unlockLabel: string | null } {
  // La comunidad se le muestra bloqueada a quien todavia no ha asistido: es
  // para que vea que existe, no para que entre. La llave es venir a un evento,
  // no comprarlo — se puede pagar y no aparecer, y en ese caso sigue cerrada.
  // Y la puerta se abre cuando el evento se cierra, no durante: nadie esta
  // sentado en la mesa con el grupo grande encima.
  if (item.conv_type === 'community' && item.estado === 'bloqueada') {
    return { locked: true, unlockLabel: null };
  }
  // Quien pago pero no confirmo asistencia el dia del evento no entra al chat
  // ni ve quienes fueron. El servidor ya no le manda nada; aca solo se explica.
  if (item.estado === 'bloqueada_sin_asistencia') {
    return { locked: true, unlockLabel: null };
  }
  if (item.conv_type !== 'event_group' || !item.event_date) return { locked: false, unlockLabel: null };
  const unlockAt = new Date(new Date(item.event_date).getTime() - CHAT_UNLOCK_MINUTES_BEFORE * 60 * 1000);
  if (Date.now() >= unlockAt.getTime()) return { locked: false, unlockLabel: null };
  return { locked: true, unlockLabel: formatBogotaTime(unlockAt) };
}

type ChatFilter = 'grupos' | 'directos' | 'canales';

export default function ChatsScreen() {
  const { t, idioma } = useIdioma();
  const { user } = useSupabase();
  const router = useRouter();
  const [conversationsRaw, setConversations] = useState<ConversationRow[]>([]);
  // La fila del servidor puede venir atrasada unos segundos respecto a lo que
  // esta misma app ya marco como leido: al salir de un chat, la escritura de la
  // marca y la recarga de esta lista salen a la vez, y suele llegar primero la
  // lista con el last_read_at viejo. Eso era lo que hacia reaparecer el globo
  // de sin leer despues de leer y salir. Ver utils/leidoReciente.
  const conversations = useMemo(
    () => conversationsRaw.map((c) =>
      (c.unread_count || 0) > 0 && yaLeidoLocalmente(c.conversation_id, c.last_message_at)
        ? { ...c, unread_count: 0 }
        : c,
    ),
    [conversationsRaw],
  );
  // Mis interruptores de privacidad: si tengo "en linea" apagado no me anuncio
  // y tampoco veo el punto verde de los demas.
  const { enLineaParaAnunciar } = useMiPrivacidad(user?.id);

  // El candado de cada chat se calcula al dibujar la lista. Si la pantalla ya
  // estaba abierta cuando llega la hora de apertura, nadie la vuelve a dibujar
  // y el chat sigue viendose bloqueado aunque el servidor ya lo abrio.
  //
  // Paso de verdad: la videollamada abria a las 20:30:00 y el aviso salio a
  // las 20:30:08 -- correcto-- pero al tocarlo el chat seguia con candado,
  // porque la lista se habia dibujado minutos antes.
  //
  // Se programa un repintado para el instante exacto en que se abre el
  // proximo, y solo ese: nada de revisar cada segundo.
  const [, forzarRepintado] = useState(0);
  useEffect(() => {
    const ahora = Date.now();
    // De todos los chats todavia cerrados, cual se abre primero.
    const proxima = conversations
      .filter((c) => c.conv_type === 'event_group' && c.event_date)
      .map((c) => new Date(c.event_date!).getTime() - CHAT_UNLOCK_MINUTES_BEFORE * 60 * 1000)
      .filter((t) => t > ahora)
      .sort((a, b) => a - b)[0];
    if (!proxima) return;
    // El +1000 es para caer justo despues del momento exacto y no un
    // milisegundo antes, que dejaria el candado puesto otra vez.
    const t = setTimeout(() => forzarRepintado((n) => n + 1), proxima - ahora + 1000);
    return () => clearTimeout(t);
  }, [conversations]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<ChatFilter>('grupos');
  // Explicador de como se abren los chats 1-1. Arranca cerrado para no comerse
  // la pantalla, pero la pregunta queda siempre visible: la duda de "¿por que a
  // esta persona le puedo escribir y a esta no?" es la mas repetida, y hasta
  // ahora la regla solo existia en la base de datos.
  const [comoSeAbren, setComoSeAbren] = useState(false);

  // Aviso para activar las notificaciones en la web. Solo aparece si el
  // navegador las soporta y la persona todavia no ha decidido. En el telefono
  // no se muestra: alli el permiso lo pide la app al entrar.
  const [webPushState, setWebPushState] = useState<string>('granted');
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    setWebPushState(isWebPushSupported() ? webPushPermission() : (needsHomeScreenOnIOS() ? 'ios-home-screen' : 'unsupported'));
  }, []);

  // Lo mismo pero en el celular. La app pide el permiso una sola vez al entrar
  // y si la persona dice que no, nunca vuelve a preguntar: queda sin recibir
  // NADA (ni recordatorios de evento ni mensajes) sin enterarse. Este aviso lo
  // hace visible y reversible. Si ya lo negó, iOS y Android no dejan volver a
  // preguntar desde la app, así que se le manda a los ajustes del sistema.
  const [nativePushState, setNativePushState] = useState<'granted' | 'ask' | 'blocked'>('granted');

  const revisarPushNativo = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      const perm = await Notifications.getPermissionsAsync();
      if (perm.granted) {
        setNativePushState('granted');
        if (user?.id) registerPushToken(user.id);
        return;
      }
      setNativePushState(perm.canAskAgain ? 'ask' : 'blocked');
    } catch {
      setNativePushState('granted'); // ante la duda, no molestar con el aviso
    }
  }, [user?.id]);

  useEffect(() => { revisarPushNativo(); }, [revisarPushNativo]);

  const activarNotificacionesNativas = async () => {
    if (nativePushState === 'blocked') {
      Alert.alert(
        t('chats.activaNotif'),
        t('chats.activaNotifMsg'),
        [
          { text: t('chats.ahoraNo'), style: 'cancel' },
          { text: t('chats.irAjustes'), onPress: () => Linking.openSettings().catch(() => {}) },
        ]
      );
      return;
    }
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        setNativePushState('granted');
        if (user?.id) await registerPushToken(user.id);
      } else {
        setNativePushState('blocked');
      }
    } catch {
      setNativePushState('blocked');
    }
  };

  const activarNotificaciones = async () => {
    if (!user?.id) return;
    const res = await enableWebPush(user.id);
    if (res.ok) { setWebPushState('granted'); return; }
    if (res.reason === 'denied') {
      setWebPushState('denied');
      window.alert(t('chats.bloqueasteNotif'));
      return;
    }
    if (res.reason === 'ios-home-screen') { setWebPushState('ios-home-screen'); return; }
    window.alert(t('chats.noActivoNotif'));
  };
  const loadedOnceRef = useRef(false);
  const CHATS_CACHE_KEY = `chats_${user?.id ?? 'anon'}`;

  // Pintar AL INSTANTE la lista de la ultima vez (cache persistida) mientras
  // la carga fresca corre por detras. Sin esto, cada entrada a la pestana
  // esperaba hasta 2 llamadas de red (validar sesion + traer chats) mostrando
  // solo el "cargando", que con la senal de un evento se hacia largo.
  useEffect(() => {
    let cancelled = false;
    if (!user?.id || loadedOnceRef.current) return;
    (async () => {
      const cached = await getCached<ConversationRow[]>(CHATS_CACHE_KEY);
      if (cancelled || loadedOnceRef.current) return;
      if (cached && cached.length > 0) {
        setConversations(cached);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, CHATS_CACHE_KEY]);

  const loadConversations = useCallback(async (isRefresh = false) => {
    if (!user?.id) return;
    if (isRefresh) setRefreshing(true);
    else if (!loadedOnceRef.current) setLoading(true);

    // FIX (chat vacio en pleno evento): si la sesion guardada esta vencida o el
    // token no se adjunta bien (wifi saturado del evento), el RPC
    // get_my_conversations NO falla — devuelve vacio porque RLS filtra todo al
    // no resolver auth.uid(), y la lista quedaba falsamente "sin chats" aunque el
    // usuario si es participante del grupo del evento. Antes de consultar
    // aseguramos una sesion valida, refrescandola si esta por vencerse o no esta
    // cargada. Si el refresh falla por mala senal, seguimos: el resguardo de
    // abajo conserva la lista previa en vez de vaciarla.
    try {
      const { data: sess } = await supabase.auth.getSession();
      const expMs = sess?.session?.expires_at ? sess.session.expires_at * 1000 : 0;
      const aboutToExpire = expMs > 0 && expMs - Date.now() < 60 * 1000;
      if (!sess?.session || aboutToExpire) {
        await supabase.auth.refreshSession();
      }
    } catch (_e) {
      /* seguimos; el resguardo de abajo evita vaciar la lista por un parpadeo */
    }

    const { data, error } = await supabase.rpc('get_my_conversations_v2');

    if (error) {
      console.error('ChatsScreen: error loading conversations', error);
    } else {
      const rows = (data as ConversationRow[]) || [];
      // No reemplazar una lista ya cargada por una vacia que puede venir de un
      // parpadeo (token/RLS/replica). Solo aplica en auto-cargas: si ya habiamos
      // cargado antes y ahora llega vacio, conservamos lo previo. En un refresh
      // manual (pull-to-refresh) si confiamos en el servidor y aplicamos lo que
      // venga, para que el usuario pueda limpiar la lista a proposito.
      setConversations(prev => {
        if (!isRefresh && rows.length === 0 && loadedOnceRef.current && prev.length > 0) {
          return prev;
        }
        return rows;
      });
      loadedOnceRef.current = true;
      // Guardar para que la proxima entrada a la pestana pinte de una.
      if (rows.length > 0 || isRefresh) setCached(CHATS_CACHE_KEY, rows);
    }

    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadConversations();
    }, [loadConversations])
  );

  // Escucha mensajes nuevos en cualquiera de mis conversaciones (RLS filtra
  // para que solo lleguen inserts de conversaciones donde soy participante)
  // y refresca la lista para actualizar último mensaje / no leídos.
  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;

      const channelName = `my_chats_${user.id}`;
      const stale = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);
      if (stale) supabase.removeChannel(stale);

      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages' },
          () => loadConversations()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }, [user, loadConversations])
  );

  const renderSkeleton = () => (
    <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
      {[1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.skeletonRow}>
          <SkeletonBox width={52} height={52} borderRadius={26} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <SkeletonBox width="60%" height={16} style={{ marginBottom: 8 }} />
            <SkeletonBox width="85%" height={13} />
          </View>
        </View>
      ))}
    </View>
  );

  const openConversation = (item: ConversationRow) => {
    router.push(`/chat/${item.conversation_id}` as any);
  };

  // La comunidad va FIJADA arriba de los grupos. No es capricho: nace con cero
  // mensajes, y el orden de la lista manda al fondo lo que no tiene actividad
  // (fue el bug de la "Mesa Nospi Azul", que quedo en la posicion 15 de 15 y
  // parecia no existir). Ademas es el unico chat permanente: los de eventos van
  // y vienen, este se queda, y algo que siempre esta en el mismo lugar es lo
  // que crea el habito.
  const comunidad = conversations.filter((c) => c.conv_type === 'community');
  const groupConversations = [
    ...comunidad,
    ...conversations.filter((c) => c.conv_type === 'event_group'),
  ];

  // Solicitudes: chats pendientes que me enviaron A MI. Los que YO envie no son
  // solicitudes que deba responder, asi que se quedan entre los directos
  // esperando respuesta.
  const solicitudes = conversations.filter(
    (c) => c.conv_type === 'direct' && c.estado === 'pendiente' && c.solicitada_por !== user?.id
  );
  const directConversations = conversations.filter(
    (c) => c.conv_type === 'direct' && !(c.estado === 'pendiente' && c.solicitada_por !== user?.id)
  );
  // Canales: difusion del equipo de Nospi (global y por evento).
  const channelConversations = conversations.filter(
    (c) => c.conv_type === 'channel_global' || c.conv_type === 'channel_event'
  );

  // Con canales son tres pestanas y hay que apretar los textos.
  const hayCanales = channelConversations.length > 0;
  const channelUnread = channelConversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);
  const groupUnread = groupConversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);
  // El numero de la pestana cuenta SOLO mensajes sin leer, igual que en Grupos
  // y Canales.
  //
  // Antes sumaba ademas cada solicitud sin responder, con la idea de que exige
  // una decision y no habria que dejarla pasar. En la practica quedaba un "5"
  // en la pestana sin un solo globo en la lista: el numero apuntaba a algo que
  // no se veia por ninguna parte, y lo primero que uno piensa es que la app
  // esta contando mal. Un numero rojo sobre una pestana significa "hay algo
  // nuevo aqui"; usarlo para "hay algo sin decidir" ensena a desconfiar de el,
  // y despues se ignora tambien cuando si hay un mensaje nuevo.
  //
  // Las solicitudes no se pierden por esto: una recien llegada trae su mensaje
  // sin leer, asi que suma al numero y ademas aparece de primera en la lista
  // por ser la mas reciente. Lo unico que deja de insistir es una que ya se
  // abrio y se leyo sin responder, que es justo el caso en el que el numero
  // molestaba. Y cada una sigue marcada con su etiqueta de Solicitud en la
  // fila.
  const directUnread =
    directConversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);

  // El numero del icono de la app, igualado a lo que de verdad hay sin leer.
  //
  // En Android ese numero no lo pone nadie desde aqui: lo arma el sistema
  // contando las notificaciones que SIGUEN en la bandeja. Como leer dentro de
  // la app no las borra, quedaba un "5" en el icono sin un solo mensaje sin
  // leer. Ponerlo a mano con el total real lo deja diciendo la verdad, y
  // cuando llega a cero se apaga.
  //
  // Es seguro llamarlo: expo-notifications ya viene en el binario --esta
  // pantalla lo importa arriba para los push-- asi que no es como lo que paso
  // con el portapapeles, que era un modulo nativo que las apps instaladas no
  // traian.
  const totalSinLeer = channelUnread + groupUnread + directUnread;
  useEffect(() => {
    Notifications.setBadgeCountAsync(totalSinLeer).catch(() => {});
    // Si ya no queda nada sin leer, tampoco tienen por que quedar
    // notificaciones viejas en la bandeja sosteniendo el numero.
    if (totalSinLeer === 0) Notifications.dismissAllNotificationsAsync().catch(() => {});
  }, [totalSinLeer]);
  // Todo lo privado en un solo orden: lo mas reciente arriba.
  //
  // Antes las solicitudes sin responder iban clavadas encima de todo. La idea
  // era no enterrar lo que exige una decision, pero con varias solicitudes
  // viejas acumuladas el efecto terminaba siendo el contrario: una
  // conversacion activa, con el mensaje mas nuevo de toda la lista, aparecia
  // debajo de siete solicitudes de dias atras. Lo que uno busca al abrir la
  // pestana es quien le escribio hace un rato.
  //
  // No se pierden de vista: una solicitud que acaba de llegar es, por
  // definicion, de las mas recientes, y el contador de la pestana las sigue
  // sumando aparte aunque su mensaje ya se haya visto.
  const porRecencia = (a: ConversationRow, b: ConversationRow) => {
    const ta = a.last_message_at ? Date.parse(a.last_message_at) : 0;
    const tb = b.last_message_at ? Date.parse(b.last_message_at) : 0;
    return tb - ta;
  };
  const visibleConversations =
    filter === 'grupos' ? groupConversations
    : filter === 'canales' ? channelConversations
    : [...solicitudes, ...directConversations].sort(porRecencia);

  // Quien esta en linea y quien escribe, SOLO de las conversaciones que se
  // estan viendo. Las de las otras pestañas no se escuchan: no se ven, y cada
  // una cuesta un canal.
  //
  // Se dejan fuera las bloqueadas: no se puede entrar, asi que saber quien
  // esta ahi no aporta y seria un canal gastado.
  const idsEnVivo = visibleConversations
    .filter((c) => !getChatLockInfo(c).locked)
    .map((c) => c.conversation_id);
  const { escribiendoEn, enLineaEn } = useListaEnVivo(
    idsEnVivo, user?.id, enLineaParaAnunciar,
  );

  return (
    <LinearGradient
      colors={['#1a0010', '#880E4F', '#AD1457']}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <View style={styles.container}>
        <Text style={styles.title}>Chat</Text>

        <View style={styles.filterRow}>
          {/* Con el tercer filtro, t('chats.mensajesGrupo') no cabe en un tercio de
              la pantalla y el texto se sale del recuadro. Con dos pestanas si
              cabe, asi que se conservan los nombres largos. */}
          <TouchableOpacity
            style={[styles.filterTab, filter === 'grupos' && styles.filterTabActive]}
            activeOpacity={0.8}
            onPress={() => setFilter('grupos')}
          >
            <Text
              numberOfLines={1}
              style={[styles.filterTabText, filter === 'grupos' && styles.filterTabTextActive]}
            >
              {hayCanales ? t('chats.grupos') : t('chats.mensajesGrupo')}
            </Text>
            {groupUnread > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{groupUnread > 9 ? '9+' : groupUnread}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterTab, filter === 'directos' && styles.filterTabActive]}
            activeOpacity={0.8}
            onPress={() => setFilter('directos')}
          >
            <Text
              numberOfLines={1}
              style={[styles.filterTabText, filter === 'directos' && styles.filterTabTextActive]}
            >
              {hayCanales ? t('chats.directos') : t('chats.mensajes11')}
            </Text>
            {directUnread > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{directUnread > 9 ? '9+' : directUnread}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Canales: avisos del equipo de Nospi. Solo se muestra el filtro si
              la persona tiene al menos un canal con mensajes. */}
          {hayCanales && (
            <TouchableOpacity
              style={[styles.filterTab, filter === 'canales' && styles.filterTabActive]}
              activeOpacity={0.8}
              onPress={() => setFilter('canales')}
            >
              <Text
                numberOfLines={1}
                style={[styles.filterTabText, filter === 'canales' && styles.filterTabTextActive]}
              >
                {t('chats.canales')}
              </Text>
              {channelUnread > 0 && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{channelUnread > 9 ? '9+' : channelUnread}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>

        {Platform.OS !== 'web' && nativePushState !== 'granted' && (
          <TouchableOpacity style={styles.pushBanner} activeOpacity={0.8} onPress={activarNotificacionesNativas}>
            <Text style={styles.pushBannerEmoji}>🔔</Text>
            <Text style={styles.pushBannerText}>
              {nativePushState === 'ask'
                ? t('chats.bannerPlanes')
                : t('chats.bannerApagadas')}
            </Text>
          </TouchableOpacity>
        )}

        {Platform.OS === 'web' && (webPushState === 'default' || webPushState === 'ios-home-screen') && (
          <TouchableOpacity
            style={styles.pushBanner}
            activeOpacity={webPushState === 'default' ? 0.8 : 1}
            onPress={webPushState === 'default' ? activarNotificaciones : undefined}
          >
            <Text style={styles.pushBannerEmoji}>🔔</Text>
            <Text style={styles.pushBannerText}>
              {webPushState === 'default'
                ? t('chats.bannerEscriban')
                : t('chats.bannerPantallaInicio')}
            </Text>
          </TouchableOpacity>
        )}

        {filter === 'directos' && !loading && (
          <View style={styles.comoBloque}>
            <TouchableOpacity
              style={styles.comoCabecera}
              activeOpacity={0.8}
              onPress={() => setComoSeAbren((v) => !v)}
            >
              <Text style={styles.comoPregunta}>{t('chats.comoSeAbren')}</Text>
              <Text style={styles.comoFlecha}>{comoSeAbren ? '▴' : '▾'}</Text>
            </TouchableOpacity>
            {comoSeAbren && (
              <View style={styles.comoCuerpo}>
                <Text style={styles.comoLinea}>
                  <Text style={styles.comoBullet}>💞  </Text>
                  Hicieron match al final de un evento.
                </Text>
                <Text style={styles.comoLinea}>
                  <Text style={styles.comoBullet}>🍽️  </Text>
                  Estuvieron en el mismo evento: ahí se pueden escribir directo.
                </Text>
                <Text style={styles.comoLinea}>
                  <Text style={styles.comoBullet}>✉️  </Text>
                  Le enviaste una solicitud y te aceptó.
                </Text>
                <Text style={styles.comoCierre}>
                  Si no se han cruzado, tu primer mensaje le llega como solicitud: esa persona lo
                  lee y decide si se abre el chat. Puedes tener hasta 10 solicitudes sin responder
                  al mismo tiempo.
                </Text>
              </View>
            )}
          </View>
        )}

        {loading ? (
          renderSkeleton()
        ) : visibleConversations.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>💬</Text>
            <Text style={styles.emptyTitle}>
              {filter === 'grupos' ? 'Aún no tienes chats de grupo'
                : filter === 'canales' ? 'Aún no hay avisos de Nospi'
                : 'Aún no tienes chats 1-1'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {filter === 'grupos'
                ? 'Cuando confirmes tu cita a un evento, se abrirá automáticamente el chat grupal con los demás asistentes.'
                : filter === 'canales'
                ? 'Cuando el equipo de Nospi publique algo, lo verás aquí.'
                : 'Aquí van tus chats con una sola persona: los matches, la gente de tus eventos y las solicitudes que te acepten.'}
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.contentContainer}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadConversations(true)}
                tintColor="#FFFFFF"
              />
            }
          >
            {visibleConversations.map((item) => {
              const isGroup = item.conv_type === 'event_group';
              const isComunidad = item.conv_type === 'community';
              const isChannel = item.conv_type === 'channel_global' || item.conv_type === 'channel_event';
              // Solicitud que me llego a MI y no he respondido.
              const esSolicitud = item.conv_type === 'direct'
                && item.estado === 'pendiente'
                && item.solicitada_por !== user?.id;
              // Solicitud que YO envie y todavia no me responden. Sin esta
              // marca, quien la mando ve un chat normal y no entiende por que
              // no puede seguir escribiendo.
              const solicitudEnviada = item.conv_type === 'direct'
                && item.estado === 'pendiente'
                && item.solicitada_por === user?.id;
              // El titulo guardado en la base ("Avisos · Cena (28 de octubre)") esta en
              // espanol y lo usa el equipo en el admin. Para mostrarlo se rearma con el
              // tipo y la fecha del evento, que el RPC ya devuelve, en vez de traducir
              // el texto guardado.
              const nombreDelEvento = nombreEventoIdioma(
                { type: item.event_type, date: item.event_date, name: item.event_name },
                idioma, t,
              );
              const title = isComunidad
                ? (idioma === 'en' ? t('chats.comunidadNospi') : (item.channel_title || t('chats.comunidadNospi')))
                : isChannel
                ? (item.conv_type === 'channel_event' && nombreDelEvento
                    ? t('chats.avisosDe', { evento: nombreDelEvento })
                    : (idioma === 'en' ? t('chats.canalNospi') : (item.channel_title || t('chats.canalNospi'))))
                : isGroup ? (nombreDelEvento || t('chats.chatDelEvento')) : (item.other_user_name || t('chats.usuario'));
              const photoUrl = (isGroup || isChannel || isComunidad) ? null : item.other_user_photo;
              const hasUnread = item.unread_count > 0;
              const { locked, unlockLabel } = getChatLockInfo(item);
              // Quien escribe en esta conversacion, ya filtrado por caducidad.
              const quienesEscriben = locked ? [] : escribiendoEn(item.conversation_id);
              const textoEscribiendo = textoEscribiendoEnLista(
                quienesEscriben, isGroup || isComunidad || isChannel,
              );
              const hayEnLinea = !locked && enLineaEn(item.conversation_id) > 0;
              const esComunidadBloqueada = isComunidad && item.estado === 'bloqueada';
              const esSinAsistencia = item.estado === 'bloqueada_sin_asistencia';

              return (
                <TouchableOpacity
                  key={item.conversation_id}
                  style={[styles.row, locked && styles.rowLocked]}
                  activeOpacity={locked && !esComunidadBloqueada && !esSinAsistencia ? 1 : 0.7}
                  onPress={() => {
                    if (esSinAsistencia) {
                      const msg = t('chats.seAbreAlConfirmar');
                      if (Platform.OS === 'web') window.alert(msg);
                      else Alert.alert(t('chats.chatBloqueado'), msg);
                      return;
                    }
                    if (esComunidadBloqueada) {
                      // Tocar algo y que no pase nada se siente roto. Se explica
                      // por que esta cerrado y como se abre.
                      const msg = t('chats.comunidadBloqueada');
                      if (Platform.OS === 'web') window.alert(msg);
                      else Alert.alert(item.channel_title || t('chats.comunidadNospi'), msg);
                      return;
                    }
                    if (!locked) openConversation(item);
                  }}
                  disabled={locked && !esComunidadBloqueada && !esSinAsistencia}
                >
                  {/* El punto verde va envolviendo la foto, no dentro de cada
                      rama: la foto cambia segun el tipo de chat (foto, silueta,
                      candado...) y repetirlo en todas invita a que alguna se
                      quede sin el. */}
                  <View style={{ position: 'relative' }}>
                  {photoUrl ? (
                    <Image source={{ uri: photoUrl }} style={styles.avatar} />
                  ) : locked ? (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Text style={styles.avatarEmoji}>🔒</Text>
                    </View>
                  ) : isComunidad ? (
                    // Silueta monocroma teñida del mismo morado que los iconos
                    // de evento, en vez de un emoji a color. Se escogio "grupo
                    // de personas" porque el set sigue una regla: cada icono
                    // muestra la ACTIVIDAD (la taza, los bolos, la caminata), y
                    // la actividad de la comunidad son las personas.
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <IconSymbol
                        ios_icon_name="person.3.fill"
                        android_material_icon_name="groups"
                        size={30}
                        color="#880E4F"
                      />
                    </View>
                  ) : isChannel ? (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Text style={styles.avatarEmoji}>
                        {item.conv_type === 'channel_global' ? '📢' : '📣'}
                      </Text>
                    </View>
                  ) : isGroup ? (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Image source={eventIconSource(item.event_type)} style={item.event_type === 'virtual' ? styles.avatarEventIconAncho : styles.avatarEventIcon} resizeMode="contain" />
                    </View>
                  ) : (
                    /* Un privado con alguien que no subio foto. Antes salia el
                       emoji 👤 gris, igual para todo el mundo; ahora sale el
                       personaje de Nospi segun su genero. Si no se conoce el
                       genero, AvatarNospi vuelve solo a la inicial del nombre,
                       que sigue diciendo mas que un muneco generico. */
                    <AvatarNospi
                      url={null}
                      gender={item.other_user_gender}
                      nombre={item.other_user_name}
                      size={52}
                      radio={15}
                      style={styles.avatar}
                    />
                  )}

                  {hayEnLinea && <View style={styles.puntoEnLinea} />}
                  </View>

                  <View style={styles.rowContent}>
                    <View style={styles.rowHeader}>
                      {/* Dos lineas: "Comunidad Nospi Medellin" y varios
                          nombres de evento no caben en una sola en pantallas
                          angostas, y se cortaban a la mitad. */}
                      <Text style={[styles.rowTitle, hasUnread && styles.rowTitleUnread, locked && styles.rowTitleLocked]} numberOfLines={2}>
                        {title}
                      </Text>
                      {/* Una solicitud no es un chat mas: hay que decidir algo.
                          La etiqueta lo dice antes de abrirlo. */}
                      {esSolicitud && (
                        <View style={styles.solicitudChip}>
                          <Text style={styles.solicitudChipText}>Solicitud</Text>
                        </View>
                      )}
                      {solicitudEnviada && (
                        <View style={styles.solicitudEnviadaChip}>
                          <Text style={styles.solicitudEnviadaChipText}>Enviada</Text>
                        </View>
                      )}
                      {!locked && <Text style={styles.rowTime}>{timeAgo(item.last_message_at)}</Text>}
                    </View>
                    {locked ? (
                      <Text style={styles.rowLockedText} numberOfLines={2}>
                        {unlockLabel
                          ? `Se habilita a las ${unlockLabel}`
                          // Dice ASISTIR, no comprar: comprar y no aparecer no
                          // abre la puerta, y es justo lo que no hay que premiar.
                          : 'Entras cuando vengas a tu primer evento'}
                      </Text>
                    ) : (
                      <View style={styles.rowFooter}>
                        {/* Mientras alguien escribe, el aviso OCUPA el sitio de
                            la vista previa en vez de añadir un renglon: asi la
                            fila no cambia de alto cada vez que alguien empieza
                            y para de escribir, que haria temblar la lista. */}
                        {textoEscribiendo ? (
                          <Text style={styles.rowEscribiendo} numberOfLines={1}>
                            {textoEscribiendo}…
                          </Text>
                        ) : (
                        <Text
                          style={[styles.rowLastMessage, hasUnread && styles.rowLastMessageUnread]}
                          numberOfLines={1}
                        >
                          {solicitudEnviada
                            // Se reemplaza el ultimo mensaje —que es el suyo—
                            // por el estado, que es lo que de verdad quiere
                            // saber: si ya le respondieron o no.
                            ? 'Esperando que acepte tu solicitud'
                            : item.last_message
                            ? item.last_message
                            // Mientras la comunidad este callada, la fila dice
                            // que es en vez de "Sin mensajes todavia", que no
                            // explica nada de un grupo que la persona no pidio.
                            : isComunidad
                            ? 'Quienes ya vinieron a un evento de Nospi'
                            : 'Sin mensajes todavía'}
                        </Text>
                        )}
                        {hasUnread && (
                          <View style={styles.unreadBadge}>
                            <Text style={styles.unreadBadgeText}>
                              {item.unread_count > 9 ? '9+' : item.unread_count}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
            <View style={{ height: 100 }} />
          </ScrollView>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1, paddingTop: 60 },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  pushBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  pushBannerEmoji: { fontSize: 19 },
  pushBannerText: { flex: 1, fontSize: 13, color: '#FFFFFF', lineHeight: 18 },
  // Explicador de las tres puertas del chat 1-1.
  comoBloque: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  comoCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
  },
  comoPregunta: { flex: 1, fontSize: 13.5, fontWeight: '700', color: '#FFFFFF' },
  comoFlecha: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginLeft: 8 },
  comoCuerpo: { paddingBottom: 13, gap: 7 },
  comoLinea: { fontSize: 13, color: 'rgba(255,255,255,0.92)', lineHeight: 18 },
  comoBullet: { fontSize: 13 },
  comoCierre: {
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.72)',
    lineHeight: 17,
    marginTop: 4,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    minWidth: 0,
  },
  filterTabActive: {
    backgroundColor: '#FFFFFF',
  },
  filterTabText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    flexShrink: 1,
  },
  filterTabTextActive: { color: '#880E4F' },
  filterBadge: {
    backgroundColor: '#AD1457',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginLeft: 6,
  },
  filterBadgeText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },
  scrollView: { flex: 1 },
  contentContainer: { paddingHorizontal: 16, paddingBottom: 20 },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    marginBottom: 100,
  },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 11,
    marginBottom: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.13,
    shadowRadius: 10,
    elevation: 3,
  },
  rowLocked: { opacity: 0.6 },
  rowTitleLocked: { color: '#9a9a9e' },
  rowLockedText: { fontSize: 12, color: '#AD1457' },
  avatar: { width: 52, height: 52, borderRadius: 15 },
  // El punto verde en la esquina de la foto. El borde es del color del fondo
  // de la fila para que se lea como encima de la foto y no como un pegote.
  puntoEnLinea: {
    position: 'absolute', right: -2, top: -2,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#2BD97C', borderWidth: 2.5, borderColor: '#FFFFFF',
  },
  // El "escribiendo" en verde oscuro: se distingue del gris de la vista previa
  // sin competir con el nombre.
  rowEscribiendo: { flex: 1, fontSize: 13, color: '#1F6F4F', fontWeight: '700' },
  avatarPlaceholder: {
    backgroundColor: 'rgba(136,14,79,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 24 },
  // La comunidad se ve distinta a los chats de evento a proposito: es
  // permanente y no pertenece a ninguna cena en particular.
  avatarComunidad: {
    backgroundColor: 'rgba(173,20,87,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  solicitudChip: {
    backgroundColor: 'rgba(217,119,6,0.18)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 6,
  },
  solicitudChipText: { fontSize: 10, fontWeight: '800', color: '#B45309' },
  // Mas apagado que el de "Solicitud": aca no hay nada que decidir, solo que
  // esperar. No deberia competir por la atencion.
  solicitudEnviadaChip: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 6,
  },
  solicitudEnviadaChipText: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  avatarEventIcon: { width: 32, height: 32, tintColor: '#880E4F' },
  // El de videollamada es ancho y bajo: dentro de una caja cuadrada se encoge
  // a lo alto. Se dibuja mas grande, como en la lista de eventos.
  avatarEventIconAncho: { width: 38, height: 38, tintColor: '#880E4F' },
  rowContent: { flex: 1, marginLeft: 12 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: '#1c1c1e', flex: 1, marginRight: 8 },
  rowTitleUnread: { fontWeight: '800' },
  rowTime: { fontSize: 12, color: '#8a8a8e' },
  rowFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLastMessage: { fontSize: 13, color: '#8a8a8e', flex: 1, marginRight: 8 },
  rowLastMessageUnread: { color: '#3a3a3e', fontWeight: '600' },
  unreadBadge: {
    backgroundColor: '#880E4F',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  unreadBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
});
