import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Platform, Image, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { useSupabase } from '@/contexts/SupabaseContext';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import GameDynamicsScreen from '@/components/GameDynamicsScreen';
import { SkeletonBox } from '@/components/SkeletonBox';
import { getCached, setCached, clearCached } from '@/utils/cache';
import { formatTimeAmPm } from '@/utils/formatTime';

// Clave legacy (global, compartida entre cuentas). Se conserva solo para
// limpiarla una vez y que no quede "pegado" el evento de otra cuenta.
const CACHE_KEY_LEGACY = 'cache_dinamica';

interface Event {
  id: string;
  type: string;
  date: string;
  time: string;
  location: string;
  location_name: string;
  location_address: string;
  maps_link: string;
  is_location_revealed: boolean;
  address: string | null;
  start_time: string | null;
  max_participants: number;
  current_participants: number;
  status: string;
  game_phase: 'intro' | 'ready' | 'rules' | 'question_active' | 'level_transition' | 'finished' | 'free_phase' | 'questions';
  current_level: string | null;
  current_question_index: number | null;
  answered_users: string[] | null;
  moderator_id: string | null;
  current_question: string | null;
  event_status?: 'draft' | 'published' | 'closed';
  latitude: number | null;
  longitude: number | null;
  radius_meters: number | null;
  require_gps_verification: boolean | null;
}

interface Appointment {
  id: string;
  event_id: string;
  arrival_status: string;
  checked_in_at: string | null;
  location_confirmed: boolean;
  status: string;
  event: Event;
}

interface Profile {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  profile_photo_url: string | null;
  interested_in?: string;
}

interface Participant {
  id: string;
  user_id: string;
  event_id: string;
  confirmed: boolean;
  check_in_time: string | null;
  is_presented: boolean;
  presented_at: string | null;
  profiles: Profile | null;
}

type CheckInPhase = 'waiting' | 'code_entry' | 'confirmed';

const DEFAULT_GPS_RADIUS_METERS = 150;

// ── Tiempos de arranque, contados desde la hora del evento ───────────────────
//  · CONFIRM_EARLY_MINUTES: cuánto ANTES de la hora se habilita "Confirmar
//    asistencia" (GPS), para quien llega temprano al lugar.
//  · START_WINDOW_MINUTES: cuánto DESPUÉS de la hora aparece el botón
//    "Continuar" de la lista de confirmados (elegir moderador y leer reglas).
//    Durante ese conteo la tarjeta de espera explica que es para darle chance a
//    quien se haya retrasado, e invita a pedir algo mientras tanto.
//    OJO: el push y el correo de inicio (send-push-reminders /
//    send-email-reminders, bloque event_start) disparan a la hora del evento +
//    este mismo margen — si se cambia aquí, cambiarlo también allá.
const CONFIRM_EARLY_MINUTES = 15;
const START_WINDOW_MINUTES = 5;

