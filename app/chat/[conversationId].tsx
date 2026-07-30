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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { nospiColors } from '@/constants/Colors';
import { useSupabase } from '@/contexts/SupabaseContext';
import { supabase } from '@/lib/supabase';
import { IconSymbol } from '@/components/IconSymbol';

const NOSPI_SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000099';

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

interface Participant {
  user_id: string;
  name: string;
  profile_photo_url: string | null;
}

interface ConversationMeta {
  conv_type: 'event_group' | 'direct';
  event_name: string | null;
  event_type: string | null;
  event_date: string | null;
  other_user_name: string | null;
  other_user_photo: string | null;
}

function eventEmoji(eventType: string | null | undefined): string {
  return eventType === 'bar' ? '🍸' : eventType === 'caminata' ? '🚶' : eventType === 'cafe' ? '☕' : '🍽️';
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
  const [showParticipants, setShowParticipants] = useState(false);
  const [startingChatWith, setStartingChatWith] = useState<string | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

  const participantsById = participants.reduce<Record<string, Participant>>((acc, p) => {
    acc[p.user_id] = p;
    return acc;
  }, {});

  const loadEverything = useCallback(async () => {
    if (!conversationId || !user?.id) return;

    const [{ data: msgs, error: msgsError }, { data: parts, error: partsError }, { data: convs }] =
      await Promise.all([
        supabase
          .from('chat_messages')
          .select('id, conversation_id, sender_id, content, created_at')
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
      });
    }

    setLoading(false);
    await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
  }, [conversationId, user]);

  useEffect(() => {
    loadEverything();
  }, [loadEverything]);

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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

    const handleSend = async (overrideContent?: string) => {
    const content = (overrideContent ?? draft).trim();
    if (!content || !user?.id || !conversationId || sending) return;

    setSending(true);
    setDraft('');

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content,
      })
      .select('id, conversation_id, sender_id, content, created_at')
      .single();

    if (error) {
      console.error('ChatThread: error sending message', error);
      setDraft(content);
    } else if (data) {
      setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data as Message]));
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
    setSending(false);
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
      Alert.alert('No se pudo abrir el chat', 'Intenta de nuevo en unos segundos.');
      return;
    }

    if (data) {
      router.push(`/chat/${data}` as any);
    }
  };

  const handleBack = async () => {
    if (conversationId) {
            try {
        await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
            } catch (err) {
        console.error('ChatThread: error marking conversation read', err);
            }
    }
    router.back();
  };

  const isGroup = meta?.conv_type === 'event_group';
  const headerTitle = isGroup ? meta?.event_name || 'Chat del evento' : meta?.other_user_name || 'Chat';
  const otherUserPhoto = !isGroup ? meta?.other_user_photo : null;

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
          <TouchableOpacity onPress={handleBack} style={styles.headerBackButton}>
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color="#FFFFFF" />
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
          <TouchableOpacity onPress={handleBack} style={styles.headerBackButton}>
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            {isGroup ? (
              <View style={styles.headerAvatarPlaceholder}>
                <Text style={styles.headerEmoji}>{eventEmoji(meta?.event_type)}</Text>
              </View>
            ) : otherUserPhoto ? (
              <Image source={{ uri: otherUserPhoto }} style={styles.headerAvatar} />
            ) : (
              <View style={styles.headerAvatarPlaceholder}>
                <Text style={styles.headerEmoji}>👤</Text>
              </View>
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
            const showSenderInfo = isGroup && !isMine;

            return (
              <View style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowTheirs]}>
                {showSenderInfo &&
                  (senderPhoto ? (
                    <Image source={{ uri: senderPhoto }} style={styles.messageAvatar} />
                  ) : (
                    <View style={[styles.messageAvatar, styles.messageAvatarPlaceholder]}>
                      <Text style={{ fontSize: 14 }}>{isSystem ? '📣' : '👤'}</Text>
                    </View>
                  ))}
                <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {showSenderInfo && <Text style={styles.senderName}>{senderName}</Text>}
                  <Text style={[styles.messageText, isMine && styles.messageTextMine]}>{item.content}</Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyMessages}>
              <Text style={styles.emptyMessagesText}>
                {isGroup
                  ? 'Sé el primero en saludar al grupo 👋'
                  : 'Escribe el primer mensaje para romper el hielo 👋'}
              </Text>
            </View>
          }
        />

        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={styles.textInput}
            placeholder="Escribe un mensaje..."
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={draft}
                        onChangeText={(text) => { if (text.endsWith('\n')) { const trimmed = text.slice(0, -1); setDraft(trimmed); handleSend(trimmed); } else { setDraft(text); } }}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[styles.sendButton, !draft.trim() && styles.sendButtonDisabled]}
            onPress={() => handleSend()}
            disabled={!draft.trim() || sending}
          >
            <IconSymbol ios_icon_name="paperplane.fill" android_material_icon_name="send" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

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
                      <Image source={{ uri: p.profile_photo_url }} style={styles.participantAvatar} />
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
  headerBackButton: { padding: 8 },
  headerActionButton: { padding: 8, width: 40, alignItems: 'center' },
  directChatBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)', paddingVertical: 10, marginHorizontal: 12, marginBottom: 8, borderRadius: 10 },
  directChatBannerText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  headerAvatar: { width: 30, height: 30, borderRadius: 15, marginRight: 8 },
  headerAvatarPlaceholder: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEmoji: { fontSize: 16 },
  headerTitle: { flexShrink: 1, color: '#FFFFFF', fontSize: 17, fontWeight: '700', textAlign: 'left' },
  messagesContainer: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 1 },
  messageRow: { marginBottom: 10, flexDirection: 'row', alignItems: 'flex-end' },
  messageRowMine: { justifyContent: 'flex-end' },
  messageRowTheirs: { justifyContent: 'flex-start' },
  messageAvatar: { width: 26, height: 26, borderRadius: 13, marginRight: 6 },
  messageAvatarPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { backgroundColor: nospiColors.purpleLight, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: 'rgba(255,255,255,0.15)', borderBottomLeftRadius: 4 },
  senderName: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.75)', marginBottom: 2 },
  messageText: { fontSize: 15, color: '#FFFFFF', lineHeight: 20 },
  messageTextMine: { color: '#FFFFFF' },
  emptyMessages: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyMessagesText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center' },
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
});
