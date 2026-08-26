diff --git a/app/chat/[conversationId].tsx b/app/chat/[conversationId].tsx
index 195ff61..2fb663d 100644
--- a/app/chat/[conversationId].tsx
+++ b/app/chat/[conversationId].tsx
@@ -24,6 +24,10 @@ import { nospiColors } from '@/constants/Colors';
 import { useSupabase } from '@/contexts/SupabaseContext';
 import { supabase } from '@/lib/supabase';
 import { IconSymbol } from '@/components/IconSymbol';
+import * as ImagePicker from 'expo-image-picker';
+import * as FileSystem from 'expo-file-system';
+import * as WebBrowser from 'expo-web-browser';
+import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase';
 
 // Prefijo para guardar el borrador (lo que se está escribiendo pero aún no se
 // envía) por conversación, para que no se pierda al salir y volver al chat.
@@ -31,6 +35,53 @@ const DRAFT_KEY = (id?: string) => `chat_draft_${id}`;
 
 const NOSPI_SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000099';
 
+// Bucket PRIVADO de fotos y videos del chat. No se puede abrir por URL
+// directa: cada archivo se sirve con un enlace firmado que solo se le entrega
+// a los participantes de la conversacion (politica en storage.objects) y que
+// caduca. Ruta de cada archivo: <conversation_id>/<sender_id>/<archivo>.
+const MEDIA_BUCKET = 'chat-media';
+const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hora
+
+// Columnas que necesita la pantalla. Se centraliza para que la carga inicial y
+// el insert al enviar devuelvan exactamente lo mismo.
+const MESSAGE_COLUMNS =
+  'id, conversation_id, sender_id, content, created_at, reply_to, media_path, media_kind, media_mime, media_width, media_height, media_size, media_duration';
+
+// Ancho maximo de una foto/video dentro de la burbuja. La altura se calcula
+// con la proporcion real del archivo para que no se vea deformado.
+const MEDIA_MAX_WIDTH = 210;
+const MEDIA_MAX_HEIGHT = 320;
+
+function mediaBoxSize(width?: number | null, height?: number | null) {
+  if (!width || !height || width <= 0 || height <= 0) {
+    return { width: MEDIA_MAX_WIDTH, height: MEDIA_MAX_WIDTH };
+  }
+  const scaled = (MEDIA_MAX_WIDTH * height) / width;
+  if (scaled <= MEDIA_MAX_HEIGHT) return { width: MEDIA_MAX_WIDTH, height: Math.round(scaled) };
+  return { width: Math.round((MEDIA_MAX_HEIGHT * width) / height), height: MEDIA_MAX_HEIGHT };
+}
+
+// Extension y tipo MIME del archivo tal como lo entrega el selector. No se
+// recomprime ni se redimensiona nada: lo que se sube es el original.
+function mediaFileInfo(asset: ImagePicker.ImagePickerAsset) {
+  const kind: 'image' | 'video' = asset.type === 'video' ? 'video' : 'image';
+  const fromName = (asset.fileName || '').split('.').pop() || '';
+  let ext = fromName.toLowerCase().replace(/[^a-z0-9]/g, '');
+  if (!ext) ext = kind === 'video' ? 'mp4' : 'jpg';
+  let mime = asset.mimeType || '';
+  if (!mime) {
+    if (kind === 'video') mime = ext === 'mov' ? 'video/quicktime' : `video/${ext}`;
+    else mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
+  }
+  return { kind, ext, mime };
+}
+
+function formatBytes(bytes?: number | null): string {
+  if (!bytes || bytes <= 0) return '';
+  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
+  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
+}
+
 interface Message {
   id: string;
   conversation_id: string;
@@ -38,6 +89,13 @@ interface Message {
   content: string;
   created_at: string;
   reply_to?: string | null;
+  media_path?: string | null;
+  media_kind?: 'image' | 'video' | null;
+  media_mime?: string | null;
+  media_width?: number | null;
+  media_height?: number | null;
+  media_size?: number | null;
+  media_duration?: number | null;
 }
 
 interface Participant {
@@ -88,6 +146,15 @@ function formatBogotaTime(date: Date): string {
   return `${h}:${String(m).padStart(2, '0')} ${suffix}`;
 }
 
+// Texto corto que representa un mensaje cuando se cita o se responde. Un
+// mensaje solo de foto/video no tiene texto, asi que se muestra la etiqueta.
+function messagePreviewText(m: Message): string {
+  const label = m.media_kind === 'video' ? '🎥 Video' : m.media_kind === 'image' ? '📷 Foto' : '';
+  const text = (m.content || '').trim();
+  if (label && text) return `${label} ${text}`;
+  return label || text;
+}
+
 function initialsOf(name?: string | null): string {
   return (name || '?').trim().charAt(0).toUpperCase() || '?';
 }
@@ -157,7 +224,14 @@ export default function ChatThreadScreen() {
   const [showParticipants, setShowParticipants] = useState(false);
   const [startingChatWith, setStartingChatWith] = useState<string | null>(null);
   const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null);
+  // Enlaces firmados de las fotos/videos, por ruta del archivo en el bucket.
+  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
+  const [showAttachMenu, setShowAttachMenu] = useState(false);
+  const [uploadingKind, setUploadingKind] = useState<'image' | 'video' | null>(null);
   const listRef = useRef<FlatList<Message>>(null);
+  // Rutas para las que ya se pidio firma, para no volver a pedirlas en cada
+  // render (y para no entrar en bucle si alguna falla).
+  const signRequestedRef = useRef<Set<string>>(new Set());
 
   const participantsById = participants.reduce<Record<string, Participant>>((acc, p) => {
     acc[p.user_id] = p;
@@ -171,7 +245,7 @@ export default function ChatThreadScreen() {
       await Promise.all([
         supabase
           .from('chat_messages')
-          .select('id, conversation_id, sender_id, content, created_at, reply_to')
+          .select(MESSAGE_COLUMNS)
           .eq('conversation_id', conversationId)
           .order('created_at', { ascending: true }),
         supabase.rpc('get_conversation_participants', { p_conversation_id: conversationId }),
@@ -204,6 +278,47 @@ export default function ChatThreadScreen() {
     loadEverything();
   }, [loadEverything]);
 
+  // Pide enlaces firmados para las fotos/videos que todavia no tienen uno.
+  // El bucket es privado, asi que sin esto la imagen no carga. La firma la
+  // autoriza la politica de storage: solo si eres participante del chat.
+  useEffect(() => {
+    const pending = Array.from(
+      new Set(
+        messages
+          .map((m) => m.media_path)
+          .filter((path): path is string => !!path && !signRequestedRef.current.has(path))
+      )
+    );
+    if (pending.length === 0) return;
+    pending.forEach((path) => signRequestedRef.current.add(path));
+
+    let active = true;
+    supabase.storage
+      .from(MEDIA_BUCKET)
+      .createSignedUrls(pending, SIGNED_URL_TTL_SECONDS)
+      .then(({ data, error }) => {
+        if (!active) return;
+        if (error) {
+          console.error('ChatThread: error firmando media', error);
+          // Se permite reintentar en la proxima carga del chat.
+          pending.forEach((path) => signRequestedRef.current.delete(path));
+          return;
+        }
+        setSignedUrls((prev) => {
+          const next = { ...prev };
+          (data || []).forEach((item: any) => {
+            if (item?.path && item?.signedUrl) next[item.path] = item.signedUrl;
+          });
+          return next;
+        });
+      })
+      .catch(() => {
+        pending.forEach((path) => signRequestedRef.current.delete(path));
+      });
+
+    return () => { active = false; };
+  }, [messages]);
+
   // Recupera el borrador guardado al entrar (o volver) al chat.
   useEffect(() => {
     if (!conversationId) return;
@@ -270,7 +385,7 @@ export default function ChatThreadScreen() {
         content,
         reply_to: replyId,
       })
-      .select('id, conversation_id, sender_id, content, created_at, reply_to')
+      .select(MESSAGE_COLUMNS)
       .single();
 
     if (error) {
@@ -285,6 +400,150 @@ export default function ChatThreadScreen() {
     setSending(false);
   };
 
+  // Sube el archivo TAL CUAL viene del selector: sin redimensionar y sin
+  // recomprimir, para que la foto o el video conserven la resolucion original.
+  // En movil se usa FileSystem.uploadAsync, que hace streaming del archivo al
+  // endpoint de Storage; leerlo a base64 en memoria (como hace la foto de
+  // perfil) revienta la app con un video de varios cientos de MB.
+  const uploadToBucket = async (asset: ImagePicker.ImagePickerAsset, path: string, mime: string) => {
+    if (Platform.OS === 'web') {
+      const blob = await (await fetch(asset.uri)).blob();
+      const { error } = await supabase.storage
+        .from(MEDIA_BUCKET)
+        .upload(path, blob, { contentType: mime, cacheControl: '3600', upsert: false });
+      if (error) throw new Error(error.message);
+      return;
+    }
+
+    const { data: sessionData } = await supabase.auth.getSession();
+    const accessToken = sessionData.session?.access_token;
+    if (!accessToken) throw new Error('Tu sesión expiró, vuelve a entrar.');
+
+    const res = await FileSystem.uploadAsync(
+      `${SUPABASE_URL}/storage/v1/object/${MEDIA_BUCKET}/${path}`,
+      asset.uri,
+      {
+        httpMethod: 'POST',
+        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
+        headers: {
+          Authorization: `Bearer ${accessToken}`,
+          apikey: SUPABASE_ANON_KEY,
+          'Content-Type': mime,
+          'cache-control': '3600',
+        },
+      }
+    );
+    if (res.status >= 400) {
+      let detail = '';
+      try { detail = JSON.parse(res.body || '{}')?.message || ''; } catch { detail = ''; }
+      throw new Error(detail || `El servidor rechazó el archivo (${res.status}).`);
+    }
+  };
+
+  const sendMediaMessage = async (asset: ImagePicker.ImagePickerAsset) => {
+    if (!user?.id || !conversationId || uploadingKind) return;
+
+    const { kind, ext, mime } = mediaFileInfo(asset);
+    setUploadingKind(kind);
+
+    // El texto que hubiera escrito queda como pie de foto del mismo mensaje.
+    const caption = draft.trim();
+    const replyId = replyingTo?.id ?? null;
+
+    try {
+      const path = `${conversationId}/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
+      await uploadToBucket(asset, path, mime);
+
+      const { data, error } = await supabase
+        .from('chat_messages')
+        .insert({
+          conversation_id: conversationId,
+          sender_id: user.id,
+          content: caption,
+          reply_to: replyId,
+          media_path: path,
+          media_kind: kind,
+          media_mime: mime,
+          media_width: asset.width ?? null,
+          media_height: asset.height ?? null,
+          media_size: asset.fileSize ?? null,
+          media_duration: kind === 'video' && asset.duration ? asset.duration / 1000 : null,
+        })
+        .select(MESSAGE_COLUMNS)
+        .single();
+
+      if (error) throw new Error(error.message);
+
+      if (data) {
+        setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data as Message]));
+        setReplyingTo(null);
+        if (caption) updateDraft('');
+        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
+      }
+    } catch (e: any) {
+      console.error('ChatThread: error subiendo media', e);
+      Alert.alert(
+        kind === 'video' ? 'No se pudo enviar el video' : 'No se pudo enviar la foto',
+        e?.message || 'Revisa tu conexión e inténtalo de nuevo.'
+      );
+    } finally {
+      setUploadingKind(null);
+    }
+  };
+
+  const pickFromLibrary = async () => {
+    setShowAttachMenu(false);
+    if (Platform.OS !== 'web') {
+      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
+      if (!perm.granted) {
+        Alert.alert('Permiso requerido', 'Necesitamos permiso para acceder a tus fotos y videos.');
+        return;
+      }
+    }
+    // quality: 1 y sin allowsEditing => resolución original, sin recorte ni
+    // reescalado. En iPhone el selector entrega la foto HEIC convertida a JPEG
+    // a máxima calidad (mismo tamaño en píxeles) para que también se pueda ver
+    // en Android y en la web.
+    const result = await ImagePicker.launchImageLibraryAsync({
+      mediaTypes: ['images', 'videos'],
+      allowsEditing: false,
+      quality: 1,
+      exif: false,
+    });
+    if (!result.canceled && result.assets?.[0]) await sendMediaMessage(result.assets[0]);
+  };
+
+  const takePhoto = async () => {
+    setShowAttachMenu(false);
+    const perm = await ImagePicker.requestCameraPermissionsAsync();
+    if (!perm.granted) {
+      Alert.alert('Permiso requerido', 'Necesitamos permiso para usar la cámara.');
+      return;
+    }
+    const result = await ImagePicker.launchCameraAsync({
+      mediaTypes: ['images', 'videos'],
+      allowsEditing: false,
+      quality: 1,
+      exif: false,
+    });
+    if (!result.canceled && result.assets?.[0]) await sendMediaMessage(result.assets[0]);
+  };
+
+  // El video no se reproduce dentro de la burbuja en móvil (haría falta una
+  // librería nativa nueva y por tanto un build nuevo): se abre a pantalla
+  // completa en el reproductor del sistema con el enlace firmado.
+  const openVideo = async (url: string) => {
+    try {
+      if (Platform.OS === 'web') {
+        if (typeof window !== 'undefined') window.open(url, '_blank');
+        return;
+      }
+      await WebBrowser.openBrowserAsync(url);
+    } catch {
+      Linking.openURL(url).catch(() => {});
+    }
+  };
+
   const handleStartDirectChat = async (otherUserId: string) => {
     if (!otherUserId || otherUserId === user?.id || startingChatWith) return;
     setStartingChatWith(otherUserId);
@@ -476,13 +735,67 @@ export default function ChatThreadScreen() {
                     <View style={[styles.quoteBox, isMine ? styles.quoteBoxMine : styles.quoteBoxTheirs]}>
                       <Text style={[styles.quoteName, isMine && styles.quoteNameMine]} numberOfLines={1}>{repliedName}</Text>
                       <Text style={[styles.quoteText, isMine && styles.quoteTextMine]} numberOfLines={1}>
-                        {repliedMsg.content}
+                        {messagePreviewText(repliedMsg)}
                       </Text>
                     </View>
                   )}
-                  <Text style={[styles.messageText, isMine && styles.messageTextMine]}>
-                    {renderMessageContent(item.content, isMine)}
-                  </Text>
+                  {!!item.media_path && (() => {
+                    const url = signedUrls[item.media_path as string];
+                    const box = mediaBoxSize(item.media_width, item.media_height);
+                    if (!url) {
+                      return (
+                        <View style={[styles.mediaPlaceholder, box]}>
+                          <ActivityIndicator size="small" color={isMine ? '#FFFFFF' : nospiColors.purpleDark} />
+                        </View>
+                      );
+                    }
+                    if (item.media_kind === 'video') {
+                      if (Platform.OS === 'web') {
+                        return React.createElement('video', {
+                          src: url,
+                          controls: true,
+                          playsInline: true,
+                          style: {
+                            width: box.width,
+                            height: box.height,
+                            borderRadius: 12,
+                            backgroundColor: '#000',
+                            marginBottom: 6,
+                          },
+                        });
+                      }
+                      return (
+                        <TouchableOpacity
+                          activeOpacity={0.85}
+                          onPress={() => openVideo(url)}
+                          style={[styles.mediaVideoBox, box]}
+                        >
+                          <View style={styles.mediaPlayCircle}>
+                            <IconSymbol ios_icon_name="play.fill" android_material_icon_name="play-arrow" size={28} color="#FFFFFF" />
+                          </View>
+                          {!!item.media_size && (
+                            <Text style={styles.mediaMeta}>{formatBytes(item.media_size)}</Text>
+                          )}
+                        </TouchableOpacity>
+                      );
+                    }
+                    return (
+                      <TouchableOpacity activeOpacity={0.9} onPress={() => setZoomedPhoto(url)}>
+                        <ExpoImage
+                          source={{ uri: url }}
+                          style={[styles.mediaImage, box]}
+                          contentFit="cover"
+                          cachePolicy="memory-disk"
+                          transition={120}
+                        />
+                      </TouchableOpacity>
+                    );
+                  })()}
+                  {!!(item.content || '').trim() && (
+                    <Text style={[styles.messageText, isMine && styles.messageTextMine]}>
+                      {renderMessageContent(item.content, isMine)}
+                    </Text>
+                  )}
                   <Text style={[styles.messageTime, isMine && styles.messageTimeMine]}>
                     {formatBogotaTime(new Date(item.created_at))}
                   </Text>
@@ -512,7 +825,7 @@ export default function ChatThreadScreen() {
                   ? 'Equipo Nospi'
                   : participantsById[replyingTo.sender_id]?.name || 'Alguien'}
               </Text>
-              <Text style={styles.replyPreviewText} numberOfLines={1}>{replyingTo.content}</Text>
+              <Text style={styles.replyPreviewText} numberOfLines={1}>{messagePreviewText(replyingTo)}</Text>
             </View>
             <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.replyPreviewClose}>
               <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={18} color="#FFFFFF" />
@@ -520,7 +833,25 @@ export default function ChatThreadScreen() {
           </View>
         )}
 
+        {!!uploadingKind && (
+          <View style={styles.uploadingBar}>
+            <ActivityIndicator size="small" color="#FFFFFF" />
+            <Text style={styles.uploadingText}>
+              {uploadingKind === 'video'
+                ? 'Enviando video en calidad original...'
+                : 'Enviando foto en calidad original...'}
+            </Text>
+          </View>
+        )}
+
         <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
+          <TouchableOpacity
+            style={styles.attachButton}
+            onPress={() => setShowAttachMenu(true)}
+            disabled={!!uploadingKind}
+          >
+            <IconSymbol ios_icon_name="paperclip" android_material_icon_name="attach-file" size={22} color="#FFFFFF" />
+          </TouchableOpacity>
           <TextInput
             style={styles.textInput}
             placeholder="Escribe un mensaje..."
@@ -540,6 +871,28 @@ export default function ChatThreadScreen() {
         </View>
       </KeyboardAvoidingView>
 
+      <Modal visible={showAttachMenu} animationType="fade" transparent onRequestClose={() => setShowAttachMenu(false)}>
+        <TouchableOpacity style={styles.attachOverlay} activeOpacity={1} onPress={() => setShowAttachMenu(false)}>
+          <View style={styles.attachSheet}>
+            <Text style={styles.attachSheetTitle}>Enviar archivo</Text>
+            <Text style={styles.attachSheetHint}>Se envía en su calidad original, sin reducir la resolución.</Text>
+            <TouchableOpacity style={styles.attachOption} onPress={pickFromLibrary}>
+              <IconSymbol ios_icon_name="photo.on.rectangle" android_material_icon_name="photo-library" size={22} color={nospiColors.purpleDark} />
+              <Text style={styles.attachOptionText}>Foto o video de la galería</Text>
+            </TouchableOpacity>
+            {Platform.OS !== 'web' && (
+              <TouchableOpacity style={styles.attachOption} onPress={takePhoto}>
+                <IconSymbol ios_icon_name="camera.fill" android_material_icon_name="photo-camera" size={22} color={nospiColors.purpleDark} />
+                <Text style={styles.attachOptionText}>Tomar foto o grabar video</Text>
+              </TouchableOpacity>
+            )}
+            <TouchableOpacity style={styles.attachCancel} onPress={() => setShowAttachMenu(false)}>
+              <Text style={styles.attachCancelText}>Cancelar</Text>
+            </TouchableOpacity>
+          </View>
+        </TouchableOpacity>
+      </Modal>
+
       <Modal visible={showParticipants} animationType="slide" transparent onRequestClose={() => setShowParticipants(false)}>
         <View style={styles.modalOverlay}>
           <View style={styles.modalContent}>
@@ -743,6 +1096,82 @@ const styles = StyleSheet.create({
     justifyContent: 'center',
   },
   participantName: { flex: 1, fontSize: 15, fontWeight: '600', color: nospiColors.gray800 },
+  mediaImage: { borderRadius: 12, marginBottom: 6, backgroundColor: 'rgba(0,0,0,0.06)' },
+  mediaPlaceholder: {
+    borderRadius: 12,
+    marginBottom: 6,
+    backgroundColor: 'rgba(0,0,0,0.08)',
+    alignItems: 'center',
+    justifyContent: 'center',
+  },
+  mediaVideoBox: {
+    borderRadius: 12,
+    marginBottom: 6,
+    backgroundColor: '#111827',
+    alignItems: 'center',
+    justifyContent: 'center',
+  },
+  mediaPlayCircle: {
+    width: 54,
+    height: 54,
+    borderRadius: 27,
+    backgroundColor: 'rgba(255,255,255,0.25)',
+    alignItems: 'center',
+    justifyContent: 'center',
+  },
+  mediaMeta: {
+    position: 'absolute',
+    bottom: 8,
+    right: 10,
+    fontSize: 11,
+    fontWeight: '600',
+    color: '#FFFFFF',
+    backgroundColor: 'rgba(0,0,0,0.45)',
+    paddingHorizontal: 6,
+    paddingVertical: 2,
+    borderRadius: 6,
+    overflow: 'hidden',
+  },
+  uploadingBar: {
+    flexDirection: 'row',
+    alignItems: 'center',
+    gap: 10,
+    paddingHorizontal: 16,
+    paddingVertical: 10,
+    backgroundColor: 'rgba(255,255,255,0.14)',
+  },
+  uploadingText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
+  attachButton: {
+    width: 42,
+    height: 42,
+    borderRadius: 21,
+    backgroundColor: 'rgba(255,255,255,0.18)',
+    alignItems: 'center',
+    justifyContent: 'center',
+    marginRight: 8,
+  },
+  attachOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
+  attachSheet: {
+    backgroundColor: '#FFFFFF',
+    borderTopLeftRadius: 20,
+    borderTopRightRadius: 20,
+    paddingHorizontal: 20,
+    paddingTop: 18,
+    paddingBottom: 28,
+  },
+  attachSheetTitle: { fontSize: 17, fontWeight: '800', color: nospiColors.gray800 },
+  attachSheetHint: { fontSize: 13, color: nospiColors.gray400, marginTop: 4, marginBottom: 10 },
+  attachOption: {
+    flexDirection: 'row',
+    alignItems: 'center',
+    gap: 12,
+    paddingVertical: 14,
+    borderBottomWidth: 1,
+    borderBottomColor: nospiColors.gray100,
+  },
+  attachOptionText: { fontSize: 15, fontWeight: '600', color: nospiColors.gray800 },
+  attachCancel: { paddingVertical: 14, alignItems: 'center', marginTop: 6 },
+  attachCancelText: { fontSize: 15, fontWeight: '700', color: nospiColors.gray400 },
   photoViewerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
   photoViewerImage: { width: '90%', height: '75%' },
   photoViewerClose: {
diff --git a/lib/supabase.ts b/lib/supabase.ts
index 5deadda..3e6299e 100644
--- a/lib/supabase.ts
+++ b/lib/supabase.ts
@@ -27,6 +27,12 @@ export const RECOVERY_FLOW_DETECTED_ON_LOAD: boolean = (() => {
 const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || '';
 const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || '';
 
+// Se exportan para las subidas a Storage que NO pasan por supabase-js: en
+// movil los archivos grandes (videos del chat) se suben con streaming via
+// FileSystem.uploadAsync, que necesita la URL del endpoint y la anon key.
+export const SUPABASE_URL: string = supabaseUrl;
+export const SUPABASE_ANON_KEY: string = supabaseAnonKey;
+
 // Validate credentials
 if (!supabaseUrl || !supabaseAnonKey) {
   console.warn(
