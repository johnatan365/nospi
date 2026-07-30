import React, { useCallback, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { useSupabase } from '@/contexts/SupabaseContext';
import { supabase } from '@/lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { SkeletonBox } from '@/components/SkeletonBox';

interface ConversationRow {
  conversation_id: string;
  conv_type: 'event_group' | 'direct';
  event_id: string | null;
  event_name: string | null;
  event_type: string | null;
  event_date: string | null;
  event_status: string | null;
  other_user_id: string | null;
  other_user_name: string | null;
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
  return eventType === 'bar' ? '🍸' : eventType === 'caminata' ? '🚶' : eventType === 'cafe' ? '☕' : '🍽️';
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

type ChatFilter = 'grupos' | 'directos';

export default function ChatsScreen() {
  const { user } = useSupabase();
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<ChatFilter>('grupos');
  const loadedOnceRef = useRef(false);

  const loadConversations = useCallback(async (isRefresh = false) => {
    if (!user?.id) return;
    if (isRefresh) setRefreshing(true);
    else if (!loadedOnceRef.current) setLoading(true);

    const { data, error } = await supabase.rpc('get_my_conversations');

    if (error) {
      console.error('ChatsScreen: error loading conversations', error);
    } else {
      setConversations((data as ConversationRow[]) || []);
      loadedOnceRef.current = true;
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

  const goToPastEvents = () => {
    router.push('/appointments?openFilter=anteriores' as any);
  };

  const groupConversations = conversations.filter((c) => c.conv_type === 'event_group');
  const directConversations = conversations.filter((c) => c.conv_type === 'direct');
  const groupUnread = groupConversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);
  const directUnread = directConversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);
  const visibleConversations = filter === 'grupos' ? groupConversations : directConversations;

  return (
    <LinearGradient
      colors={['#1a0010', '#880E4F', '#AD1457']}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <View style={styles.container}>
        <Text style={styles.title}>Chat</Text>

        <TouchableOpacity style={styles.banner} activeOpacity={0.8} onPress={goToPastEvents}>
          <Text style={styles.bannerText}>
                        💬 Habla con alguien de un evento pasado → toca aquí
          </Text>
          <Text style={styles.bannerArrow}>→</Text>
        </TouchableOpacity>

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
        </View>

        {loading ? (
          renderSkeleton()
        ) : visibleConversations.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>💬</Text>
            <Text style={styles.emptyTitle}>
              {filter === 'grupos' ? 'Aún no tienes chats de grupo' : 'Aún no tienes chats 1-1'}
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
              const title = isGroup ? (item.event_name || 'Chat del evento') : (item.other_user_name || 'Usuario');
              const photoUrl = isGroup ? null : item.other_user_photo;
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
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Text style={styles.avatarEmoji}>{locked ? '🔒' : isGroup ? eventEmoji(item.event_type) : '👤'}</Text>
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
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    marginHorizontal: 16,
    padding: 12,
    marginBottom: 14,
  },
      bannerText: { flex: 1, color: '#FFFFFF', fontSize: 15, lineHeight: 20, fontWeight: '600' },
  bannerArrow: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', marginLeft: 10 },
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
    backgroundColor: nospiColors.purpleLight,
  },
  filterTabText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
  filterTabTextActive: { color: '#FFFFFF' },
  filterBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginLeft: 6,
  },
  filterBadgeText: { fontSize: 10, fontWeight: '700', color: '#AD1457' },
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
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  rowLocked: { opacity: 0.55 },
  rowTitleLocked: { color: 'rgba(255,255,255,0.8)' },
  rowLockedText: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 24 },
  rowContent: { flex: 1, marginLeft: 12 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#FFFFFF', flex: 1, marginRight: 8 },
  rowTitleUnread: { fontWeight: '700' },
  rowTime: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  rowFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLastMessage: { fontSize: 13, color: 'rgba(255,255,255,0.7)', flex: 1, marginRight: 8 },
  rowLastMessageUnread: { color: '#FFFFFF', fontWeight: '600' },
  unreadBadge: {
    backgroundColor: nospiColors.purpleLight,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  unreadBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
});
