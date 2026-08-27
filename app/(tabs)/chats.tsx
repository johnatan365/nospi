import React, { useCallback, useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { useSupabase } from '@/contexts/SupabaseContext';
import { supabase } from '@/lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { SkeletonBox } from '@/components/SkeletonBox';
import { getCached, setCached } from '@/utils/cache';

interface ConversationRow {
  conversation_id: string;
  conv_type: 'event_group' | 'direct' | 'channel_global' | 'channel_event';
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
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
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
  return eventType === 'bar' ? '🍸' : eventType === 'caminata' ? '🚶' : eventType === 'cafe' ? '☕' : eventType === 'bolos' ? '🎳' : '🍽️';
}

// Mismos íconos PNG que usa la pestaña de Eventos. El require debe ser estático
// (literal) para que Metro lo empaquete; por eso se resuelve con un switch.
function eventIconSource(eventType: string | null) {
  switch (eventType) {
    case 'caminata': return require('@/assets/images/icon-caminata.png');
    case 'bar': return require('@/assets/images/icon-bar.png');
    case 'cafe': return require('@/assets/images/icon-cafe.png');
    case 'bolos': return require('@/assets/images/icon-bolos.png');
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
  if (item.conv_type !== 'event_group' || !item.event_date) return { locked: false, unlockLabel: null };
  const unlockAt = new Date(new Date(item.event_date).getTime() - CHAT_UNLOCK_MINUTES_BEFORE * 60 * 1000);
  if (Date.now() >= unlockAt.getTime()) return { locked: false, unlockLabel: null };
  return { locked: true, unlockLabel: formatBogotaTime(unlockAt) };
}

type ChatFilter = 'grupos' | 'directos' | 'canales';

export default function ChatsScreen() {
  const { user } = useSupabase();
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<ChatFilter>('grupos');
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

    const { data, error } = await supabase.rpc('get_my_conversations');

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

  const groupConversations = conversations.filter((c) => c.conv_type === 'event_group');
  const directConversations = conversations.filter((c) => c.conv_type === 'direct');
  // Canales: difusion del equipo de Nospi (global y por evento).
  const channelConversations = conversations.filter(
    (c) => c.conv_type === 'channel_global' || c.conv_type === 'channel_event'
  );
  const channelUnread = channelConversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);
  const groupUnread = groupConversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);
  const directUnread = directConversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);
  const visibleConversations =
    filter === 'grupos' ? groupConversations
    : filter === 'canales' ? channelConversations
    : directConversations;

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
          <TouchableOpacity
            style={[styles.filterTab, filter === 'grupos' && styles.filterTabActive]}
            activeOpacity={0.8}
            onPress={() => setFilter('grupos')}
          >
            <Text style={[styles.filterTabText, filter === 'grupos' && styles.filterTabTextActive]}>
              Mensajes de grupo
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
            <Text style={[styles.filterTabText, filter === 'directos' && styles.filterTabTextActive]}>
              Mensajes 1-1
            </Text>
            {directUnread > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{directUnread > 9 ? '9+' : directUnread}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Canales: avisos del equipo de Nospi. Solo se muestra el filtro si
              la persona tiene al menos un canal con mensajes. */}
          {channelConversations.length > 0 && (
            <TouchableOpacity
              style={[styles.filterTab, filter === 'canales' && styles.filterTabActive]}
              activeOpacity={0.8}
              onPress={() => setFilter('canales')}
            >
              <Text style={[styles.filterTabText, filter === 'canales' && styles.filterTabTextActive]}>
                Canales
              </Text>
              {channelUnread > 0 && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{channelUnread > 9 ? '9+' : channelUnread}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>

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
                : 'Cuando le escribas a algún asistente de un evento, la conversación aparecerá aquí.'}
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
              const isChannel = item.conv_type === 'channel_global' || item.conv_type === 'channel_event';
              const title = isChannel
                ? (item.channel_title || 'Canal Nospi')
                : isGroup ? (item.event_name || 'Chat del evento') : (item.other_user_name || 'Usuario');
              const photoUrl = (isGroup || isChannel) ? null : item.other_user_photo;
              const hasUnread = item.unread_count > 0;
              const { locked, unlockLabel } = getChatLockInfo(item);

              return (
                <TouchableOpacity
                  key={item.conversation_id}
                  style={[styles.row, locked && styles.rowLocked]}
                  activeOpacity={locked ? 1 : 0.7}
                  onPress={() => { if (!locked) openConversation(item); }}
                  disabled={locked}
                >
                  {photoUrl ? (
                    <Image source={{ uri: photoUrl }} style={styles.avatar} />
                  ) : locked ? (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Text style={styles.avatarEmoji}>🔒</Text>
                    </View>
                  ) : isChannel ? (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Text style={styles.avatarEmoji}>
                        {item.conv_type === 'channel_global' ? '📢' : '📣'}
                      </Text>
                    </View>
                  ) : isGroup ? (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Image source={eventIconSource(item.event_type)} style={styles.avatarEventIcon} resizeMode="contain" />
                    </View>
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Text style={styles.avatarEmoji}>👤</Text>
                    </View>
                  )}

                  <View style={styles.rowContent}>
                    <View style={styles.rowHeader}>
                      <Text style={[styles.rowTitle, hasUnread && styles.rowTitleUnread, locked && styles.rowTitleLocked]} numberOfLines={1}>
                        {title}
                      </Text>
                      {!locked && <Text style={styles.rowTime}>{timeAgo(item.last_message_at)}</Text>}
                    </View>
                    {locked ? (
                      <Text style={styles.rowLockedText} numberOfLines={1}>
                        Se habilita a las {unlockLabel}
                      </Text>
                    ) : (
                      <View style={styles.rowFooter}>
                        <Text
                          style={[styles.rowLastMessage, hasUnread && styles.rowLastMessageUnread]}
                          numberOfLines={1}
                        >
                          {item.last_message || 'Sin mensajes todavía'}
                        </Text>
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
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingVertical: 10,
    marginRight: 8,
  },
  filterTabActive: {
    backgroundColor: '#FFFFFF',
  },
  filterTabText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
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
  avatarPlaceholder: {
    backgroundColor: 'rgba(136,14,79,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 24 },
  avatarEventIcon: { width: 32, height: 32, tintColor: '#880E4F' },
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