// Distancia en metros entre dos coordenadas (fórmula de Haversine)
function distanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // radio de la Tierra en metros
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Only set notification handler on native platforms
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export default function DinamicaScreen() {
  const { user, loading: authLoading } = useSupabase();
  // CACHE POR USUARIO: la caché de la dinámica se guarda con una clave atada al
  // id de la cuenta logueada. Antes era una clave global ('cache_dinamica'), así
  // que en un mismo dispositivo/navegador una cuenta podía HEREDAR el evento
  // cacheado de la cuenta anterior (p.ej. alguien no inscrito veía la dinámica
  // en vivo). Con la clave por usuario, cada cuenta solo ve lo suyo.
  const CACHE_KEY = `cache_dinamica_${user?.id ?? 'anon'}`;
  const router = useRouter();

  // Limpieza única de la caché global vieja: si quedó guardado el evento de otra
  // cuenta con la clave antigua, lo borramos para que no se herede.
  useEffect(() => {
    clearCached(CACHE_KEY_LEGACY);
  }, []);
  const [loading, setLoading] = useState(true);
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  // Arranca en "infinito" (aun sin calcular) y no en 0: si arrancara en 0, el
  // primer render creeria que ya es hora de iniciar y mostraria por un segundo
  // el aviso de "faltan companeros" antes de calcular el tiempo real (flash).
  const [countdown, setCountdown] = useState<number>(Number.MAX_SAFE_INTEGER);
  const [countdownDisplay, setCountdownDisplay] = useState<string>('');
  const [isEventDay, setIsEventDay] = useState(false);
  const [checkInPhase, setCheckInPhase] = useState<CheckInPhase>('waiting');
  const [startingExperience, setStartingExperience] = useState(false);
  const [checkingGps, setCheckingGps] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [loadError, setLoadError] = useState(false);

  const [activeParticipants, setActiveParticipants] = useState<Participant[]>([]);
  const [gamePhase, setGamePhase] = useState<string>('intro');

  // Cuantas preguntas tiene cargadas ESTE evento por nivel (para mostrarlo en
  // la pantalla de reglas). null mientras carga o si no se pudo saber.
  const [questionsPerLevel, setQuestionsPerLevel] = useState<{ divertido: number; sensual: number; atrevido: number } | null>(null);

  // Moderador de la dinámica (sincronizado por events.moderator_id). Desde el
  // paso "elegir moderador", solo él avanza reglas/preguntas; el resto espera.
  const [moderatorId, setModeratorId] = useState<string | null>(null);

  // Paso INDIVIDUAL de la lista de confirmados a la pantalla de elegir
  // moderador: cada quien pasa cuando presiona "Continuar" (se persiste para
  // sobrevivir refrescos). Desde el moderador en adelante el flujo es compartido.
  const [wentToChooseModerator, setWentToChooseModerator] = useState(false);

  // Bandera local del moderador para arrancar el juego (dispara el reintento de
  // handleStartExperience). Solo la usa quien presiona "Comenzar".
  const [userReadyForGame, setUserReadyForGame] = useState(false);
  const [showDivertidoModal, setShowDivertidoModal] = useState(false);

  // Cache ref to avoid re-fetching on every focus
  const cacheRef = useRef<{ data: Appointment | null; timestamp: number } | null>(null);

  const checkIfEventDay = useCallback((startTime: string) => {
    const now = new Date();
    const eventDate = new Date(startTime);

    const isSameDay =
      now.getFullYear() === eventDate.getFullYear() &&
      now.getMonth() === eventDate.getMonth() &&
      now.getDate() === eventDate.getDate();

    const eventDayStart = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), 0, 0, 0, 0);
    const isAfterMidnight = now >= eventDayStart;
    const isToday = isSameDay && isAfterMidnight;
    setIsEventDay(isToday);
  }, []);

  const updateCountdown = useCallback((startTime: string) => {
    const now = new Date();
    const eventDate = new Date(startTime);

    const diffToEventTime = eventDate.getTime() - now.getTime();

    // Momento a partir del cual se habilita el botón "Continuar" de la lista de
    // confirmados (empezar a elegir moderador y leer las reglas). Hasta que
    // llegue, la pantalla muestra el conteo regresivo.
    const startWindowAt = new Date(startTime);
    startWindowAt.setMinutes(startWindowAt.getMinutes() + START_WINDOW_MINUTES);
    const diffToStartWindow = startWindowAt.getTime() - now.getTime();

    setCountdown(diffToStartWindow);

    // "Confirmar asistencia" se abre desde CONFIRM_EARLY_MINUTES antes de la
    // hora, para quien llega temprano al lugar (el GPS sigue exigiendo estar ahí).
    if (diffToEventTime <= CONFIRM_EARLY_MINUTES * 60 * 1000 && !appointment?.location_confirmed && checkInPhase === 'waiting') {
      setCheckInPhase('code_entry');
    }

    // El conteo grande apunta a la HORA PACTADA del evento (no a la hora + la
    // espera): la gente creía que ese tiempo era el plazo para confirmar.
    if (diffToEventTime <= 0) {
      setCountdownDisplay('¡Es la hora!');
      return;
    }

    const hours = Math.floor(diffToEventTime / (1000 * 60 * 60));
    const minutes = Math.floor((diffToEventTime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffToEventTime % (1000 * 60)) / 1000);

    const countdownText = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    setCountdownDisplay(countdownText);
  }, [appointment, checkInPhase]);

  const scheduleNotifications = useCallback(async (startTime: string) => {
    if (Platform.OS === 'web') return;
    try {
      const eventDate = new Date(startTime);
      const now = new Date();
      await Notifications.cancelAllScheduledNotificationsAsync();

      if (eventDate > now) {
        const sixHoursBefore = new Date(eventDate.getTime() - 6 * 60 * 60 * 1000);
        if (sixHoursBefore > now) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Tu experiencia Nospi está cerca',
              body: 'Faltan 6 horas para tu evento. ¡Prepárate!',
              sound: true,
            },
            trigger: { type: 'date', date: sixHoursBefore },
          });
        }

        const oneHourBefore = new Date(eventDate.getTime() - 60 * 60 * 1000);
        if (oneHourBefore > now) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Tu experiencia Nospi comienza pronto',
              body: 'Falta 1 hora.',
              sound: true,
            },
            trigger: { type: 'date', date: oneHourBefore },
          });
        }
      }
    } catch (error) {

    }
  }, []);

  const loadActiveParticipants = useCallback(async (eventId: string) => {
    try {
      const { data, error } = await supabase
        .rpc('get_event_participants_for_interaction', { p_event_id: eventId });

      if (error) {

        return;
      }

      const participants: Participant[] = (data || [])
        .filter((item: any) => item.user_name && item.confirmed === true)
        .map((item: any) => ({
          id: item.id,
          user_id: item.user_id,
          event_id: item.event_id,
          confirmed: item.confirmed,
          check_in_time: item.check_in_time,
          is_presented: item.is_presented || false,
          presented_at: item.presented_at || null,
          profiles: {
            id: item.user_id,
            name: item.user_name,
            email: item.user_email || '',
            phone: item.user_phone || '',
            city: item.user_city || '',
            profile_photo_url: item.user_profile_photo_url || null,
            interested_in: item.user_interested_in || '',
          },
        }));

      setActiveParticipants(participants);
    } catch (error) {

    }
  }, []);

  const applyAppointmentData = useCallback(async (apt: Appointment | null) => {
    setAppointment(apt);
    if (apt) {
      if (!apt.location_confirmed) {
        setCheckInPhase('code_entry');
        setGamePhase('intro');
      } else {
        // User already confirmed their code — it's definitely event day
        setIsEventDay(true);

        if (apt.event?.game_phase) {
          setGamePhase(apt.event.game_phase);
        }

        // El moderador y la fase de la dinámica viven en la fila events y se
        // sincronizan a toda la mesa por realtime.
        setModeratorId(apt.event?.moderator_id ?? null);

        // La confirmación de llegada (GPS) sí es por persona: se restaura de
        // AsyncStorage. Si no hay nada guardado pero location_confirmed es true,
        // se asume 'confirmed'.
        const [savedCheckInPhase, savedWentModerator] = await Promise.all([
          AsyncStorage.getItem(`nospi_checkInPhase_${apt.event_id}`),
          AsyncStorage.getItem(`nospi_wentModerator_${apt.event_id}`),
        ]);
        setWentToChooseModerator(savedWentModerator === 'true');
        const restoredCheckInPhase: CheckInPhase =
          savedCheckInPhase === 'confirmed' || savedCheckInPhase === 'code_entry' || savedCheckInPhase === 'waiting'
            ? (savedCheckInPhase as CheckInPhase)
            : 'confirmed';
        setCheckInPhase(restoredCheckInPhase);
      }
      if (apt.event?.start_time) checkIfEventDay(apt.event.start_time);
    }
  }, [checkIfEventDay]);

  const loadAppointment = useCallback(async () => {
    // Si la sesión todavía se está resolviendo (p. ej. justo después de un
    // refresh con mala señal), NO concluir todavía "no hay usuario" — eso
    // mostraba "No tienes ningún evento confirmado" de forma falsa aunque el
    // usuario sí tuviera una cita, solo porque el contexto de auth aún no
    // había terminado de leer la sesión guardada. Nos quedamos en loading y
    // este efecto se vuelve a disparar solo cuando authLoading pase a false.
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    // 1. Show in-memory cache instantly
    if (cacheRef.current) {
      applyAppointmentData(cacheRef.current.data);
      setLoading(false);
    } else {
      // 2. Try AsyncStorage for cross-session persistence
      const persisted = await getCached<Appointment | null>(CACHE_KEY);
      if (persisted !== null) {

        cacheRef.current = { data: persisted, timestamp: Date.now() };
        applyAppointmentData(persisted);
        setLoading(false);
      }
    }

    // 3. Always fetch fresh in background, con reintentos automaticos: si la
    // red falla (comun en un evento con muchos celulares en el mismo wifi),
    // no nos quedamos en silencio -- reintentamos unas veces antes de rendirnos,
    // y si aun asi falla, lo dejamos claro en pantalla con boton de reintentar
    // en vez de mostrar "No tienes ningun evento confirmado" (que seria falso
    // si en realidad si tiene un evento y solo fallo la conexion).
    const MAX_ATTEMPTS = 3;
    const RETRY_DELAY_MS = [800, 2000, 4000];
    let lastError: any = null;

    // FIX (asistentes que veian la pantalla vacia en pleno evento): si la
    // sesion guardada esta vencida o no se adjunta el token, la consulta a
    // appointments NO falla — devuelve 0 filas porque RLS filtra todo, y la
    // app concluia (falsamente) "no tienes ningun evento confirmado". Antes de
    // consultar, verificamos que haya sesion valida y, si no, la refrescamos.
    // Si aun asi no hay sesion, lo tratamos como error recuperable (boton de
    // reintentar), nunca como "sin eventos".
    let sessionOk = false;
    try {
      const { data: sessData } = await supabase.auth.getSession();
      let session = sessData?.session ?? null;
      const expMs = session?.expires_at ? session.expires_at * 1000 : 0;
      const aboutToExpire = expMs > 0 && expMs - Date.now() < 60 * 1000;
      if (!session || aboutToExpire) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        session = refreshed?.session ?? session;
      }
      sessionOk = !!session;
    } catch (_e) {
      sessionOk = false;
    }

    if (!sessionOk) {
      // Sin sesion utilizable: NO tocar la cache (podria tener la cita buena)
      // y mostrar el estado de error con reintento.
      setLoadError(true);
      setLoading(false);
      return;
    }

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const { data, error } = await supabase
          .from('appointments')
          .select(`
            id,
            event_id,
            arrival_status,
            checked_in_at,
            location_confirmed,
            status,
            event:events!inner (
              id,
              type,
              date,
              time,
              location,
              location_name,
              location_address,
              maps_link,
              is_location_revealed,
              address,
              start_time,
              max_participants,
              current_participants,
              status,
              game_phase,
              current_level,
              current_question_index,
              answered_users,
              current_question,
              event_status,
              moderator_id,
              latitude,
              longitude,
              radius_meters,
              require_gps_verification
            )
          `)
          .eq('user_id', user.id)
          .eq('status', 'confirmada')
          .eq('payment_status', 'completed')
          .order('created_at', { ascending: false });

        if (error) {
          lastError = error;
          // Token vencido a mitad de camino: refrescar la sesion antes del
          // siguiente intento (antes esto se confundia con "mala conexion").
          const msg = String(error.message || '').toLowerCase();
          if (msg.includes('jwt') || msg.includes('token') || (error as any).code === 'PGRST301') {
            try { await supabase.auth.refreshSession(); } catch (_e) { /* reintento normal */ }
          }
          if (attempt < MAX_ATTEMPTS - 1) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS[attempt]));
            continue;
          }
          break;
        }

        // Respuesta exitosa del servidor -- ya no estamos en estado de error.
        lastError = null;
        setLoadError(false);

        if (!data || data.length === 0) {
          // 0 filas con sesion validada NO siempre significa "no tiene eventos":
          // un parpadeo de token/RLS/replica en pleno evento (wifi saturado del
          // sitio) puede filtrar todo y devolver vacio. Si ya teniamos en cache
          // un evento de HOY, no cerrado, NO lo borramos — a alguien que esta
          // fisicamente en el evento no se le puede desaparecer el evento por un
          // parpadeo, ni dejarlo sin chat. Conservamos lo cacheado y se
          // reintenta en el proximo focus. Solo concluimos "sin eventos" (borrar
          // cache) cuando NO hay un evento de hoy protegido en cache.
          const cachedApt = cacheRef.current?.data;
          const cachedStart = cachedApt?.event?.start_time;
          const cachedIsClosed = cachedApt?.event?.event_status === 'closed' || cachedApt?.status === 'anterior';
          let cacheProtege = false;
          if (cachedStart && !cachedIsClosed) {
            const nowC = new Date();
            const ev = new Date(cachedStart);
            const todayStartC = new Date(nowC.getFullYear(), nowC.getMonth(), nowC.getDate()).getTime();
            const evDayStartC = new Date(ev.getFullYear(), ev.getMonth(), ev.getDate()).getTime();
            cacheProtege = evDayStartC === todayStartC;
          }
          if (cacheProtege) {
            // Mantener visible el evento de hoy que ya teniamos; no vaciar.
            applyAppointmentData(cachedApt!);
            setLoading(false);
            return;
          }
          cacheRef.current = { data: null, timestamp: Date.now() };
          setCached(CACHE_KEY, null);
          setAppointment(null);
          setLoading(false);
          return;
        }

        const now = new Date();

        const todayConfirmedAppointment = data.find(apt => {
          if (apt.status !== 'confirmada') return false;
          if (!apt.event?.start_time) return false;
          const eventDate = new Date(apt.event.start_time);
          const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const eventDayStart = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
          return eventDayStart.getTime() === todayStart.getTime();
        });

        const upcomingAppointment = data.find(apt => {
          if (apt.status !== 'confirmada') return false;
          if (!apt.event?.start_time) return false;
          const eventDate = new Date(apt.event.start_time);
          const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const eventDayStart = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
          return eventDayStart >= todayStart;
        });

        const appointmentData = todayConfirmedAppointment || upcomingAppointment || data[0];

        if (appointmentData.event?.event_status === 'closed' || appointmentData.status === 'anterior') {
          cacheRef.current = { data: null, timestamp: Date.now() };
          setCached(CACHE_KEY, null);
          setAppointment(null);
          setLoading(false);
          return;
        }

        const freshApt = appointmentData as any as Appointment;
        cacheRef.current = { data: freshApt, timestamp: Date.now() };
        setCached(CACHE_KEY, freshApt);
        applyAppointmentData(freshApt);

        if (freshApt.event?.start_time) {
          scheduleNotifications(freshApt.event.start_time);
        }

        if (freshApt.event_id) {
          loadActiveParticipants(freshApt.event_id);
        }

        setLoading(false);
        return;
      } catch (err) {
        lastError = err;
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS[attempt]));
          continue;
        }
      }
    }

    // Los reintentos se agotaron. Si ya teniamos una cita cargada (de cache),
    // la dejamos tal cual en vez de borrarla -- mejor mostrar datos un poco
    // viejos que nada. Si nunca cargamos nada, mostramos el estado de error
    // real en vez del mensaje enganoso de "no tienes evento".
    if (lastError && !cacheRef.current?.data) {
      setLoadError(true);
    }
    setLoading(false);
  }, [user, authLoading, applyAppointmentData, scheduleNotifications, loadActiveParticipants]);

  // Si nos quedamos sin poder cargar la cita (ej. wifi saturado en el evento),
  // reintentamos solos cada 8s en segundo plano -- no todo el mundo sabe que
  // salir y volver a la pestana Dinamica fuerza un reintento.
  useEffect(() => {
    if (!loadError) return;
    const intervalId = setInterval(() => {
      loadAppointment();
    }, 8000);
    return () => clearInterval(intervalId);
  }, [loadError, loadAppointment]);

  // Obtiene la posición GPS actual del dispositivo, funcionando tanto en web
  // (navigator.geolocation) como en nativo (expo-location).
  const getCurrentGpsPosition = useCallback(async (): Promise<{ latitude: number; longitude: number } | null> => {
    if (Platform.OS === 'web') {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        setGpsError('Tu navegador no soporta ubicación GPS.');
        return null;
      }
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
          (err) => {
            if (err.code === 1) {
              setGpsError('Debes permitir el acceso a tu ubicación para confirmar tu llegada.');
            } else {
              setGpsError('No se pudo obtener tu ubicación. Intenta de nuevo.');
            }
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      });
    }

    try {
      const Location = require('expo-location');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGpsError('Debes permitir el acceso a tu ubicación para confirmar tu llegada.');
        return null;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch (error) {
      setGpsError('No se pudo obtener tu ubicación. Intenta de nuevo.');
      return null;
    }
  }, []);

  // Confirma la llegada solo si el GPS del dispositivo coincide con el del
  // evento dentro del radio permitido (por defecto 150 metros). Si el admin
  // desactivó la verificación GPS para este evento (require_gps_verification
  // === false), se confirma directo sin pedir ni comparar ubicación.
  const confirmArrival = useCallback(async () => {
    if (!appointment || !user || checkingGps) return;

    setGpsError('');

    const gpsVerificationRequired = appointment.event.require_gps_verification !== false;

    if (gpsVerificationRequired) {
      const eventLat = appointment.event.latitude;
      const eventLng = appointment.event.longitude;

      if (eventLat === null || eventLat === undefined || eventLng === null || eventLng === undefined) {
        setGpsError('La ubicación del evento aún no está configurada. Contacta a soporte por WhatsApp.');
        return;
      }

      setCheckingGps(true);
      const currentPosition = await getCurrentGpsPosition();
      setCheckingGps(false);

      if (!currentPosition) {
        // getCurrentGpsPosition ya dejó el mensaje de error correspondiente
        return;
      }

      const allowedRadius = appointment.event.radius_meters ?? DEFAULT_GPS_RADIUS_METERS;
      const distance = distanceInMeters(currentPosition.latitude, currentPosition.longitude, eventLat, eventLng);

      if (distance > allowedRadius) {
        const distanceRounded = Math.round(distance);
        setGpsError(`Debes estar en el lugar del evento para confirmar tu llegada. Estás a ${distanceRounded} m.`);
        return;
      }
    }

    try {
      const confirmedAt = new Date().toISOString();

      setCheckInPhase('confirmed');
      setGpsError('');
      if (appointment.event_id) {
        AsyncStorage.setItem(`nospi_checkInPhase_${appointment.event_id}`, 'confirmed');
      }

      setAppointment(prev => ({
        ...prev!,
        arrival_status: 'on_time',
        checked_in_at: confirmedAt,
        location_confirmed: true,
      }));

      if (appointment.event?.game_phase) {
        setGamePhase(appointment.event.game_phase);
      }

      const { error: updateError } = await supabase
        .from('event_participants')
        .upsert({
          event_id: appointment.event_id,
          user_id: user.id,
          confirmed: true,
          check_in_time: confirmedAt,
          is_presented: true,
          presented_at: confirmedAt,
        }, {
          onConflict: 'event_id,user_id',
        });

      if (updateError) {

        setCheckInPhase('code_entry');
        setGpsError('No se pudo registrar tu llegada.');
        return;
      }

      await supabase
        .from('appointments')
        .update({
          arrival_status: 'on_time',
          checked_in_at: confirmedAt,
          location_confirmed: true,
        })
        .eq('id', appointment.id);

      // Invalidate cache after check-in
      cacheRef.current = null;
      clearCached(CACHE_KEY);
      loadActiveParticipants(appointment.event_id);
    } catch (error) {

      setCheckInPhase('code_entry');
      setGpsError('Ocurrió un error.');
    }
  }, [appointment, user, checkingGps, getCurrentGpsPosition, loadActiveParticipants]);

  const handleCodeConfirmation = useCallback(async () => {
    await confirmArrival();
  }, [confirmArrival]);

  const handleStartExperience = useCallback(async () => {
    if (!appointment?.event_id || startingExperience) return;

    if (gamePhase === 'questions' || gamePhase === 'question_active' || gamePhase === 'level_transition' || gamePhase === 'finished' || gamePhase === 'free_phase') {
      return;
    }

    if (activeParticipants.length < 2) return;


    setStartingExperience(true);

    try {
      // ————————————————————————————————————————————————————————————————
      // CANDADO ANTI-REINICIO (multi-persona):
      // Antes de "arrancar" la dinámica, confirmamos contra la BASE DE DATOS
      // (no contra el estado local de ESTE teléfono) si el juego de verdad ya
      // empezó. Sin esto, un teléfono que se quedó desincronizado —perdió el
      // aviso en tiempo real, minimizó la app, o reentró a la pestaña de
      // dinámica— creía que el juego no había arrancado y, por el reintento
      // automático cada 3s, volvía a escribir "pregunta 0 / Divertido",
      // devolviendo a TODA la mesa a la primera pregunta una y otra vez.
      // Ahora, si la BD dice que ya arrancó, solo re-sincronizamos este
      // teléfono con el estado real y salimos SIN reiniciar a nadie.
      const { data: currentEvent } = await supabase
        .from('events')
        .select('game_phase, current_question_index')
        .eq('id', appointment.event_id)
        .maybeSingle();

      const yaArrancoEnBD =
        !!currentEvent &&
        (
          currentEvent.game_phase === 'questions' ||
          currentEvent.game_phase === 'question_active' ||
          currentEvent.game_phase === 'level_transition' ||
          currentEvent.game_phase === 'finished' ||
          currentEvent.game_phase === 'free_phase' ||
          (typeof currentEvent.current_question_index === 'number' && currentEvent.current_question_index > 0)
        );

      if (yaArrancoEnBD) {
        // Auto-curación: este teléfono estaba desincronizado. Lo movemos a la
        // fase real para que deje de reintentar el arranque y muestre la
        // dinámica donde va la mesa, sin tocar el estado compartido.
        if (currentEvent.game_phase) {
          setGamePhase(currentEvent.game_phase);
        }
        setStartingExperience(false);
        return;
      }

      let firstQuestion = '¿Cuál es tu nombre y a qué te dedicas?';
      try {
        // El orden lo manda question_order a secas: el sorteo del admin ya
        // deja cada pregunta fijada en su POSICIÓN elegida (puede no ser la
        // primera), así que forzar is_pinned de primera rompería ese orden.
        const { data: eventFirstQuestion } = await supabase
          .from('event_questions')
          .select('question_text')
          .eq('event_id', appointment.event_id)
          .eq('level', 'divertido')
          .order('question_order', { ascending: true })
          .limit(1);

        if (eventFirstQuestion && eventFirstQuestion.length > 0) {
          firstQuestion = eventFirstQuestion[0].question_text;
        } else {
          const { data: defaultFirstQuestion } = await supabase
            .from('event_questions')
            .select('question_text')
            .is('event_id', null)
            .eq('level', 'divertido')
            .order('question_order', { ascending: true })
            .limit(1);

          if (defaultFirstQuestion && defaultFirstQuestion.length > 0) {
            firstQuestion = defaultFirstQuestion[0].question_text;
          }
        }
      } catch (questionLoadError) {

      }

      setGamePhase('questions');

      const { error } = await supabase
        .from('events')
        .update({
          game_phase: 'questions',
          current_level: 'divertido',
          current_question_index: 0,
          answered_users: [],
          current_question: firstQuestion,
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointment.event_id);

      if (error) {

        setGamePhase('intro');
        setStartingExperience(false);
        return;
      }
    } catch (error) {

      setGamePhase('intro');
      setStartingExperience(false);
    } finally {
      setTimeout(() => {
        setStartingExperience(false);
      }, 1000);
    }
  }, [appointment, activeParticipants, startingExperience, gamePhase]);

  const appointmentId = appointment?.id ?? null;
  const appointmentEventId = appointment?.event_id ?? null;

  useEffect(() => {
    if (!appointmentEventId || !appointmentId || !user) return;

    const eventChannelName = `event_state_${appointmentEventId}`;
    const appointmentChannelName = `appointment_${appointmentId}`;

    // Always remove any existing channels with these names before creating new ones
    const staleEventChannel = supabase.getChannels().find(c => c.topic === `realtime:${eventChannelName}`);
    if (staleEventChannel) supabase.removeChannel(staleEventChannel);
    const staleAppointmentChannel = supabase.getChannels().find(c => c.topic === `realtime:${appointmentChannelName}`);
    if (staleAppointmentChannel) supabase.removeChannel(staleAppointmentChannel);

    const eventChannel = supabase
      .channel(eventChannelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'events',
          filter: `id=eq.${appointmentEventId}`,
        },
        (payload) => {
          const newEvent = payload.new as any;

          if (newEvent.event_status === 'closed') {
            setAppointment(null);
            cacheRef.current = null;
            clearCached(CACHE_KEY);
            return;
          }

          setAppointment(prev => {
            if (!prev) return prev;
            const updatedAppointment = {
              ...prev,
              event: {
                ...prev.event,
                game_phase: newEvent.game_phase,
                current_level: newEvent.current_level,
                current_question_index: newEvent.current_question_index,
                answered_users: newEvent.answered_users,
                current_question: newEvent.current_question,
                event_status: newEvent.event_status,
                moderator_id: newEvent.moderator_id ?? null,
              },
            };

            // Moderador vigente (elegido o cambiado durante la dinámica).
            setModeratorId(newEvent.moderator_id ?? null);

            if (prev.location_confirmed && newEvent.game_phase) {
              setGamePhase(newEvent.game_phase);
            }

            // Persistir la fase actualizada: sin esto, la cache guardaba la
            // fase VIEJA y un refresh pintaba primero la pantalla equivocada
            // (flash feo) antes de corregirse con el fetch fresco.
            cacheRef.current = { data: updatedAppointment, timestamp: Date.now() };
            setCached(CACHE_KEY, updatedAppointment);

            return updatedAppointment;
          });
        }
      )
      .subscribe();

    const appointmentChannel = supabase
      .channel(appointmentChannelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'appointments',
          filter: `id=eq.${appointmentId}`,
        },
        (payload) => {
          const newAppointment = payload.new as any;
          if (newAppointment.status === 'anterior') {
            setAppointment(null);
            cacheRef.current = null;
            clearCached(CACHE_KEY);
            setLoading(false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(eventChannel);
      supabase.removeChannel(appointmentChannel);
    };
  }, [appointmentEventId, appointmentId, user]);

  useFocusEffect(
    useCallback(() => {
      // Todavía resolviendo la sesión (refresh reciente, red lenta) — esperar
      // en vez de concluir "no hay usuario". Este efecto se vuelve a disparar
      // solo con que authLoading cambie a false, sin necesidad de otro focus.
      if (authLoading) return;

      if (!user?.id) {
        setLoading(false);
        return;
      }
      loadAppointment();
    }, [user?.id, authLoading, loadAppointment])
  );

  useEffect(() => {
    if (appointment && appointment.event.start_time) {
      const interval = setInterval(() => {
        updateCountdown(appointment.event.start_time!);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [appointment, updateCountdown]);

  useEffect(() => {
    if (!appointmentEventId || !user) return;

    loadActiveParticipants(appointmentEventId);

    const channelName = `participants_${appointmentEventId}`;
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);
    if (existing) {
      supabase.removeChannel(existing);
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_participants',
          filter: `event_id=eq.${appointmentEventId}`,
        },
        () => {
          loadActiveParticipants(appointmentEventId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [appointmentEventId, user, loadActiveParticipants]);

  // Carga el numero de preguntas por nivel del evento (con fallback al banco
  // global, igual que hace el juego) para mostrarlo en las reglas.
  useEffect(() => {
    const eventId = appointment?.event_id;
    if (!eventId) { setQuestionsPerLevel(null); return; }
    let cancelled = false;
    (async () => {
      try {
        let { data } = await supabase
          .from('event_questions')
          .select('level')
          .eq('event_id', eventId);
        if (!data || data.length === 0) {
          const g = await supabase.from('event_questions').select('level').is('event_id', null);
          data = g.data;
        }
        if (cancelled || !data) return;
        const counts = { divertido: 0, sensual: 0, atrevido: 0 } as any;
        for (const q of data) if (counts[q.level] !== undefined) counts[q.level]++;
        setQuestionsPerLevel(counts);
      } catch (_e) { /* si falla, las reglas muestran el texto sin numeros */ }
    })();
    return () => { cancelled = true; };
  }, [appointment?.event_id]);

  // Con 1 solo confirmado ya se puede AVANZAR (ver reglas); las preguntas
  // como tal siguen exigiendo minimo 2 (guard en handleStartExperience) y
  // arrancan solas cuando confirma el segundo (retry de 3s mas realtime).
  const canStartExperience = countdown <= 0 && activeParticipants.length >= 1;

  // Conteo mm:ss que muestra la tarjeta de espera mientras no se abre el botón
  // "Continuar". Se refresca solo: el interval del countdown corre cada segundo.
  const waitMinutes = Math.max(0, Math.floor(countdown / 60000));
  const waitSeconds = Math.max(0, Math.floor((countdown % 60000) / 1000));
  const waitCountdownText = `${String(waitMinutes).padStart(2, '0')}:${String(waitSeconds).padStart(2, '0')}`;

  // ── Moderador (derivados para el render) ────────────────────────────────────
  const isModerator = !!user?.id && !!moderatorId && user.id === moderatorId;
  const moderatorName = moderatorId
    ? (activeParticipants.find(p => p.user_id === moderatorId)?.profiles?.name || 'el moderador')
    : null;
  // Fases en las que la dinámica ya arrancó (todos entran a la pantalla de juego).
  // OJO: debe incluir TODAS las fases que escribe GameDynamicsScreen — si falta
  // una (p. ej. 'closing_intro'), al llegar esa fase el juego se DESMONTA y la
  // mesa cae de vuelta a las pantallas previas.
  const gameStarted =
    gamePhase === 'questions' || gamePhase === 'question_active' ||
    gamePhase === 'level_transition' || gamePhase === 'closing_intro' ||
    gamePhase === 'finished' || gamePhase === 'free_phase';

  // ── Flujo del moderador (sincronizado por la fila events) ───────────────────

  // Confirmados → "Continuar": paso INDIVIDUAL. Solo mueve a ESTA persona a la
  // pantalla de elegir moderador; el resto sigue en su lista hasta que cada
  // quien presione. El flujo vuelve a ser compartido desde el moderador.
  const handleGoToChooseModerator = useCallback(() => {
    if (!appointment?.event_id) return;
    setWentToChooseModerator(true);
    AsyncStorage.setItem(`nospi_wentModerator_${appointment.event_id}`, 'true');
  }, [appointment?.event_id]);

  // "← Volver a la lista" desde la pantalla de elegir moderador: regresa a la
  // lista de confirmados (para seguir viendo quién llega). Es local a este
  // teléfono; cuando el moderador pase a las reglas, la fase compartida lo trae
  // de vuelta al flujo sin que se pierda nada.
  const handleBackToConfirmedList = useCallback(() => {
    if (!appointment?.event_id) return;
    setWentToChooseModerator(false);
    AsyncStorage.removeItem(`nospi_wentModerator_${appointment.event_id}`);
  }, [appointment?.event_id]);

  // "Quiero ser el moderador": primero en postularse queda. El candado
  // `is('moderator_id', null)` evita que dos toques casi simultáneos se pisen;
  // si otro llegó primero, se lee el moderador real (realtime también corrige).
  const handleBecomeModerator = useCallback(async () => {
    if (!appointment?.event_id || !user?.id) return;
    // Feedback INMEDIATO: la pantalla pasa a "eres el moderador" ya. Antes se
    // esperaba la respuesta de la red y, con senal lenta (o el fetch colgado
    // tras volver del background en Android), el boton parecia muerto. Si otra
    // persona gano la carrera, abajo (o el sondeo de 4s) lo corrige.
    setModeratorId(user.id);
    try {
      const { data, error } = await supabase
        .from('events')
        .update({ moderator_id: user.id, updated_at: new Date().toISOString() })
        .eq('id', appointment.event_id)
        .is('moderator_id', null)
        .select('moderator_id');
      if (error) {
        console.error('❌ Error postulándose como moderador:', error);
        setModeratorId(null); // revertir; el sondeo trae el estado real
        return;
      }
      if (!data || data.length === 0) {
        // Otro se postulo primero: mostrar al moderador real.
        const { data: row } = await supabase
          .from('events')
          .select('moderator_id')
          .eq('id', appointment.event_id)
          .maybeSingle();
        if (row?.moderator_id) setModeratorId(row.moderator_id);
      }
    } catch (e) {
      console.error('❌ Error postulándose como moderador:', e);
      setModeratorId(null);
    }
  }, [appointment?.event_id, user?.id]);

  // Moderador elegido → "Continuar": pasa la mesa a la pantalla de reglas.
  const handleModeratorContinueToRules = useCallback(async () => {
    if (!appointment?.event_id) return;
    const prevPhase = gamePhase;
    setGamePhase('rules');
    const { error } = await supabase
      .from('events')
      .update({ game_phase: 'rules', updated_at: new Date().toISOString() })
      .eq('id', appointment.event_id);
    if (error) {
      console.error('❌ Error pasando a reglas:', error);
      setGamePhase(prevPhase); // no dejar la pantalla en una fase que la BD no guardó
    }
  }, [appointment?.event_id, gamePhase]);

  // Modal "Comenzar" SIN animaciones: se muestra fijo ~2s y se cierra por
  // temporizador, y ahi mismo se marca userReadyForGame (el arranque real del
  // juego). Las versiones animadas dejaban el velo pegado si un callback no
  // disparaba, y el juego no arrancaba. Estatico es estable en iOS/Android/web.
  const divertidoTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { divertidoTimersRef.current.forEach(clearTimeout); }, []);

  const showDivertidoModalAnimation = useCallback(() => {
    setShowDivertidoModal(true);
    divertidoTimersRef.current.push(setTimeout(() => {
      setShowDivertidoModal(false);
      setUserReadyForGame(true);
    }, 2200));
  }, []);

  // Solo el moderador marca userReadyForGame (al presionar "Comenzar" en las
  // reglas). Mientras siga listo y la dinámica no haya arrancado, reintentamos
  // handleStartExperience cada 3s: es seguro de llamar de más (sale solo si ya
  // arrancó o si aún no hay 2 confirmados), y cierra el hueco de que
  // activeParticipants aún no reflejara a todos por el retraso del realtime.
  useEffect(() => {
    if (!userReadyForGame) return;
    const yaArranco = gamePhase === 'questions' || gamePhase === 'question_active' || gamePhase === 'level_transition' || gamePhase === 'finished' || gamePhase === 'free_phase';
    if (yaArranco) return;

    handleStartExperience();
    const retryInterval = setInterval(() => {
      handleStartExperience();
    }, 3000);

    return () => clearInterval(retryInterval);
  }, [userReadyForGame, gamePhase, handleStartExperience]);

  // Red de seguridad de la pre-partida: además del realtime, un sondeo liviano
  // cada 4s mantiene sincronizados fase y moderador mientras la mesa está entre
  // "confirmado" y el arranque del juego (cubre avisos realtime perdidos por
  // red móvil inestable). Se detiene solo al entrar a las preguntas.
  useEffect(() => {
    if (!appointmentEventId || checkInPhase !== 'confirmed' || gameStarted) return;

    const pollInterval = setInterval(async () => {
      const { data } = await supabase
        .from('events')
        .select('game_phase, moderator_id')
        .eq('id', appointmentEventId)
        .maybeSingle();
      if (!data) return;
      setModeratorId(data.moderator_id ?? null);
      if (data.game_phase) setGamePhase(data.game_phase);
    }, 4000);

    return () => clearInterval(pollInterval);
  }, [appointmentEventId, checkInPhase, gameStarted]);

  const handleFinishGame = useCallback(async () => {

    if (appointment?.event_id) {
      await Promise.all([
        AsyncStorage.removeItem(`nospi_checkInPhase_${appointment.event_id}`),
        AsyncStorage.removeItem(`nospi_wentModerator_${appointment.event_id}`),
      ]);
    }
    setAppointment(null);
    cacheRef.current = null;
    clearCached(CACHE_KEY);
    router.replace('/(tabs)/appointments');
  }, [router, appointment?.event_id]);

  if (loading) {
    return (
      <LinearGradient
        colors={['#1a0010', '#880E4F', '#AD1457']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <SkeletonBox height={32} width="70%" borderRadius={8} style={{ marginBottom: 10, marginTop: 48 }} />
          <SkeletonBox height={18} width="50%" borderRadius={6} style={{ marginBottom: 24 }} />
          <View style={styles.skeletonCard}>
            <SkeletonBox height={20} width="60%" borderRadius={6} style={{ marginBottom: 12 }} />
            <SkeletonBox height={52} width="80%" borderRadius={8} style={{ alignSelf: 'center', marginBottom: 8 }} />
          </View>
          <View style={styles.skeletonCard}>
            <SkeletonBox height={20} width="50%" borderRadius={6} style={{ marginBottom: 12 }} />
            <SkeletonBox height={16} width="90%" borderRadius={6} style={{ marginBottom: 8 }} />
            <SkeletonBox height={16} width="70%" borderRadius={6} />
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  if (!appointment) {
    return (
      <LinearGradient
        colors={['#1a0010', '#880E4F', '#AD1457']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.title}>Dinámica</Text>
          <Text style={styles.subtitle}>Centro de experiencia del evento</Text>

          <View style={styles.placeholderContainer}>
            <Text style={styles.placeholderIcon}>{loadError ? '⚠️' : '📅'}</Text>
            <Text style={styles.placeholderText}>
              {loadError
                ? 'No pudimos cargar tu evento. Revisa tu conexión e intenta de nuevo.'
                : 'No tienes ningún evento confirmado'}
            </Text>
            {loadError && (
              <TouchableOpacity
                style={[styles.confirmCodeButton, { marginTop: 20 }]}
                onPress={() => { setLoading(true); loadAppointment(); }}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmCodeButtonText}>Reintentar</Text>
              </TouchableOpacity>
            )}
            {!loadError && user?.email && (
              <View style={styles.sessionInfoContainer}>
                <Text style={styles.sessionInfoText}>Sesión iniciada como: {user.email}</Text>
                <TouchableOpacity
                  onPress={async () => {
                    try { await supabase.auth.signOut({ scope: 'local' }); } catch (_) {}
                    router.replace('/welcome');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.sessionSignOutText}>¿No es tu cuenta? Cerrar sesión</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  if (!isEventDay) {
    const eventDate = new Date(appointment.event.start_time!);
    const eventDateText = eventDate.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const now = new Date();
    const diffMs = eventDate.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    let countdownText = '';
    if (diffDays >= 2) {
      countdownText = `Faltan ${diffDays} días para tu experiencia`;
    } else if (diffDays === 1) {
      countdownText = 'Falta 1 día para tu experiencia';
    } else if (diffHours >= 1) {
      countdownText = `Faltan ${diffHours} horas para tu experiencia`;
    } else {
      countdownText = '¡Tu experiencia es muy pronto!';
    }

    return (
      <LinearGradient
        colors={['#1a0010', '#880E4F', '#AD1457']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
          <Text style={styles.title}>Tu Evento Nospi</Text>
          <Text style={styles.subtitle}>¡Se acerca una gran experiencia!</Text>

          <View style={[styles.eventInfoCard, { marginBottom: 16 }]}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🗓️</Text>
            <Text style={[styles.eventInfoTitle, { fontSize: 22, marginBottom: 6 }]}>{countdownText}</Text>
            <Text style={styles.eventInfoDate}>{eventDateText}</Text>
            <Text style={styles.eventInfoTime}>{formatTimeAmPm(appointment.event.time)}</Text>
          </View>

          <View style={styles.preEventTipCard}>
            <Text style={styles.preEventTipIcon}>⏰</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.preEventTipTitle}>Llega puntual</Text>
              <Text style={styles.preEventTipText}>El evento arranca con una dinámica para romper el hielo. No querrás perderte el inicio.</Text>
            </View>
          </View>

          <View style={styles.preEventTipCard}>
            <Text style={styles.preEventTipIcon}>✅</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.preEventTipTitle}>Confirma tu asistencia</Text>
              <Text style={styles.preEventTipText}>Ya en el lugar, abre esta pestaña y confirma tu asistencia para registrar tu llegada. Si no confirmas, <Text style={styles.preEventTipStrong}>puede figurar como falta</Text> y tu cuenta podría ser suspendida.</Text>
            </View>
          </View>

          <View style={styles.preEventTipCard}>
            <Text style={styles.preEventTipIcon}>💘</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.preEventTipTitle}>Lo mejor es al final</Text>
              <Text style={styles.preEventTipText}>Al terminar te aparecerán los nombres de todas las personas y, si quieres, eliges con quién sentiste conexión. Nadie sabrá a quién elegiste; solo si es <Text style={styles.preEventTipStrong}>mutuo</Text>, ambos se enteran.</Text>
            </View>
          </View>

          <TouchableOpacity onPress={() => Linking.openURL('https://nospi.co/#politica')} style={styles.policyLinkWrap}>
            <Text style={styles.policyLinkText}>📋 Ver la política de asistencia</Text>
          </TouchableOpacity>
        </ScrollView>
      </LinearGradient>
    );
  }

  // La dinámica ya arrancó (el moderador la inició): todos entran al juego.
  if (gameStarted && checkInPhase === 'confirmed') {
    const transformedParticipants = activeParticipants.map(p => ({
      id: p.id,
      user_id: p.user_id,
      name: p.profiles?.name || 'Participante',
      profile_photo_url: p.profiles?.profile_photo_url || null,
      occupation: p.profiles?.city || 'Ciudad',
      confirmed: p.confirmed,
      check_in_time: p.check_in_time,
      presented: p.is_presented,
    }));

    return <GameDynamicsScreen appointment={appointment} activeParticipants={transformedParticipants} onFinish={handleFinishGame} />;
  }

  // Paso "elegir moderador": se entra INDIVIDUALMENTE (cada quien con su
  // "Continuar" de la lista de confirmados). Mientras nadie se postula se ve la
  // postulación (card 2); apenas hay moderador, "moderador elegido" (card 3) —
  // el moderador continúa por todos, el resto espera. Si el moderador ya pasó a
  // reglas (gamePhase 'rules'), esa rama va primero y arrastra a todos.
  if (wentToChooseModerator && gamePhase !== 'rules' && checkInPhase === 'confirmed') {
    return (
      <LinearGradient
        colors={['#1a0010', '#880E4F', '#AD1457']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={[styles.contentContainer, { alignItems: 'center', justifyContent: 'center', flexGrow: 1 }]}>
          {!moderatorId ? (
            <>
              <Text style={styles.rulesTitle}>¿Quién será el moderador?</Text>
              <View style={styles.modRoleCard}>
                <View style={styles.modRoleRow}>
                  <Text style={styles.modRoleEmoji}>🗣️</Text>
                  <Text style={styles.modRoleText}>El moderador debe leer las preguntas en voz alta y es quien pasa a la siguiente pregunta.</Text>
                </View>
                <View style={styles.modRoleDivider} />
                <View style={styles.modRoleRow}>
                  <Text style={styles.modRoleEmoji}>🔄</Text>
                  <Text style={styles.modRoleText}>El moderador se puede cambiar por otro en cualquier parte de la dinámica.</Text>
                </View>
              </View>
              <TouchableOpacity style={[styles.comenzarButton, styles.becomeModBtn]} onPress={handleBecomeModerator} activeOpacity={0.85}>
                <Text style={styles.becomeModBtnText} numberOfLines={1}>🙋 Quiero ser el moderador</Text>
              </TouchableOpacity>
              <View style={styles.modFirstTag}>
                <Text style={styles.modFirstTagText}>El primero que se postule queda</Text>
              </View>
              {/* Volver a la lista: para quien entró por curiosidad y no quiere
                  ser moderador (puede seguir viendo quién va llegando). Es un
                  paso local: no afecta a la mesa, y si el moderador arranca las
                  reglas igual lo trae de vuelta al flujo. */}
              <TouchableOpacity onPress={handleBackToConfirmedList} activeOpacity={0.7}>
                <Text style={styles.modBackLink}>← Volver a la lista</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.modChosenCard}>
                <View style={styles.modChosenAvatar}>
                  <Text style={styles.modChosenAvatarText}>{(moderatorName || '?').charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.modChosenName}>{moderatorName}</Text>
                <View style={styles.modChosenRole}><Text style={styles.modChosenRoleText}>Moderador</Text></View>
              </View>

              {isModerator ? (
                <>
                  <Text style={styles.rulesTitle}>¡Tú eres el moderador! 🎉</Text>
                  <View style={styles.modVoice}>
                    <Text style={styles.modVoiceEmoji}>🗣️</Text>
                    <Text style={styles.modVoiceText}>De aquí en adelante, lee todo en voz alta para que todos entiendan la dinámica. Tú eres quien pasa a la siguiente pantalla y pregunta.</Text>
                  </View>
                  <TouchableOpacity style={styles.comenzarButton} onPress={handleModeratorContinueToRules} activeOpacity={0.85}>
                    <Text style={styles.comenzarButtonText}>Continuar</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.rulesTitle}>Moderador de la mesa</Text>
                  <View style={styles.modVoiceOth}>
                    <Text style={styles.modVoiceOthText}>🗣️ {moderatorName} irá leyendo todo en voz alta. Escuchen para entender la dinámica.</Text>
                  </View>
                  <View style={styles.modWait}>
                    <Text style={styles.modWaitText}>⏳ Espera a que {moderatorName} continúe</Text>
                  </View>
                </>
              )}
            </>
          )}
        </ScrollView>
      </LinearGradient>
    );
  }

  // Reglas (card 4): solo el moderador ve "Comenzar"; el resto espera.
  if (gamePhase === 'rules' && checkInPhase === 'confirmed') {
    // Texto del primer punto de las reglas, con el numero real de preguntas
    // cargadas en ESTE evento. Si los 3 niveles tienen la misma cantidad se
    // resume ("con 8 preguntas cada uno"); si difieren, se detalla por nivel;
    // si aun no se conoce, se muestra el texto sin numeros.
    let nivelesText = 'Pasarán por 3 niveles: Divertido, Coqueto y Atrevido.';
    if (questionsPerLevel) {
      const { divertido: d, sensual: s, atrevido: a } = questionsPerLevel;
      if (d > 0 && d === s && s === a) {
        nivelesText = `Pasarán por 3 niveles — Divertido, Coqueto y Atrevido — con ${d} preguntas cada uno.`;
      } else if (d + s + a > 0) {
        nivelesText = `Pasarán por 3 niveles: Divertido (${d} preguntas), Coqueto (${s}) y Atrevido (${a}).`;
      }
    }
    return (
      <LinearGradient
        colors={['#1a0010', '#880E4F', '#AD1457']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={[styles.contentContainer, { alignItems: 'center', justifyContent: 'center', paddingTop: 60 }]}>
          <Text style={styles.rulesIcon}>🎲</Text>
          <Text style={styles.rulesTitle}>¿Cómo funciona?</Text>

          {isModerator && (
            <View style={styles.modVoice}>
              <Text style={styles.modVoiceEmoji}>🗣️</Text>
              <Text style={styles.modVoiceText}>Léelo en voz alta para el grupo.</Text>
            </View>
          )}

          <View style={styles.rulesCard}>
            <View style={styles.rulesRow}>
              <Text style={styles.rulesEmoji}>🎯</Text>
              <Text style={styles.rulesText}>{nivelesText}</Text>
            </View>
            <View style={styles.rulesDivider} />
            <View style={styles.rulesRow}>
              <Text style={styles.rulesEmoji}>👥</Text>
              <Text style={styles.rulesText}>En cada pregunta responde quien tenga algo que contar; no es obligatorio para todos.</Text>
            </View>
            <View style={styles.rulesDivider} />
            <View style={styles.rulesRow}>
              <Text style={styles.rulesEmoji}>💘</Text>
              <Text style={styles.rulesText}>Lo mejor es al final: al terminar las preguntas, si quieres, puedes elegir con quién sentiste conexión. Nadie sabrá a quién elegiste y, si es mutuo, se abre un chat privado.</Text>
            </View>
          </View>

          {isModerator ? (
            <TouchableOpacity
              style={styles.comenzarButton}
              onPress={showDivertidoModalAnimation}
              activeOpacity={0.85}
            >
              <Text style={styles.comenzarButtonText}>Comenzar</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.modWait}>
              <Text style={styles.modWaitText}>⏳ Espera a que {moderatorName} comience</Text>
            </View>
          )}
        </ScrollView>

        {showDivertidoModal && (
          <View style={styles.divertidoOverlay}>
            <View style={styles.divertidoCard}>
              <LinearGradient
                colors={['#4FC3F7', '#0288D1', '#01579B']}
                style={styles.divertidoCardGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.divertidoEmoji}>😄</Text>
                <Text style={styles.divertidoModalTitle}>Nivel</Text>
                <Text style={styles.divertidoModalLevel}>Divertido</Text>
              </LinearGradient>
            </View>
          </View>
        )}
      </LinearGradient>
    );
  }

  const eventTypeText = appointment.event.type === 'bar' ? 'Bar' : appointment.event.type === 'caminata' ? 'Caminata' : appointment.event.type === 'cafe' ? 'Café' : appointment.event.type === 'bolos' ? 'Bolos' : 'Restaurante';
  const eventIcon = appointment.event.type === 'bar' ? '🍸' : appointment.event.type === 'caminata' ? '🚶' : appointment.event.type === 'cafe' ? '☕' : appointment.event.type === 'bolos' ? '🎳' : '🍽️';

  const locationRevealed = appointment.event.is_location_revealed || false;
  const shouldShowLocationText = !locationRevealed;
  const locationText = locationRevealed && appointment.event.location_name
    ? appointment.event.location_name
    : '';

  const participantCountText = activeParticipants.length.toString();

  return (
    <LinearGradient
      colors={['#1a0010', '#880E4F', '#AD1457']}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.title}>Hoy es tu experiencia Nospi</Text>
        <Text style={styles.subtitle}>¡Prepárate para conectar!</Text>

        {/* Conteo a la HORA PACTADA. "Tiempo para confirmar tu llegada" hacía
            creer que ese era el plazo para confirmar. Quien confirma temprano
            lo sigue viendo hasta las en punto; ahí se oculta y lo reemplaza la
            tarjeta de espera de 7 minutos. */}
        {(checkInPhase !== 'confirmed' || countdown > START_WINDOW_MINUTES * 60 * 1000) && (
          <View style={styles.countdownCard}>
            <Text style={styles.countdownLabel}>Tiempo para iniciar el evento</Text>
            <Text style={styles.countdownTime}>{countdownDisplay || '—'}</Text>
          </View>
        )}

        <View style={styles.eventCard}>
          <View style={styles.eventHeader}>
            {appointment.event.type === 'caminata' ? (
              <Image source={require('@/assets/images/icon-caminata.png')} style={{ width: 84, height: 70, marginRight: 12, tintColor: '#6B6B6B' }} resizeMode="contain" />
            ) : appointment.event.type === 'bar' ? (
              <Image source={require('@/assets/images/icon-bar.png')} style={{ width: 84, height: 70, marginRight: 12, tintColor: '#6B6B6B' }} resizeMode="contain" />
            ) : appointment.event.type === 'restaurante' ? (
              <Image source={require('@/assets/images/icon-restaurante.png')} style={{ width: 84, height: 70, marginRight: 12, tintColor: '#6B6B6B' }} resizeMode="contain" />
            ) : appointment.event.type === 'cafe' ? (
              <Image source={require('@/assets/images/icon-cafe.png')} style={{ width: 84, height: 70, marginRight: 12, tintColor: '#6B6B6B' }} resizeMode="contain" />
            ) : appointment.event.type === 'bolos' ? (
              // Caja del mismo tamano que los demas iconos (84x70) para no
              // desalinear la tarjeta; el icono va ~35% mas grande adentro.
              <View style={{ width: 84, height: 70, marginRight: 12, alignItems: 'center', justifyContent: 'center' }}>
                <Image source={require('@/assets/images/icon-bolos.png')} style={{ width: 114, height: 95, tintColor: '#6B6B6B' }} resizeMode="contain" />
              </View>
            ) : (
              <Text style={styles.eventIconLarge}>{eventIcon}</Text>
            )}
            <View style={styles.eventHeaderText}>
              <Text style={styles.eventType}>{eventTypeText}</Text>
              <Text style={styles.eventTime}>{formatTimeAmPm(appointment.event.time)}</Text>
            </View>
          </View>
          {shouldShowLocationText && (
            <Text style={styles.eventLocation}>Ubicación se revelará un día antes del evento</Text>
          )}
          {locationRevealed && locationText && (
            <Text style={styles.eventLocation}>{locationText}</Text>
          )}
        </View>

        {checkInPhase === 'code_entry' && (
          <View style={styles.codeEntryCard}>
            <Text style={styles.codeEntryTitle}>Confirma tu llegada</Text>
            <Text style={styles.codeEntrySubtitle}>
              {countdownDisplay === '¡Es la hora!'
                ? 'Presiona el botón cuando estés en el lugar del evento'
                : '¿Ya estás en el lugar? Puedes confirmar desde 15 minutos antes'}
            </Text>

            {gpsError ? (
              <Text style={styles.codeErrorText}>{gpsError}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.confirmCodeButton, checkingGps && styles.buttonDisabled]}
              onPress={handleCodeConfirmation}
              disabled={checkingGps}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmCodeButtonText}>
                {checkingGps ? 'Verificando ubicación...' : 'Confirmar asistencia'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {checkInPhase === 'confirmed' && (
          <>
            <View style={styles.confirmedCard}>
              <Text style={styles.confirmedIcon}>✅</Text>
              <Text style={styles.confirmedText}>
                ¡Llegada confirmada!
              </Text>
            </View>

            <View style={styles.participantsListCard}>
              <View style={styles.participantsListHeader}>
                <Text style={styles.participantsListTitle}>Participantes confirmados</Text>
                <View style={styles.participantCountBadge}>
                  <Text style={styles.participantCountText}>{participantCountText}</Text>
                </View>
              </View>

              {activeParticipants.length > 0 && (
                <View style={styles.participantsList}>
                  {activeParticipants.map((participant, index) => {
                    const displayName = participant.profiles?.name || 'Participante';
                    return (
                      <React.Fragment key={index}>
                        <View style={styles.participantListItem}>
                          <View style={styles.participantListPhotoPlaceholder}>
                            <Text style={styles.participantListPhotoText}>
                              {displayName.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <Text style={styles.participantListName}>{displayName}</Text>
                        </View>
                      </React.Fragment>
                    );
                  })}
                </View>
              )}
            </View>

            {/* La tarjeta de espera APARECE a la hora pactada en punto (no antes):
                countdown apunta a hora + START_WINDOW_MINUTES, así que "ya es la
                hora" equivale a countdown <= esa ventana. El tope tambien filtra
                el MAX_SAFE_INTEGER inicial de la carga (numero gigante). */}
            {!canStartExperience && countdown > 0 && countdown <= START_WINDOW_MINUTES * 60 * 1000 && (
              <View style={styles.waitCard}>
                <Text style={styles.waitCardTitle}>⏳ Arrancamos en</Text>
                <Text style={styles.waitCardCountdown}>{waitCountdownText}</Text>
                <Text style={styles.waitCardWhy}>
                  Le damos unos minutos a quien se haya retrasado.
                </Text>
                {/* La invitación a pedir depende del TIPO de evento: en una
                    cena aplica "la cena", en bar/café/bolos solo algo de tomar,
                    y en caminata no hay dónde ordenar, así que no se muestra. */}
                {appointment.event.type !== 'caminata' && (
                  <>
                    <View style={styles.waitCardDivider} />
                    <View style={styles.waitCardDrink}>
                      <Text style={styles.waitCardDrinkEmoji}>🍹</Text>
                      <Text style={styles.waitCardDrinkText}>
                        Mientras tanto <Text style={styles.waitCardDrinkStrong}>{appointment.event.type === 'restaurante' ? 'pide algo de tomar o la cena' : 'pide algo de tomar'}</Text>. La experiencia es mucho mejor con algo en la mesa.
                      </Text>
                    </View>
                  </>
                )}
                {/* Aviso de NO presentarse todavía: la dinámica abre con la
                    pregunta de presentación, y es más divertida si nadie se
                    presentó antes. Se muestra en TODOS los tipos de evento
                    (en caminata queda directo debajo de la línea de espera). */}
                <View style={styles.waitCardDivider} />
                <View style={styles.waitCardDrink}>
                  <Text style={styles.waitCardDrinkEmoji}>🤫</Text>
                  <Text style={styles.waitCardDrinkText}>
                    <Text style={styles.waitCardDrinkStrong}>Aún no se presenten:</Text> la dinámica lo va a hacer por ustedes… de una forma mucho más divertida.
                  </Text>
                </View>
              </View>
            )}

            {canStartExperience && (
              <>
                <View style={styles.infoCard}>
                  <Text style={styles.infoText}>
                    ✨ Hay {activeParticipants.length} participantes confirmados
                  </Text>
                  <Text style={styles.infoTextSecondary}>
                    Presiona &quot;Continuar&quot; para elegir el moderador
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.continueButton}
                  onPress={handleGoToChooseModerator}
                  activeOpacity={0.8}
                >
                  <Text style={styles.continueButtonText}>
                    🚀 Continuar
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1 },
  contentContainer: { padding: 24, paddingBottom: 120 },
  skeletonCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 8, marginTop: 48 },
  subtitle: { fontSize: 16, color: '#FFFFFF', opacity: 0.8, marginBottom: 24 },
  placeholderContainer: { backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: 20, padding: 40, alignItems: 'center' },
  placeholderIcon: { fontSize: 80, marginBottom: 24 },
  placeholderText: { fontSize: 18, fontWeight: '600', color: '#880E4F', textAlign: 'center' },
  eventInfoCard: { backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: 20, padding: 24, alignItems: 'center' },
  preEventTipCard: { backgroundColor: 'rgba(255, 255, 255, 0.92)', borderRadius: 16, padding: 18, flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 12 },
  preEventTipIcon: { fontSize: 26, marginTop: 2 },
  preEventTipTitle: { fontSize: 15, fontWeight: '700', color: '#880E4F', marginBottom: 4 },
  preEventTipText: { fontSize: 14, color: '#444', lineHeight: 20 },
  preEventTipStrong: { fontWeight: '700', color: '#880E4F' },
  policyLinkWrap: { alignItems: 'center', marginTop: 4, marginBottom: 4 },
  policyLinkText: { fontSize: 13, fontWeight: '700', color: '#ffd9ea', textDecorationLine: 'underline' },
  eventInfoIcon: { fontSize: 60, marginBottom: 16 },
  eventInfoTitle: { fontSize: 20, fontWeight: 'bold', color: '#880E4F', marginBottom: 16 },
  eventInfoDate: { fontSize: 16, color: '#444', marginBottom: 8, textAlign: 'center' },
  eventInfoTime: { fontSize: 18, fontWeight: '600', color: '#AD1457' },
  countdownCard: { backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', marginBottom: 12 },
  countdownLabel: { fontSize: 14, color: '#880E4F', marginBottom: 8, fontWeight: '600' },
  countdownTime: { fontSize: 48, fontWeight: '800', color: '#880E4F', fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif', letterSpacing: 2, textShadowColor: 'rgba(0,0,0,0.15)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  eventCard: { backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: 16, padding: 14, marginBottom: 12 },
  eventHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  eventIconLarge: { fontSize: 32, marginRight: 12 },
  eventHeaderText: { flex: 1 },
  eventType: { fontSize: 20, fontWeight: 'bold', color: '#880E4F' },
  eventTime: { fontSize: 15, color: '#AD1457', fontWeight: '600', marginTop: 2 },
  eventLocation: { fontSize: 13, color: '#666' },
  codeEntryCard: { backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: 16, padding: 18, marginBottom: 12 },
  codeEntryTitle: { fontSize: 22, fontWeight: 'bold', color: '#880E4F', textAlign: 'center', marginBottom: 6 },
  codeEntrySubtitle: { fontSize: 15, color: '#666', textAlign: 'center', marginBottom: 18 },
  codeInput: { backgroundColor: '#F5F5F5', borderRadius: 12, padding: 14, fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 10, borderWidth: 2, borderColor: '#F06292' },
  codeInputFocused: { borderColor: '#880E4F' },
  codeErrorText: { fontSize: 13, color: '#EF4444', textAlign: 'center', marginBottom: 10 },
  confirmCodeButton: { backgroundColor: '#880E4F', borderRadius: 14, padding: 16, alignItems: 'center' },
  confirmCodeButtonText: { fontSize: 17, fontWeight: 'bold', color: '#FFFFFF' },
  confirmedCard: { backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(136, 14, 79, 0.15)' },
  confirmedIcon: { fontSize: 36, marginBottom: 8 },
  confirmedText: { fontSize: 15, color: '#880E4F', textAlign: 'center', fontWeight: '600' },
  participantsListCard: { backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: 16, padding: 16, marginBottom: 12 },
  participantsListHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  participantsListTitle: { fontSize: 16, fontWeight: 'bold', color: '#880E4F', flex: 1 },
  participantCountBadge: { backgroundColor: '#880E4F', borderRadius: 16, paddingVertical: 5, paddingHorizontal: 12, minWidth: 40, alignItems: 'center' },
  participantCountText: { fontSize: 17, fontWeight: 'bold', color: '#FFFFFF' },
  participantsList: { marginTop: 6 },
  participantListItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  participantListPhotoPlaceholder: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(173, 20, 87, 0.15)', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  participantListPhotoText: { fontSize: 14, fontWeight: 'bold', color: '#880E4F' },
  participantListName: { fontSize: 15, color: '#333', fontWeight: '500' },
  buttonDisabled: { opacity: 0.5 },
  infoCard: { backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: 16, padding: 16, marginBottom: 12 },
  infoText: { fontSize: 16, fontWeight: '600', color: '#880E4F', textAlign: 'center', marginBottom: 8 },
  infoTextSecondary: { fontSize: 13, color: '#666', textAlign: 'center' },
  // Tarjeta de espera de la lista de confirmados: conteo + por qué esperamos +
  // invitación a pedir algo mientras llegan los que faltan.
  waitCard: { backgroundColor: 'rgba(255,183,77,0.15)', borderWidth: 1, borderColor: 'rgba(255,183,77,0.55)', borderRadius: 16, padding: 16, marginBottom: 12 },
  waitCardTitle: { color: '#FFD9A0', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  waitCardCountdown: { color: '#FFD9A0', fontSize: 38, fontWeight: '800', textAlign: 'center', letterSpacing: 2, marginTop: 2 },
  waitCardWhy: { color: 'rgba(255,224,178,0.92)', fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  waitCardDivider: { height: 1, backgroundColor: 'rgba(255,214,0,0.3)', marginVertical: 12 },
  waitCardDrink: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  waitCardDrinkEmoji: { fontSize: 21 },
  waitCardDrinkText: { flex: 1, color: 'rgba(255,235,205,0.95)', fontSize: 13.5, lineHeight: 20 },
  waitCardDrinkStrong: { color: '#FFFFFF', fontWeight: '800' },
  continueButton: { backgroundColor: '#880E4F', borderRadius: 16, paddingVertical: 18, paddingHorizontal: 32, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 14, elevation: 10, marginBottom: 12, borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.50)' },
  continueButtonText: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF', letterSpacing: 0.5 },
  rulesIcon: { fontSize: 72, marginBottom: 16 },
  rulesTitle: { fontSize: 30, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', marginBottom: 24, textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  rulesCard: { backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 22, borderWidth: 1, borderColor: 'rgba(240,98,146,0.30)', padding: 24, width: '100%', marginBottom: 32 },
  rulesRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  rulesEmoji: { fontSize: 26, marginTop: 2 },
  rulesText: { flex: 1, fontSize: 17, color: '#FFFFFF', lineHeight: 24, fontWeight: '400' },
  rulesDivider: { height: 1, backgroundColor: 'rgba(240,98,146,0.20)', marginVertical: 16 },
  // ── Moderador (elegir / elegido / esperas) ──────────────────────────────────
  modRoleCard: { backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', padding: 16, width: '100%', marginBottom: 20 },
  modRoleRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  modRoleDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.14)', marginVertical: 12 },
  modRoleEmoji: { fontSize: 22 },
  modRoleText: { flex: 1, fontSize: 15, color: 'rgba(255,255,255,0.92)', lineHeight: 22 },
  modFirstTag: { alignSelf: 'center', marginTop: 16, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.40)', borderRadius: 22, paddingVertical: 11, paddingHorizontal: 18 },
  modFirstTagText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  modBackLink: { marginTop: 22, fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  modChosenCard: { backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 18, padding: 20, alignItems: 'center', width: '100%', marginBottom: 20 },
  modChosenAvatar: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#f0c8dd', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  modChosenAvatarText: { fontSize: 26, fontWeight: '800', color: '#6d0e3c' },
  modChosenName: { fontSize: 19, fontWeight: '800', color: '#6d0e3c' },
  modChosenRole: { marginTop: 6, backgroundColor: '#AD1457', borderRadius: 16, paddingVertical: 4, paddingHorizontal: 12 },
  modChosenRoleText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  modVoice: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: 'rgba(255,214,0,0.16)', borderWidth: 1, borderColor: 'rgba(255,214,0,0.5)', borderRadius: 16, padding: 14, width: '100%', marginBottom: 20 },
  modVoiceEmoji: { fontSize: 22 },
  modVoiceText: { flex: 1, fontSize: 14, color: '#ffe9a8', lineHeight: 21, fontWeight: '600' },
  modVoiceOth: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 12, width: '100%', marginBottom: 20 },
  modVoiceOthText: { fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 20, textAlign: 'center' },
  modWait: { backgroundColor: 'rgba(0,0,0,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', borderStyle: 'dashed', borderRadius: 26, paddingVertical: 16, paddingHorizontal: 24, alignItems: 'center', marginTop: 8, width: '100%' },
  modWaitText: { fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.9)', textAlign: 'center' },
  comenzarButton: { backgroundColor: '#880E4F', borderRadius: 50, paddingVertical: 18, paddingHorizontal: 56, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(240,98,146,0.50)', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 14, elevation: 10, marginTop: 8 },
  comenzarButtonText: { fontSize: 22, fontWeight: '700', color: '#FFFFFF', letterSpacing: 1, textAlign: 'center' },
  // Variante del boton de postularse: el texto es mas largo que "Comenzar" y
  // con la letra de 22 se partia en dos lineas; letra 18 y menos padding lo
  // dejan en UNA linea en cualquier pantalla.
  becomeModBtn: { paddingHorizontal: 24, alignSelf: 'stretch' },
  becomeModBtnText: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.4, textAlign: 'center' },
  divertidoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  divertidoCard: { borderRadius: 32, overflow: 'hidden', minWidth: 280 },
  divertidoCardGradient: { padding: 48, alignItems: 'center', borderRadius: 32 },
  divertidoEmoji: { fontSize: 100, marginBottom: 24 },
  divertidoModalTitle: { fontSize: 20, fontWeight: '600', color: 'rgba(255,255,255,0.85)', marginBottom: 10, textAlign: 'center' },
  divertidoModalLevel: { fontSize: 38, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  sessionInfoContainer: { marginTop: 20, alignItems: 'center' },
  sessionInfoText: { fontSize: 13, color: '#888', textAlign: 'center' },
  sessionSignOutText: { fontSize: 13, color: '#AD1457', fontWeight: '600', textAlign: 'center', marginTop: 8, textDecorationLine: 'underline' },
});
