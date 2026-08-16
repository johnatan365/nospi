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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { nospiColors } from '@/constants/Colors';
import { useSupabase } from '@/contexts/SupabaseContext';
import { supabase } from '@/lib/supabase';
import { IconSymbol } from '@/components/IconSymbol';

// Prefijo para guardar el borrador (lo que se está escribiendo pero aún no se
// envía) por conversación, para que no se pierda al salir y volver al chat.
const DRAFT_KEY = (id?: string) => `chat_draft_${id}`;

const NOSPI_SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000099';

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  reply_to?: string | null;
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
    <Image source={{ uri, cache: 'force-cache' }} style={box} onError={() => setFailed(true)} />
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
function renderMessageContent(text: string, mine: boolean) {
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
    return <Text key={i}>{part}</Text>;
  });
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
  const [showParticipants, setShowParticipants] = useState(false);
  const [startingChatWith, setStartingChatWith] = useState<string | null>(null);
  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null);
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
          .select('id, conversation_id, sender_id, content, created_at, reply_to')
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

    const replyId = replyingTo?.id ?? null;

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content,
        reply_to: replyId,
      })
      .select('id, conversation_id, sender_id, content, created_at, reply_to')
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

  const isGroup = meta?.conv_type === 'event_group';
  // Para chats directos, "el otro" participante sirve de respaldo: cuando la
  // conversacion aun no tiene mensajes no aparece en get_my_conversations, asi
  // que meta llega null y el nombre/foto hay que sacarlos de los participantes
  // (get_conversation_participants si los trae, con o sin mensajes).
  const otherParticipant = !isGroup ? participants.find((p) => p.user_id !== user?.id) : undefined;
  const headerTitle = isGroup
    ? meta?.event_name || 'Chat del evento'
    : meta?.other_user_name || otherParticipant?.name || 'Chat';
  const otherUserPhoto = !isGroup
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
            {isGroup ? (
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
                <TouchableOpacity
                  activeOpacity={0.9}
                  onLongPress={() => setReplyingTo(item)}
                  delayLongPress={250}
                  style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}
                >
                  {showSenderInfo && <Text style={styles.senderName}>{senderName}</Text>}
                  {repliedMsg && (
                    <View style={[styles.quoteBox, isMine ? styles.quoteBoxMine : styles.quoteBoxTheirs]}>
                      <Text style={[styles.quoteName, isMine && styles.quoteNameMine]} numberOfLines={1}>{repliedName}</Text>
                      <Text style={[styles.quoteText, isMine && styles.quoteTextMine]} numberOfLines={1}>
                        {repliedMsg.content}
                      </Text>
                    </View>
                  )}
                  <Text style={[styles.messageText, isMine && styles.messageTextMine]}>
                    {renderMessageContent(item.content, isMine)}
                  </Text>
                  <Text style={[styles.messageTime, isMine && styles.messageTimeMine]}>
                    {formatBogotaTime(new Date(item.created_at))}
                  </Text>
                </TouchableOpacity>
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
              <Text style={styles.replyPreviewText} numberOfLines={1}>{replyingTo.content}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.replyPreviewClose}>
              <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={styles.textInput}
            placeholder="Escribe un mensaje..."
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={draft}
                        onChangeText={(text) => { if (text.endsWith('\n')) { const trimmed = text.slice(0, -1); updateDraft(trimmed); handleSend(trimmed); } else { updateDraft(text); } }}
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
                      <TouchableOpacity onPress={() => setZoomedPhoto(p.profile_photo_url)} activeOpacity={0.8}>
                        <Image source={{ uri: p.profile_photo_url }} style={styles.participantAvatar} />
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

      <Modal visible={!!zoomedPhoto} animationType="fade" transparent onRequestClose={() => setZoomedPhoto(null)}>
        <TouchableOpacity style={styles.photoViewerOverlay} activeOpacity={1} onPress={() => setZoomedPhoto(null)}>
          {zoomedPhoto && (
            <Image source={{ uri: zoomedPhoto }} style={styles.photoViewerImage} resizeMode="contain" />
          )}
          <TouchableOpacity
            style={[styles.photoViewerClose, { top: insets.top + 12 }]}
            onPress={() => setZoomedPhoto(null)}
          >
            <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={26} color="#FFFFFF" />
          </TouchableOpacity>
        </TouchableOpacity>
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
  messageRow: { marginBottom: 10, flexDirection: 'row', alignItems: 'flex-end' },
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
  bubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
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
