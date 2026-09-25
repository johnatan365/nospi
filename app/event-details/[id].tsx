import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Linking, Modal, Platform, Image, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { nombreLargoEvento } from '@/utils/nombreEvento';
import { useSupabase } from '@/contexts/SupabaseContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { formatTimeAmPm } from '@/utils/formatTime';
import { abrirMeet } from '@/lib/abrirMeet';
import { toqueFuerte, aviso } from '@/lib/haptics';

// Videollamada: la asistencia se confirma en la pestaña Dinámica desde 10
// minutos antes (VIRTUAL_CONFIRM_MINUTES de dinamica.tsx). Ahí se escoge el
// moderador y de ahí se entra al Meet; esta página solo lleva para allá.
const MINUTOS_ANTES_ENTRAR = 10;
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

function horaBogota(d: Date): string {
  const b = new Date(d.getTime() - BOGOTA_OFFSET_MS);
  let h = b.getUTCHours();
  const m = b.getUTCMinutes();
  const suf = h >= 12 ? 'p. m.' : 'a. m.';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${suf}`;
}

interface Event {
  id: string;
  name: string;
  city: string;
  description: string;
  type: string;
  date: string | null;
  time: string;
  location_name: string;
  location_address: string;
  maps_link: string;
  // Enlace del Meet para type='virtual'. NUNCA se muestra como texto: solo se
  // abre desde el boton, porque ese boton es el que registra la asistencia.
  meet_link: string | null;
  is_location_revealed: boolean;
  max_participants: number;
  event_status: 'draft' | 'published' | 'closed';
  price: number | null;
}


// Recuadro de los iconos de evento: borde fino en el color de Nospi y esquinas
// redondeadas. La caja conserva el tamano que ya tenia para no mover el layout;
// lo que se encoge es el icono, para que la linea no quede pegada al borde.
const CAJA_ICONO = {
  borderWidth: 1.5,
  borderColor: 'rgba(136,14,79,0.25)',
  backgroundColor: '#FFFFFF',
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

export default function EventDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { user } = useSupabase();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  // Checkbox de confirmación de lectura: aparece para caminatas autogestionadas
  // (exoneración de responsabilidad) y para bolos (aviso de que la pista y los
  // zapatos se pagan aparte, en la bolera). Debe marcarse activamente (nunca
  // premarcado) para habilitar el botón de unirse.
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  // Momento en que la persona entro a la videollamada desde la app. Es lo que
  // vale como asistencia en un evento virtual, igual que el GPS en uno fisico.
  const [checkedInAt, setCheckedInAt] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);
  // Se refresca cada 30 s para que el boton se habilite solo cuando llega la
  // hora, sin que la persona tenga que salir y volver a entrar a la pantalla.
  const [ahora, setAhora] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const requiresWaiver = (t: string | undefined) => t === 'caminata' || t === 'bolos';

  const loadEvent = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error loading event:', error);
        return;
      }

      // Igual que en el listado de eventos: si el admin apagó este evento
      // para el género del usuario (para balancear hombres/mujeres), se
      // trata como si no existiera — sin mensaje especial, mismo estado
      // que "Evento no encontrado" (cubre el caso de acceso directo por
      // link a un evento que ya no aparece en el listado).
      if (user?.id && (data?.registration_closed_men || data?.registration_closed_women)) {
        const { data: userRow } = await supabase.from('users').select('gender').eq('id', user.id).maybeSingle();
        const userGender = userRow?.gender || '';
        if ((userGender === 'hombre' && data.registration_closed_men) || (userGender === 'mujer' && data.registration_closed_women)) {
          setEvent(null);
          return;
        }
      }

      setEvent(data);

      // Embudo de anuncios: ViewContent al abrir el detalle de un evento. En web
      // dispara el pixel de Meta, y el wrapper de public/index.html lo espeja a
      // TikTok. Le da al algoritmo una senal frecuente mientras acumula compras.
      if (Platform.OS === 'web' && data) {
        try {
          const win = window as any;
          if (typeof win.fbq === 'function') {
            win.fbq('track', 'ViewContent', {
              content_type: 'product',
              content_ids: [String(data.id)],
              content_name: data.name,
              currency: 'COP',
              value: data.price || 9900,
            });
          }
        } catch (e) {}
      }
    } catch (error) {
      console.error('Failed to load event:', error);
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  const checkEnrollment = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('id, checked_in_at')
        .eq('user_id', user.id)
        .eq('event_id', id)
        .maybeSingle();

      if (error) {
        console.error('Error checking enrollment:', error);
        return;
      }

      const enrolled = !!data;
      setIsEnrolled(enrolled);
      setCheckedInAt((data as any)?.checked_in_at ?? null);
    } catch (error) {
      console.error('Failed to check enrollment:', error);
    }
  }, [user?.id, id]);

  useEffect(() => {
    if (id) {
      loadEvent();
      checkEnrollment();
    }
  }, [id, loadEvent, checkEnrollment]);

  // Re-check enrollment whenever the screen comes back into focus (e.g. after payment)
  useFocusEffect(
    useCallback(() => {
      if (id) {
        console.log('EventDetails: screen focused, re-checking enrollment for event:', id);
        checkEnrollment();
      }
    }, [id, checkEnrollment])
  );

  // Show success modal if navigated back with paymentSuccess param.
  // Wait 1 second before checking enrollment to allow DB propagation on Android.
  const { paymentSuccess } = useLocalSearchParams<{ paymentSuccess?: string }>();
  useEffect(() => {
    if (paymentSuccess === 'true') {
      console.log('EventDetails: paymentSuccess param detected, waiting 1s then checking enrollment');
      const timer = setTimeout(() => {
        checkEnrollment();
        setShowSuccessModal(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [paymentSuccess, checkEnrollment]);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Fecha sin definir';
    const date = new Date(dateString);
    // event.date es el instante UTC exacto del evento (ej. viernes 7pm Bogota
    // = sabado 00:00 UTC). Sin timeZone explicito, toLocaleDateString usa la
    // zona horaria del dispositivo — funciona en un celular en hora de
    // Colombia, pero muestra un dia adelantado en cualquier otro entorno.
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/Bogota',
    };
    return date.toLocaleDateString('es-ES', options);
  };

  const handleOpenMaps = () => {
    if (!event?.maps_link) return;
    
    Linking.openURL(event.maps_link).catch(err => {
      console.error('Failed to open maps link:', err);
    });
  };

  // Entrar a la videollamada. El orden importa: primero se registra la
  // asistencia y despues se abre el Meet. Si se abriera primero, el navegador
  // se lleva el foco y la escritura puede no alcanzar a salir.
  //
  // Este boton es la UNICA puerta al Meet: el enlace no viaja por correo ni por
  // WhatsApp ni se muestra como texto. Por eso tocarlo equivale a entrar, y no
  // es un boton de buena fe que alguien pueda apretar desde la cama.
  const handleEntrarVideollamada = async () => {
    if (!event?.meet_link || entrando) return;
    setEntrando(true);
    try {
      if (user?.id && !checkedInAt) {
        const ahora = new Date().toISOString();
        const { error } = await supabase
          .from('appointments')
          .update({ checked_in_at: ahora, arrival_status: 'on_time', location_confirmed: true })
          .eq('user_id', user.id)
          .eq('event_id', id)
          .is('checked_in_at', null);
        if (error) {
          // Que falle el registro no puede dejar a nadie por fuera de la
          // llamada: se abre igual y queda para corregir a mano.
          console.error('No se pudo registrar la asistencia:', error.message);
        } else {
          setCheckedInAt(ahora);
        }
      }
      await abrirMeet(event.meet_link);
    } catch (e) {
      console.error('No se pudo abrir la videollamada:', e);
      Alert.alert('No se pudo abrir', 'Intenta de nuevo en unos segundos.');
    } finally {
      setEntrando(false);
    }
  };

  const handleCancel = () => {
    console.log('User pressed Cancelar in event details');
    router.back();
  };

  const handleConfirm = async () => {
    if (requiresWaiver(event?.type) && !waiverAccepted) return;

    // Reservar es LA accion de la app: el golpecito va aqui, al tocar, no al
    // final del proceso de pago, para que se sienta que el boton respondio.
    toqueFuerte();

    // Bloqueo por suspensión de reservas (amonestaciones por no confirmar
    // asistencia). Se revisa antes de cualquier pago.
    try {
      const { data: me } = await supabase
        .from('users')
        .select('reservas_suspendidas_hasta')
        .eq('id', user?.id)
        .maybeSingle();
      const until = me?.reservas_suspendidas_hasta ? new Date(me.reservas_suspendidas_hasta) : null;
      if (until && until.getTime() > Date.now()) {
        const untilText = until.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', timeZone: 'America/Bogota' });
        const msg = `Tu cuenta está suspendida para reservar nuevos eventos hasta el ${untilText} porque no se confirmó tu asistencia a eventos anteriores. Puedes seguir usando la app con normalidad. Si crees que es un error, escríbenos a soporte para revisar tu caso.`;
        aviso();
        if (Platform.OS === 'web') { window.alert(msg); } else { Alert.alert('Reservas suspendidas', msg); }
        return;
      }
    } catch (e) {
      // Si la consulta falla, no bloqueamos la reserva.
      console.error('Chequeo de suspensión falló:', e);
    }

    setConfirming(true);

    try {
      const { data: existingAppointment } = await supabase
        .from('appointments')
        .select('*')
        .eq('user_id', user?.id)
        .eq('event_id', id)
        .maybeSingle();

      // Quien decide si YA esta inscrito es `status`, no `payment_status`.
      //
      // Antes esto tambien salia por payment_status === 'completed', y ahi
      // estaba el bug: al cancelar, la cita queda en 'cancelada' pero conserva
      // 'completed' porque esa persona SI pago en su momento. Con esa condicion
      // se le mandaba a "mis citas" y no podia volver a inscribirse nunca al
      // evento que habia cancelado. Eran 44 citas en esa situacion.
      //
      // Si vuelve a entrar, el flujo de pago sigue igual: subscription-plans y
      // payment-callback ya detectan la fila existente y la actualizan en vez
      // de insertar otra (hay un unico sobre user_id + event_id).
      if (existingAppointment && existingAppointment.status === 'confirmada') {
        setConfirming(false);
        router.replace('/(tabs)/appointments');
        return;
      }

      const eventId = Array.isArray(id) ? id[0] : id as string;
      await AsyncStorage.setItem('pending_event_confirmation', eventId);
      // Se guarda junto al evento pendiente; el punto de confirmación final
      // (subscription-plans.tsx / payment-callback.tsx) lo lee para setear
      // appointments.waiver_accepted_at al crear/actualizar la cita.
      if (requiresWaiver(event?.type)) {
        await AsyncStorage.setItem('pending_waiver_accepted', 'true');
      } else {
        await AsyncStorage.removeItem('pending_waiver_accepted');
      }
      setConfirming(false);
      // En web, router.push puede pasar por index.tsx causando pantalla en blanco.
      // router.replace navega directamente sin re-evaluar la ruta raíz.
      if (Platform.OS === 'web') {
        router.replace('/subscription-plans');
      } else {
        router.push('/subscription-plans');
      }
    } catch (error) {
      console.error('Failed to process confirmation:', error);
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <LinearGradient
        colors={['#1a0010', '#880E4F', '#AD1457']}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <Stack.Screen options={{ headerShown: true, title: 'Detalles del Evento', headerBackTitle: 'Atrás' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={nospiColors.purpleDark} />
        </View>
      </LinearGradient>
    );
  }

  if (!event) {
    return (
      <LinearGradient
        colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
        style={styles.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <Stack.Screen options={{ headerShown: true, title: 'Detalles del Evento', headerBackTitle: 'Atrás' }} />
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Evento no encontrado</Text>
        </View>
      </LinearGradient>
    );
  }

  const eventTypeText = event.type === 'bar' ? 'Bar' : event.type === 'caminata' ? 'Caminata' : event.type === 'cafe' ? 'Café' : event.type === 'bolos' ? 'Bolos' : event.type === 'virtual' ? 'Videollamada' : 'Restaurante';
  const eventIcon = event.type === 'bar' ? '🍸' : event.type === 'caminata' ? '🚶' : event.type === 'cafe' ? '☕' : event.type === 'bolos' ? '🎳' : event.type === 'virtual' ? '🎥' : '🍽️';
  const esVirtual = event.type === 'virtual';
  const dateText = formatDate(event.date);
  // Los eventos son de hombres y mujeres. El cierre de registro por genero
  // (registration_closed_men/women) es un tope DINAMICO para balancear cupos
  // — se cierra un lado cuando ya hay suficientes del otro — y NO define un
  // evento de un solo genero. Por eso NO se usa aqui: el grupo sigue siendo
  // mixto aunque se cierre temporalmente un lado. Ademas no revelamos cantidad.
  const participantsText = 'Hombres y mujeres';
  const showLocation = isEnrolled && event.is_location_revealed;

  return (
    <LinearGradient
      colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
      style={styles.gradient}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <Stack.Screen options={{
        headerShown: true,
        title: 'Detalles del Evento',
        headerLeft: () => (
          <TouchableOpacity onPress={handleCancel} style={{ paddingHorizontal: 8 }}>
            <Text style={{ color: '#880E4F', fontSize: 16, fontWeight: '500' }}>Cancelar</Text>
          </TouchableOpacity>
        ),
      }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.eventCard}>
          {/* Header - Icon and Title */}
          <View style={styles.headerSection}>
            {event.type === 'virtual' ? (
              // Mismo agrandado que en la lista de eventos (ver events.tsx).
              <View style={[CAJA_ICONO, { width: 173, height: 147, borderRadius: 33, marginBottom: 12 }]}>
                <Image source={require('@/assets/images/icon-videollamada.png')} style={{ width: 137, height: 116, tintColor: '#880E4F' }} resizeMode="contain" />
              </View>
            ) : event.type === 'caminata' ? (
              <View style={[CAJA_ICONO, { width: 173, height: 147, borderRadius: 33, marginBottom: 12 }]}>
                <Image source={require('@/assets/images/icon-caminata.png')} style={{ width: 118, height: 100, tintColor: '#880E4F' }} resizeMode="contain" />
              </View>
            ) : event.type === 'bar' ? (
              <View style={[CAJA_ICONO, { width: 173, height: 147, borderRadius: 33, marginBottom: 12 }]}>
                <Image source={require('@/assets/images/icon-bar.png')} style={{ width: 118, height: 100, tintColor: '#880E4F' }} resizeMode="contain" />
              </View>
            ) : event.type === 'restaurante' ? (
              <View style={[CAJA_ICONO, { width: 173, height: 147, borderRadius: 33, marginBottom: 12 }]}>
                <Image source={require('@/assets/images/icon-restaurante.png')} style={{ width: 118, height: 100, tintColor: '#880E4F' }} resizeMode="contain" />
              </View>
            ) : event.type === 'cafe' ? (
              <View style={[CAJA_ICONO, { width: 173, height: 147, borderRadius: 33, marginBottom: 12 }]}>
                <Image source={require('@/assets/images/icon-cafe.png')} style={{ width: 118, height: 100, tintColor: '#880E4F' }} resizeMode="contain" />
              </View>
            ) : event.type === 'bolos' ? (
              // Mismo truco que en events.tsx: caja del mismo tamano que los demas
              // iconos (156x132) para no desalinear el layout, con el icono ~17% mas
              // grande centrado adentro (se ve chico si no se agranda un poco).
              <View style={[CAJA_ICONO, { width: 173, height: 147, borderRadius: 33, marginBottom: 12 }]}>
                <Image source={require('@/assets/images/icon-bolos.png')} style={{ width: 138, height: 117, tintColor: '#880E4F' }} resizeMode="contain" />
              </View>
            ) : (
              <Text style={styles.eventIcon}>{eventIcon}</Text>
            )}
            {/* El nombre puede venir partido en dos renglones desde el admin.
                Aca se muestra completo, con el mismo estilo en las dos lineas. */}
            <Text style={styles.eventName}>{nombreLargoEvento(event)}</Text>
            <Text style={styles.eventType}>{eventTypeText}</Text>
          </View>
          
          {/* Info Grid - Compact 2-column layout */}
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>📅 Fecha</Text>
              <Text style={styles.infoValue}>{dateText}</Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>🕐 Hora</Text>
              <Text style={styles.infoValue}>{event.date ? formatTimeAmPm(event.time) : 'Por definir'}</Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>🌆 Ciudad</Text>
              <Text style={styles.infoValue}>{event.city}</Text>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>👥 Grupo</Text>
              <Text style={styles.infoValue}>{participantsText}</Text>
            </View>
          </View>

          {event.description && (
            <View style={styles.descriptionSection}>
              <Text style={styles.descriptionText}>{event.description}</Text>
            </View>
          )}

          {/* Acceso: en un evento virtual esta seccion reemplaza a la de
              ubicacion. El enlace del Meet NUNCA se imprime como texto — solo
              existe detras del boton, y tocarlo es lo que registra la
              asistencia. Si se mostrara la URL, se copiaria y se entraria sin
              pasar por la app, que es justo lo que medimos. */}
          <View style={styles.locationSection}>
            <Text style={styles.locationTitle}>{esVirtual ? '🎥 Videollamada' : '📍 Ubicación'}</Text>
            {/* Se repite a proposito en cada punto del camino (compra, recordatorios,
                reglas): quien entra con la camara apagada rompe la experiencia. */}
            {esVirtual && !checkedInAt && (
              <Text style={styles.locationAddress}>
                📹 Es con la cámara prendida: la idea es conocernos las caras.
              </Text>
            )}

            {esVirtual ? (
              (() => {
                const inicioMs = event.date ? new Date(event.date).getTime() : null;
                const abreMs = inicioMs === null ? null : inicioMs - MINUTOS_ANTES_ENTRAR * 60 * 1000;
                const ventanaAbierta = abreMs !== null && ahora >= abreMs;
                const accesoListo = isEnrolled && event.is_location_revealed && !!event.meet_link;

                if (checkedInAt) {
                  return (
                    <>
                      <Text style={styles.locationName}>
                        ✅ Asistencia confirmada · {horaBogota(new Date(checkedInAt))}
                      </Text>
                      <Text style={styles.locationAddress}>
                        Ya quedó registrado que entraste. Si te saliste, puedes volver desde aquí.
                      </Text>
                      <TouchableOpacity style={styles.mapsButton} onPress={handleEntrarVideollamada} activeOpacity={0.8}>
                        <Text style={styles.mapsButtonText}>Volver a la videollamada</Text>
                      </TouchableOpacity>
                    </>
                  );
                }

                if (!isEnrolled) {
                  return (
                    <Text style={styles.locationPlaceholder}>
                      Entras desde la pestaña Dinámica: 10 minutos antes confirmas tu asistencia, escogen al moderador y de ahí pasan a la llamada.
                    </Text>
                  );
                }

                if (!accesoListo) {
                  return (
                    <Text style={styles.locationPlaceholder}>
                      Entras desde la pestaña Dinámica: 10 minutos antes confirmas tu asistencia, escogen al moderador y de ahí pasan a la llamada.
                    </Text>
                  );
                }

                if (!ventanaAbierta) {
                  return (
                    <>
                      <Text style={styles.locationAddress}>
                        Entras desde la pestaña Dinámica: ahí confirmas tu asistencia y escogen al moderador.
                      </Text>
                      <View style={[styles.mapsButton, styles.mapsButtonDisabled]}>
                        <Text style={styles.mapsButtonText}>
                          {abreMs !== null ? `Disponible a las ${horaBogota(new Date(abreMs))}` : 'Disponible el día del evento'}
                        </Text>
                      </View>
                    </>
                  );
                }

                return (
                  <>
                    <Text style={styles.locationAddress}>
                      Ve a la pestaña Dinámica: confirmas tu asistencia, escogen al moderador y de ahí entran todos a la llamada.
                    </Text>
                    <Text style={styles.locationAddress}>
                      📹 Entra con la cámara prendida. Todos llegan igual de nerviosos: verse las caras es lo que rompe el hielo.
                    </Text>
                    <TouchableOpacity
                      style={styles.mapsButton}
                      onPress={() => router.push('/(tabs)/dinamica' as any)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.mapsButtonText}>Ir a la Dinámica</Text>
                    </TouchableOpacity>
                  </>
                );
              })()
            ) : showLocation ? (
              <>
                <Text style={styles.locationName}>{event.location_name}</Text>
                <Text style={styles.locationAddress}>{event.location_address}</Text>
                {event.maps_link && (
                  <TouchableOpacity
                    style={styles.mapsButton}
                    onPress={handleOpenMaps}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.mapsButtonText}>🗺️ Abrir Maps</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <Text style={styles.locationPlaceholder}>
                Ubicación se revelará un día antes del evento
              </Text>
            )}
          </View>

          {/* Action Section */}
          {!isEnrolled && (
            <View style={styles.actionSection}>
              {event.price === 0 && (
                <View style={styles.freeBadge}>
                  <Text style={styles.freeBadgeText}>Gratis</Text>
                </View>
              )}
              <Text style={styles.question}>¿Deseas asistir?</Text>

              {requiresWaiver(event.type) && (
                <TouchableOpacity
                  style={styles.waiverRow}
                  onPress={() => setWaiverAccepted(prev => !prev)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.checkbox, waiverAccepted && styles.checkboxActive]}>
                    {waiverAccepted && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.waiverText}>
                    {event.type === 'bolos'
                      ? 'Leí que la pista y los zapatos se pagan aparte, directamente en la bolera.'
                      : 'Leí la información anterior y acepto participar bajo mi propia responsabilidad.'}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  (confirming || (requiresWaiver(event.type) && !waiverAccepted)) && styles.confirmButtonDisabled,
                ]}
                onPress={handleConfirm}
                disabled={confirming || (requiresWaiver(event.type) && !waiverAccepted)}
                activeOpacity={0.8}
              >
                {confirming ? (
                  <ActivityIndicator color={nospiColors.white} />
                ) : (
                  <Text style={styles.confirmButtonText}>Confirmar Asistencia</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {isEnrolled && (
            <View style={styles.enrolledBadge}>
              <Text style={styles.enrolledText}>✓ Ya estás inscrito</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={showSuccessModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.ticketWrap}>
            <Text style={styles.ticketCheer}>✦ ¡RESERVADO! ✦</Text>

            <View style={styles.ticket}>
              <LinearGradient
                colors={[nospiColors.purpleDark, nospiColors.purpleMid]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.ticketTop}
              >
                {event?.type === 'virtual' ? (
                  <View style={{ width: 58, height: 50, marginBottom: 6, alignItems: 'center', justifyContent: 'center' }}>
                    <Image source={require('@/assets/images/icon-videollamada.png')} style={{ width: 68, height: 58, tintColor: '#ffffff' }} resizeMode="contain" />
                  </View>
                ) : event?.type === 'caminata' ? (
                  <Image source={require('@/assets/images/icon-caminata.png')} style={styles.ticketIcon} resizeMode="contain" />
                ) : event?.type === 'bar' ? (
                  <Image source={require('@/assets/images/icon-bar.png')} style={styles.ticketIcon} resizeMode="contain" />
                ) : event?.type === 'restaurante' ? (
                  <Image source={require('@/assets/images/icon-restaurante.png')} style={styles.ticketIcon} resizeMode="contain" />
                ) : event?.type === 'cafe' ? (
                  <Image source={require('@/assets/images/icon-cafe.png')} style={styles.ticketIcon} resizeMode="contain" />
                ) : event?.type === 'bolos' ? (
                  <Image source={require('@/assets/images/icon-bolos.png')} style={styles.ticketIcon} resizeMode="contain" />
                ) : (
                  <Text style={styles.ticketIconEmoji}>{eventIcon}</Text>
                )}
                <Text style={styles.ticketTitle}>Pase confirmado</Text>
                <Text style={styles.ticketSubtitle}>Tu cupo está asegurado 🎉</Text>
              </LinearGradient>

              <View style={styles.ticketPerf}>
                <View style={styles.perfNotchLeft} />
                <View style={styles.perfNotchRight} />
              </View>

              <View style={styles.ticketBody}>
                <View style={styles.ticketRow}>
                  <Text style={styles.ticketRowIcon}>🎟️</Text>
                  <Text style={styles.ticketRowStrong}>{event?.name}</Text>
                </View>
                <View style={styles.ticketRow}>
                  <Text style={styles.ticketRowIcon}>📅</Text>
                  <Text style={styles.ticketRowText}>{dateText} · {formatTimeAmPm(event?.time || '')}</Text>
                </View>
                <View style={styles.ticketRow}>
                  <Text style={styles.ticketRowIcon}>📍</Text>
                  <Text style={styles.ticketRowText}>
                    {showLocation ? event?.location_name : 'Te enviaremos la ubicación un día antes'}
                  </Text>
                </View>
              </View>

              <Text style={styles.ticketPolicy}>
                ℹ️ Si no vas a poder asistir, puedes <Text style={styles.ticketPolicyBold}>cancelar desde la app con más de 24 horas</Text> de
                anticipación y te devolvemos tu <Text style={styles.ticketPolicyBold}>saldo</Text> para que lo uses en otro evento.
                Si lo haces con <Text style={styles.ticketPolicyBold}>menos de 24 horas</Text> o{' '}
                <Text style={styles.ticketPolicyBold}>no asistes</Text>, no alcanzamos a devolverte el saldo y tu cuenta
                <Text> </Text>podría <Text style={styles.ticketPolicyBold}>quedar suspendida</Text> para reservar por un tiempo.
              </Text>

              <TouchableOpacity
                style={styles.ticketPolicyLink}
                onPress={() => {
                  setShowSuccessModal(false);
                  router.push('/politica-asistencia');
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.ticketPolicyLinkText}>Ver política completa</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.ticketCta}
              onPress={() => {
                console.log('EventDetails: success modal dismissed, navigating to appointments');
                setShowSuccessModal(false);
                router.replace('/(tabs)/appointments');
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.ticketCtaText}>Ver mi cupo</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  eventCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 20,
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  eventIcon: {
    fontSize: 60,
    marginBottom: 12,
  },
  // Negro (#111827, el mismo "casi negro" que ya usa la paleta) en vez del
  // vinotinto de la marca: aprobado despues de compararlos lado a lado. El
  // nombre pesa mas que la fecha y se lee mejor; la marca ya esta en el fondo
  // de la pantalla, no hace falta repetirla dentro de cada tarjeta blanca.
  eventName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 6,
    textAlign: 'center',
  },
  eventType: {
    fontSize: 18,
    color: nospiColors.purpleMid,
    fontWeight: '600',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 16,
  },
  infoItem: {
    width: '50%',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  descriptionSection: {
    marginBottom: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  descriptionText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  locationSection: {
    marginBottom: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  locationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 8,
  },
  locationName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  locationPlaceholder: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  mapsButton: {
    backgroundColor: '#4285F4',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  mapsButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: 'bold',
  },
  mapsButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  actionSection: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  waiverRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#AAA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  checkboxActive: {
    backgroundColor: nospiColors.purpleDark,
    borderColor: nospiColors.purpleDark,
  },
  checkmark: {
    color: nospiColors.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  waiverText: {
    flex: 1,
    fontSize: 13.5,
    color: '#555',
    lineHeight: 18,
  },
  question: {
    fontSize: 18,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    textAlign: 'center',
    marginBottom: 16,
  },
  confirmButton: {
    backgroundColor: nospiColors.purpleDark,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: nospiColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  confirmButtonDisabled: {
    backgroundColor: nospiColors.purpleMid,
    opacity: 0.6,
  },
  confirmButtonText: {
    color: nospiColors.white,
    fontSize: 17,
    fontWeight: '700',
  },
  enrolledBadge: {
    backgroundColor: '#10B981',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  enrolledText: {
    color: 'white',
    fontSize: 15,
    fontWeight: 'bold',
  },
  freeBadge: {
    alignSelf: 'center',
    backgroundColor: '#D1FAE5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 10,
  },
  freeBadgeText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#059669',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  successIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: nospiColors.purpleDark,
    marginBottom: 8,
    textAlign: 'center',
  },
  successMessage: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  successButton: {
    backgroundColor: nospiColors.purpleDark,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 14,
    alignItems: 'center',
  },
  successButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  // --- Pase / boleto post-compra (Opción 2) ---
  ticketWrap: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
  },
  ticketCheer: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: '#ffd9e6',
    marginBottom: 12,
  },
  ticket: {
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 12,
  },
  ticketTop: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  ticketIcon: {
    width: 58,
    height: 50,
    marginBottom: 6,
    tintColor: '#ffffff',
  },
  ticketIconEmoji: {
    fontSize: 40,
    marginBottom: 6,
  },
  ticketTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },
  ticketSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.92)',
    marginTop: 3,
  },
  ticketPerf: {
    height: 2,
    marginHorizontal: 14,
    borderTopWidth: 2,
    borderTopColor: '#e9d6df',
    borderStyle: 'dashed',
  },
  perfNotchLeft: {
    position: 'absolute',
    top: -11,
    left: -25,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  perfNotchRight: {
    position: 'absolute',
    top: -11,
    right: -25,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  ticketBody: {
    paddingTop: 16,
    paddingHorizontal: 18,
    paddingBottom: 6,
  },
  ticketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  ticketRowIcon: {
    fontSize: 15,
    width: 20,
    textAlign: 'center',
  },
  ticketRowStrong: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: '#241019',
  },
  ticketRowText: {
    flex: 1,
    fontSize: 14,
    color: '#3a2a33',
  },
  ticketPolicy: {
    fontSize: 12,
    lineHeight: 18,
    color: '#6b5560',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: '#f3ebee',
    marginTop: 8,
  },
  ticketPolicyBold: {
    fontWeight: '800',
    color: '#241019',
  },
  ticketPolicyLink: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  ticketPolicyLinkText: {
    fontSize: 13,
    fontWeight: '800',
    color: nospiColors.purpleDark,
  },
  ticketCta: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 14,
  },
  ticketCtaText: {
    fontSize: 15,
    fontWeight: '800',
    color: nospiColors.purpleDark,
  },
});
