import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Modal, Platform, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';
import { Stack, useRouter } from 'expo-router';
import * as XLSX from 'xlsx';


interface Event {
  id: string;
  name: string;
  city: string;
  description: string;
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
  event_status: 'draft' | 'published' | 'closed';
  confirmation_code: string | null;
  is_full: boolean;
}

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  interested_in: string;
  gender?: string;
  age?: number;
  age_range_min?: number;
  age_range_max?: number;
  created_at?: string;
  registered_from?: string;
}

interface Appointment {
  id: string;
  user_id: string;
  event_id: string;
  status: string;
  payment_status: string;
  created_at: string;
  users: User;
  events: Event;
}

interface EventParticipant {
  id: string;
  event_id: string;
  user_id: string;
  confirmed: boolean;
  check_in_time: string | null;
  is_presented: boolean;
  presented_at: string | null;
  users: User;
}

interface EventAttendee {
  id: string;
  user_id: string;
  event_id: string;
  status: string;
  payment_status: string;
  created_at: string;
  users: User;
}

type AdminView = 'dashboard' | 'events' | 'users' | 'participants' | 'questions' | 'realtime' | 'reconciliation' | 'config';

// Default questions to restore
const DEFAULT_QUESTIONS_DATA = {
  divertido: [
    '¿Cuál es tu nombre y a qué te dedicas?',
    '¿Cuál es tu mayor sueño?',
    '¿Qué te hace reír sin control?',
    '¿Cuál es tu película favorita?',
    '¿Prefieres el mar o la montaña?',
    '¿Qué superpoder te gustaría tener?',
    '¿Cuál es tu comida favorita?',
    '¿Qué harías si ganaras la lotería?',
    '¿Te gusta bailar?',
    '¿Cuál es tu mayor miedo?',
    '¿Qué te hace feliz?'
  ],
  sensual: [
    '¿Qué te atrae de una persona?',
    '¿Cuál es tu idea de una cita perfecta?',
    '¿Qué te hace sentir especial?',
    '¿Cuál es tu mayor fantasía?',
    '¿Qué te pone nervioso en una primera cita?',
    '¿Qué es lo más romántico que has hecho?',
    '¿Qué te hace sentir deseado/a?',
    '¿Cuál es tu lugar favorito para un beso?',
    '¿Qué te enamora de alguien?',
    '¿Qué te hace sentir conectado con alguien?'
  ],
  atrevido: [
    '¿Cuál es tu secreto mejor guardado?',
    '¿Qué es lo más loco que has hecho por amor?',
    '¿Cuál es tu mayor arrepentimiento?',
    '¿Qué es lo que nunca le has dicho a nadie?',
    '¿Cuál es tu mayor inseguridad?',
    '¿Qué es lo más atrevido que has hecho?',
    '¿Cuál es tu mayor deseo oculto?',
    '¿Qué es lo que más te avergüenza?',
    '¿Cuál es tu mayor tentación?',
    '¿Qué es lo que más te asusta de ti mismo/a?'
  ]
};


// ── Tabla ancha con barra de scroll horizontal duplicada arriba, sincronizada
// con la de abajo — evita tener que bajar hasta el final de la tabla para
// poder desplazarse lateralmente.
// Arma el link de WhatsApp con el saludo predeterminado de Nospi, personalizado
// con el primer nombre de la persona y, si se conoce, la fecha/hora del evento.
function buildWhatsAppLink(phone: string, name?: string, eventName?: string, eventDate?: string, eventTime?: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  const firstName = (name || '').trim().split(' ')[0] || 'ahí';

  let eventPart = '';
  if (eventName && eventDate) {
    const formattedDate = new Date(eventDate).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const timePart = eventTime ? ` a las ${formatTimeAmPm(eventTime)}` : '';
    eventPart = ` de la ${eventName} del ${formattedDate}${timePart}`;
  }

    const message = [
      `¡Hola ${firstName}!`,
      ``,
      `Te escribimos desde Nospi confirmando que ya estás dentro${eventPart}.`,
      ``,
      `Recuerda: el lugar se revelará 48 horas antes del evento, prepárate para la sorpresa.`,
    ].join('\n');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

// Arma el link de WhatsApp para el recordatorio general del evento (distinto
// al de confirmación de compra) — incluye el lugar si ya fue revelado, o
// avisa que se revela 48h antes si aún no.
function buildEventReminderWhatsAppLink(
  phone: string,
  name?: string,
  eventName?: string,
  eventDate?: string,
  eventTime?: string,
  isLocationRevealed?: boolean,
  locationName?: string,
  locationAddress?: string,
  mapsLink?: string
): string {
  const digits = (phone || '').replace(/\D/g, '');
  const firstName = (name || '').trim().split(' ')[0] || 'ahí';
  const formattedDate = eventDate
    ? new Date(eventDate).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const timePart = eventTime ? ` a las ${formatTimeAmPm(eventTime)}` : '';
  const eventPart = eventName && eventDate ? ` tu ${eventName} programada para el ${formattedDate}${timePart}` : ' tu evento';

  let locationPart: string;
  if (isLocationRevealed && locationName) {
    const addressPart = locationAddress ? ` (${locationAddress})` : '';
    const mapsPart = mapsLink ? ` Ubicación en Maps: ${mapsLink}` : '';
    locationPart = `, en ${locationName}${addressPart}.${mapsPart}`;
  } else {
    locationPart = `. El lugar se revelará 48 horas antes del evento — ¡prepárate para la sorpresa!`;
  }

    const message = [
      `¡Hola ${firstName}!`,
      ``,
      `Te escribimos desde Nospi para recordarte${eventPart}${locationPart}`,
      ``,
      `Si no puedes asistir, avísanos respondiendo este mensaje.`,
  ].join('\n');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

// Arma el link de WhatsApp para el recordatorio del MISMO DÍA del evento —
// en bloques separados para que no se vea como un bloque de texto pesado.
function buildSameDayWhatsAppLink(
  phone: string,
  name?: string,
  eventName?: string,
  eventTime?: string,
  locationName?: string,
  locationAddress?: string,
  mapsLink?: string
): string {
  const digits = (phone || '').replace(/\D/g, '');
  const firstName = (name || '').trim().split(' ')[0] || 'ahí';
  const timePart = eventTime ? ` a las ${formatTimeAmPm(eventTime)}` : '';
  const addressPart = locationAddress ? ` (${locationAddress})` : '';
  const mapsLine = mapsLink ? `\nUbicación en Maps: ${mapsLink}` : '';

  const message = [
    `¡Hola ${firstName}!`,
    ``,
    `Hoy es tu ${eventName || 'evento'}${timePart}, en ${locationName || 'el lugar acordado'}${addressPart}.${mapsLine}`,
    ``,
    `Al llegar, diles que vienes de Nospi — te darán un código para confirmar tu asistencia en la app.`,
    ``,
    `Llega puntual: el evento arranca con una dinámica para romper el hielo, no querrás perderte el inicio.`,
    ``,
    `Abre la app apenas llegues para confirmar e iniciar la experiencia con los demás.`,
    ``,
    `¡Nos vemos hoy!`,
  ].join('\n');

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

// Arma el link de WhatsApp para las personas cuyo último intento de pago
// quedó declinado/con error, ofreciendo mandarles el link directo de pago.
function buildDeclinedPaymentWhatsAppLink(phone: string, name?: string, eventName?: string, eventDate?: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  const firstName = (name || '').trim().split(' ')[0] || 'ahí';
  const formattedDate = eventDate
    ? new Date(eventDate).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const eventPart = eventName
    ? `la ${eventName}${formattedDate ? ` del ${formattedDate}` : ''}`
    : 'el evento';

  const message = [
    `¡Hola ${firstName}! Te escribimos desde Nospi, la app que organiza cenas y planes para conocer gente nueva.`,
    ``,
    `Vimos que intentaste pagar tu cupo para ${eventPart}, pero el pago no se pudo completar.`,
    ``,
    `A veces pasa por un tema técnico del banco o de la app — nada grave.`,
    ``,
    `Si quieres, te mandamos el link directo para que sea más fácil completar el pago. Solo cuéntanos y te lo enviamos.`,
  ].join('\n');

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

// Convierte "19:00" (24h) a "7:00 p.m." para que se lea natural en el mensaje.
function formatTimeAmPm(time24: string): string {
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr || '00';
  const suffix = h >= 12 ? 'p.m.' : 'a.m.';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${suffix}`;
}

// ── Tabla ancha con una barra de scroll horizontal "sticky" pegada al fondo
// del viewport, visible en todo momento mientras la tabla está en pantalla —
// no solo arriba ni solo abajo del todo.
function HorizontalScrollSync({ children, minWidth }: { children: React.ReactNode; minWidth: number }) {
  const tableRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const syncingFrom = useRef<'table' | 'sticky' | null>(null);
  const [spacerWidth, setSpacerWidth] = useState(minWidth);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const update = () => setSpacerWidth(Math.max(el.scrollWidth, minWidth));
    update();
    // ResizeObserver detecta cuando la tabla cambia de tamaño (ej: cargan los datos)
    // y actualiza el ancho del espaciador de la barra sticky automáticamente.
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild as Element);
    return () => ro.disconnect();
  }, [minWidth]);

  const handleTableScroll = () => {
    if (syncingFrom.current === 'sticky') { syncingFrom.current = null; return; }
    if (tableRef.current && stickyRef.current) {
      syncingFrom.current = 'table';
      stickyRef.current.scrollLeft = tableRef.current.scrollLeft;
    }
  };
  const handleStickyScroll = () => {
    if (syncingFrom.current === 'table') { syncingFrom.current = null; return; }
    if (tableRef.current && stickyRef.current) {
      syncingFrom.current = 'sticky';
      tableRef.current.scrollLeft = stickyRef.current.scrollLeft;
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <div ref={tableRef} onScroll={handleTableScroll} style={{ overflowX: 'auto', borderRadius: 12, boxShadow: '0 1px 8px rgba(0,0,0,0.08)', border: '1px solid #EDE9FE' }}>
        {children}
      </div>
      <div
        ref={stickyRef}
        onScroll={handleStickyScroll}
        style={{
          position: 'sticky', bottom: 0, overflowX: 'auto', overflowY: 'hidden',
          height: 16, marginTop: 2, background: '#F3E8FF', borderRadius: 8,
          border: '1px solid #DDD6FE', zIndex: 5,
        }}
      >
        <div style={{ width: spacerWidth, height: 1 }} />
      </div>
    </div>
  );
}

// ── Real React component so useState persists across parent re-renders ──
function ExcelFilterTh({
  colKey, label, sortCol, sortAsc, onSort,
  filters, setFilters, allRows, width,
}: {
  colKey: string; label: string; sortCol: string; sortAsc: boolean;
  onSort: (k: string) => void;
  filters: Record<string, Set<string>>;
  setFilters: (f: Record<string, Set<string>>) => void;
  allRows: any[];
  width?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [dropPos, setDropPos] = React.useState({ top: 0, left: 0 });
  const thRef = React.useRef<any>(null);

  const isFiltered = !!(filters[colKey] && filters[colKey].size > 0);
  const selected: Set<string> = filters[colKey] || new Set<string>();
  const allSelected = selected.size === 0;

  const valSet = new Set<string>();
  allRows.forEach(row => {
    let v = row[colKey] ?? '';
    if (v === '' || v === null || v === undefined) {
      valSet.add('(Vacío)');
      return;
    }
    // For timestamp columns, show only the date part
    const str = String(v);
    if (str.includes('T') && str.includes(':')) {
      v = new Date(str).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    valSet.add(String(v));
  });
  const uniqueVals = Array.from(valSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const toggle = (val: string) => {
    const next = new Set(selected);
    if (next.has(val)) next.delete(val); else next.add(val);
    setFilters({ ...filters, [colKey]: next.size === uniqueVals.length ? new Set() : next });
  };
  const selectAll = () => setFilters({ ...filters, [colKey]: new Set() });

  const handleOpen = (e: any) => {
    e.stopPropagation();
    if (!open && thRef.current) {
      const rect = thRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + window.scrollY, left: rect.left + window.scrollX });
    }
    setOpen(o => !o);
  };

  const H: any = 'th';
  const D: any = 'div';
  const Sp: any = 'span';
  const Lbl: any = 'label';
  const Inp: any = 'input';
  const Btn: any = 'button';

  return (
    <H ref={thRef} style={{ padding: '8px 10px', verticalAlign: 'middle', minWidth: width || 100, position: 'relative', fontSize: 12, fontWeight: 700, color: '#6B21A8', backgroundColor: '#F5F3FF', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', borderBottom: '2px solid #DDD6FE' }}>
      <D style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'space-between' }}>
        <D onClick={() => onSort(colKey)} style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 3, flex: 1 }}>
          {label}
          <Sp style={{ fontSize: 10, opacity: sortCol === colKey ? 1 : 0.3 }}>
            {sortCol === colKey ? (sortAsc ? '▲' : '▼') : '⇅'}
          </Sp>
        </D>
        <D
          onClick={handleOpen}
          style={{ cursor: 'pointer', fontSize: 13, lineHeight: 1, color: isFiltered ? '#6B21A8' : '#9CA3AF', background: isFiltered ? '#EDE9FE' : 'transparent', borderRadius: 4, padding: '2px 5px', border: isFiltered ? '1px solid #DDD6FE' : '1px solid transparent' }}
          title="Filtrar"
        >
          {isFiltered ? '🔽' : '▾'}
        </D>
      </D>

      {open && (
        <D
          style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, zIndex: 99999, backgroundColor: 'white', border: '1px solid #DDD6FE', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', minWidth: 200, maxHeight: 320, display: 'flex', flexDirection: 'column' }}
          onMouseDown={(e: any) => e.stopPropagation()}
          onClick={(e: any) => e.stopPropagation()}
        >
          <D style={{ padding: '10px 12px 8px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Lbl style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#6B21A8' }}>
              <Inp type="checkbox" checked={allSelected} onChange={selectAll} style={{ cursor: 'pointer', width: 15, height: 15, accentColor: '#6B21A8' }} />
              Seleccionar todo
            </Lbl>
            <Btn onClick={(e: any) => { e.stopPropagation(); setOpen(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9CA3AF' }}>✕</Btn>
          </D>
          <D style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
            {uniqueVals.map((val: string) => (
              <Lbl key={val} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                <Inp
                  type="checkbox"
                  checked={allSelected || selected.has(val)}
                  onChange={() => toggle(val)}
                  style={{ cursor: 'pointer', width: 15, height: 15, accentColor: '#6B21A8', flexShrink: 0 }}
                />
                <Sp style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</Sp>
              </Lbl>
            ))}
          </D>
        </D>
      )}
    </H>
  );
}

export default function AdminPanelScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Password visibility
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Users table: sort + per-column filters
  const [userSortCol, setUserSortCol] = useState<string>('');
  const [userSortAsc, setUserSortAsc] = useState(true);
  const [userColFilters, setUserColFilters] = useState<Record<string, Set<string>>>({});

  // Participants table: sort + per-column filters
  const [partSortCol, setPartSortCol] = useState<string>('');
  const [partSortAsc, setPartSortAsc] = useState(true);
  const [partColFilters, setPartColFilters] = useState<Record<string, Set<string>>>({});

  // Change admin password (Config section)
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [confirmAdminPassword, setConfirmAdminPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingAdminPassword, setSavingAdminPassword] = useState(false);
  const [adminPasswordSaved, setAdminPasswordSaved] = useState<'success' | 'error' | 'mismatch' | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentView, setCurrentView] = useState<AdminView>('events');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(true);

    // Recordar sesión: si ya se inició sesión antes en este navegador, saltar la pantalla de contraseña
    useEffect(() => {
      if (localStorage.getItem('nospi_admin_session') === 'true') {
        setIsAuthenticated(true);
        setShowPasswordModal(false);
        loadDashboardData();
      }
    }, []);

  // App config state
  const [configEventPrice, setConfigEventPrice] = useState('');
  const [configSupportEmail, setConfigSupportEmail] = useState('');
  const [configSupportWhatsapp, setConfigSupportWhatsapp] = useState('');
  const [configTestPaymentEnabled, setConfigTestPaymentEnabled] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState<'success' | 'error' | null>(null);

  // Dashboard stats
  const [totalEvents, setTotalEvents] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalAppointments, setTotalAppointments] = useState(0);
  const [activeEvents, setActiveEvents] = useState(0);
  const [funnelData, setFunnelData] = useState<{step: string; count: number; pct: number}[]>([]);
  const [funnelDateFrom, setFunnelDateFrom] = useState<string>(new Date().toLocaleDateString('en-CA'));
  const [funnelDateTo, setFunnelDateTo] = useState<string>(new Date().toLocaleDateString('en-CA'));
  const [funnelTimeFrom, setFunnelTimeFrom] = useState<string>('00:00');
  const [funnelTimeTo, setFunnelTimeTo] = useState<string>('23:59');
  const [funnelUtmSource, setFunnelUtmSource] = useState<string>('');
  const [funnelLoading, setFunnelLoading] = useState<boolean>(false);
  const [sessionData, setSessionData] = useState<{step: string; count: number}[]>([]);

  // Data lists
  const [events, setEvents] = useState<Event[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userRatingAverages, setUserRatingAverages] = useState<Record<string, { avg: number; count: number }>>({}); 
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [paymentAttempts, setPaymentAttempts] = useState<any[]>([]);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileMessage, setReconcileMessage] = useState<string | null>(null);
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);
  const [eventParticipants, setEventParticipants] = useState<EventParticipant[]>([]);

  // Event attendees modal
  const [showAttendeesModal, setShowAttendeesModal] = useState(false);
  const [selectedEventForAttendees, setSelectedEventForAttendees] = useState<Event | null>(null);
  const [eventAttendees, setEventAttendees] = useState<EventAttendee[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);

  // Move attendee modal
  const [showMoveAttendeeModal, setShowMoveAttendeeModal] = useState(false);
  const [selectedAttendeeToMove, setSelectedAttendeeToMove] = useState<EventAttendee | null>(null);
  const [targetEventId, setTargetEventId] = useState<string>('');

  // Edit user modal
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserForm, setEditUserForm] = useState<Record<string, any>>({});
  const [savingUserEdit, setSavingUserEdit] = useState(false);
  const [userEditError, setUserEditError] = useState<string | null>(null);
  const [movingAttendee, setMovingAttendee] = useState(false);

  // Add existing user to event modal
  const [showAddExistingUserModal, setShowAddExistingUserModal] = useState(false);
  const [addUserSearchQuery, setAddUserSearchQuery] = useState('');
  const [addingUserId, setAddingUserId] = useState<string | null>(null);
  const [addUserError, setAddUserError] = useState<string | null>(null);
  const [addUserSuccess, setAddUserSuccess] = useState<string | null>(null);

  // Manual confirmation


  // Event creation/edit modal
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState({
    name: '',
    city: '',
    description: '',
    type: 'bar',
    date: '',
    time: '',
    location_name: '',
    location_address: '',
    maps_link: '',
    max_participants: 6,
    is_location_revealed: false,
    event_status: 'draft' as 'draft' | 'published' | 'closed',
    confirmation_code: '1986',
  });

  // Event questions management (for specific event)
  const [eventQuestions, setEventQuestions] = useState<{
    divertido: string[];
    sensual: string[];
    atrevido: string[];
  }>({
    divertido: [],
    sensual: [],
    atrevido: [],
  });
  const [showEventQuestionsSection, setShowEventQuestionsSection] = useState(false);

  // Question management
  const [showQuestionsModal, setShowQuestionsModal] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<'divertido' | 'sensual' | 'atrevido'>('divertido');
  const [newQuestionText, setNewQuestionText] = useState('');
  const [draggedQuestionId, setDraggedQuestionId] = useState<string | null>(null);

  // Matches and ratings

  // Realtime monitoring
  const [selectedEventForMonitoring, setSelectedEventForMonitoring] = useState<string | null>(null);

  // Participantes por evento
  const [selectedParticipantEventId, setSelectedParticipantEventId] = useState<string>('');
  const [participantAttendees, setParticipantAttendees] = useState<EventAttendee[]>([]);
  const [loadingParticipantAttendees, setLoadingParticipantAttendees] = useState(false);
  const [participantTab, setParticipantTab] = useState<'confirmada' | 'cancelada' | 'anterior'>('confirmada');
  const [declinedPayments, setDeclinedPayments] = useState<any[]>([]);
  const [loadingDeclinedPayments, setLoadingDeclinedPayments] = useState(false);

  // NEW: Event configuration modal
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedEventForConfig, setSelectedEventForConfig] = useState<Event | null>(null);
  // Envío masivo de WhatsApp de confirmación: uno por uno (el navegador móvil
  // bloquea varias pestañas si se abren todas de una), por eso mostramos un
  // modal con un botón individual por persona pendiente.
  const [bulkWhatsAppPending, setBulkWhatsAppPending] = useState<Appointment[] | null>(null);
  // Envío masivo de WhatsApp a pagos declinados: mismo motivo — uno por uno
  // en vez de abrir todas las pestañas de golpe (se bloquean en móvil).
  const [bulkDeclinedPending, setBulkDeclinedPending] = useState<any[] | null>(null);
  // Recordatorios de evento (48h / mismo día): mismo motivo que arriba — uno
  // por uno en vez de abrir todas las pestañas de golpe.
  const [reminderWhatsAppModal, setReminderWhatsAppModal] = useState<{ list: Appointment[]; kind: '48h' | 'sameday' } | null>(null);
  const buildReminderLinkForModal = (a: Appointment) => {
    if (!reminderWhatsAppModal || !selectedEventForConfig) return '';
    return reminderWhatsAppModal.kind === '48h'
    ? buildEventReminderWhatsAppLink(a.users.phone, a.users.name, selectedEventForConfig.name, selectedEventForConfig.date, selectedEventForConfig.time, selectedEventForConfig.is_location_revealed, selectedEventForConfig.location_name, selectedEventForConfig.location_address, selectedEventForConfig.maps_link)
      : buildSameDayWhatsAppLink(a.users.phone, a.users.name, selectedEventForConfig.name, selectedEventForConfig.time, selectedEventForConfig.location_name, selectedEventForConfig.location_address, selectedEventForConfig.maps_link);
  };

  // Matches and ratings state
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [eventMatches, setEventMatches] = useState<any[]>([]);
  const [eventRatings, setEventRatings] = useState<any[]>([]);
  const [selectedEventForMatches, setSelectedEventForMatches] = useState<string | null>(null);

  useEffect(() => {
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadDashboardData();
      loadAppConfig();
    }
  }, [isAuthenticated]);

  // Realtime subscription for events table
  useEffect(() => {
    if (!isAuthenticated) return;


    const eventsChannel = supabase
      .channel('admin_events_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'events',
        },
        (payload) => {
          loadDashboardData();
        }
      )
      .subscribe((status) => {
      });

    return () => {
      supabase.removeChannel(eventsChannel);
    };
  }, [isAuthenticated]);

  // Realtime subscription for event participants
  useEffect(() => {
    if (!isAuthenticated || !selectedEventForMonitoring) return;


    const channel = supabase
      .channel(`admin_event_${selectedEventForMonitoring}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_participants',
          filter: `event_id=eq.${selectedEventForMonitoring}`,
        },
        (payload) => {
          loadEventParticipants(selectedEventForMonitoring);
        }
      )
      .subscribe((status) => {
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, selectedEventForMonitoring]);

  const loadAppConfig = async () => {
    const { data, error } = await supabase.from('app_config').select('key, value');
    if (error || !data) return;
    for (const row of data) {
      if (row.key === 'event_price') setConfigEventPrice(row.value);
      if (row.key === 'support_email') setConfigSupportEmail(row.value);
      if (row.key === 'support_whatsapp') setConfigSupportWhatsapp(row.value);
      if (row.key === 'test_payment_enabled') setConfigTestPaymentEnabled(row.value === 'true');
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    setConfigSaved(null);
    try {
      const rows = [
        { key: 'event_price', value: configEventPrice.trim() },
        { key: 'support_email', value: configSupportEmail.trim() },
        { key: 'support_whatsapp', value: configSupportWhatsapp.trim() },
        { key: 'test_payment_enabled', value: configTestPaymentEnabled ? 'true' : 'false' },
      ];
      const { error } = await supabase.from('app_config').upsert(rows, { onConflict: 'key' });
      if (error) {
        console.error('Error saving config:', error.message);
        setConfigSaved('error');
        return;
      }
      setConfigSaved('success');
      setTimeout(() => setConfigSaved(null), 3000);
    } catch (err) {
      console.error('Unexpected error saving config:', err);
      setConfigSaved('error');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleChangeAdminPassword = async () => {
    if (!newAdminPassword.trim()) {
      setAdminPasswordSaved('error');
      setTimeout(() => setAdminPasswordSaved(null), 3000);
      return;
    }
    if (newAdminPassword !== confirmAdminPassword) {
      setAdminPasswordSaved('mismatch');
      setTimeout(() => setAdminPasswordSaved(null), 3000);
      return;
    }
    setSavingAdminPassword(true);
    setAdminPasswordSaved(null);
    try {
      const { error } = await supabase
        .from('app_config')
        .upsert({ key: 'admin_password', value: newAdminPassword.trim() }, { onConflict: 'key' });
      if (error) {
        setAdminPasswordSaved('error');
      } else {
        setAdminPasswordSaved('success');
        setNewAdminPassword('');
        setConfirmAdminPassword('');
        setTimeout(() => setAdminPasswordSaved(null), 3000);
      }
    } catch {
      setAdminPasswordSaved('error');
    } finally {
      setSavingAdminPassword(false);
    }
  };

  const handlePasswordSubmit = async () => {
    // Check app_config first, fallback to hardcoded
    const { data } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'admin_password')
      .single();
    const correctPassword = data?.value || 'nospi2024';
    if (adminPassword === correctPassword) {
      setIsAuthenticated(true);
      setShowPasswordModal(false);
      localStorage.setItem('nospi_admin_session', 'true');
      loadDashboardData();
    } else {
      window.alert('Contraseña incorrecta');
    }
  };

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Load events
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .order('date', { ascending: false });

      if (eventsError) {
        console.error('Error loading events:', eventsError);
        window.alert('Error al cargar eventos: ' + eventsError.message);
      } else {
        setEvents(eventsData || []);
        setTotalEvents(eventsData?.length || 0);
        const activeCount = eventsData?.filter(e => e.event_status === 'published').length || 0;
        setActiveEvents(activeCount);
      }

      // Load users using the secure admin function
      const { data: usersData, error: usersError } = await supabase
        .rpc('get_all_users_for_admin');

      if (usersError) {
        console.error('Error loading users:', usersError);
        window.alert('No se pudieron cargar los usuarios: ' + usersError.message);
      } else {
        // Also fetch created_at which the RPC may not return
        const { data: usersDates } = await supabase
          .rpc('get_user_created_dates');
        const datesMap: Record<string, string> = {};
        (usersDates || []).forEach((u: any) => { datesMap[u.id] = u.created_at; });
        const merged = (usersData || []).map((u: any) => ({
          ...u,
          created_at: u.created_at || datesMap[u.id] || null,
        }));
        setUsers(merged);
        setTotalUsers(merged.length);
      }

      // Load all event_ratings to compute per-user average ratings
      const { data: allRatings } = await supabase
        .from('event_ratings')
        .select('rated_user_id, rating');
      if (allRatings && allRatings.length > 0) {
        const map: Record<string, { sum: number; count: number }> = {};
        for (const r of allRatings) {
          if (!map[r.rated_user_id]) map[r.rated_user_id] = { sum: 0, count: 0 };
          map[r.rated_user_id].sum += r.rating;
          map[r.rated_user_id].count += 1;
        }
        const avgs: Record<string, { avg: number; count: number }> = {};
        for (const [uid, d] of Object.entries(map)) {
          avgs[uid] = { avg: d.sum / d.count, count: d.count };
        }
        setUserRatingAverages(avgs);
      }

      // Load appointments using the secure admin function
      const { data: appointmentsRawData, error: appointmentsError } = await supabase
        .rpc('get_all_appointments_for_admin');

      if (appointmentsError) {
        console.error('Error loading appointments:', appointmentsError);
      } else {
        
        // Transform the flat data structure into the nested structure expected by the UI
        const transformedAppointments = appointmentsRawData?.map((apt: any) => ({
          id: apt.id,
          user_id: apt.user_id,
          event_id: apt.event_id,
          status: apt.status,
          payment_status: apt.payment_status,
          created_at: apt.created_at,
          purchase_whatsapp_sent_at: apt.purchase_whatsapp_sent_at,
          users: {
            id: apt.user_id,
            name: apt.user_name,
            email: apt.user_email,
            phone: apt.user_phone,
            city: apt.user_city,
            country: apt.user_country,
            interested_in: apt.user_interested_in,
            gender: apt.user_gender,
            age: apt.user_age,
          },
          events: {
            id: apt.event_id,
            name: apt.event_name,
            city: apt.event_city,
            type: apt.event_type,
            date: apt.event_date,
            time: apt.event_time,
            confirmation_code: apt.event_confirmation_code,
            location: '',
            location_name: '',
            location_address: '',
            maps_link: '',
            is_location_revealed: false,
            address: null,
            start_time: null,
            max_participants: 0,
            current_participants: 0,
            status: '',
            event_status: 'published' as 'draft' | 'published' | 'closed',
            description: '',
          },
        })) || [];
        
        setAppointments(transformedAppointments);
        setTotalAppointments(transformedAppointments.length);
      }

      // Load payment_attempts para el reporte de reconciliación (pagos de Wompi vs. citas)
      const { data: paymentAttemptsData, error: paymentAttemptsError } = await supabase
        .from('payment_attempts')
        .select('*')
        .order('created_at', { ascending: false });
      if (paymentAttemptsError) {
        console.error('Error loading payment_attempts:', paymentAttemptsError);
      } else {
        setPaymentAttempts(paymentAttemptsData || []);
      }

      // Cargar pagos declinados (último intento de pago por usuario, sin importar el evento)
      try {
        await loadDeclinedPayments();
      } catch (e) { console.warn('Error cargando pagos declinados', e); }

      // Load funnel inicial sin filtros
      try {
        await loadFunnelData(new Date().toLocaleDateString('en-CA'), new Date().toLocaleDateString('en-CA'), '00:00', '23:59');
      } catch (e) { console.warn('Funnel error', e); }

    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      window.alert('Error inesperado al cargar datos: ' + String(error));
    } finally {
      setLoading(false);
    }
  };

  const EDITABLE_USER_FIELDS = ['name', 'email', 'phone', 'city', 'country', 'gender', 'interested_in', 'age', 'age_range_min', 'age_range_max', 'birthdate'];

  const handleOpenEditUser = (user: any) => {
    setEditingUserId(user.id);
    const form: Record<string, any> = {};
    EDITABLE_USER_FIELDS.forEach((f) => { form[f] = user[f] ?? ''; });
    setEditUserForm(form);
    setUserEditError(null);
    setShowEditUserModal(true);
  };

  const handleSaveUserEdit = async () => {
    if (!editingUserId) return;
    setSavingUserEdit(true);
    setUserEditError(null);
    try {
      // No enviar campos vacíos: algunos vienen sin cargar (ej. birthdate no
      // viene en la vista de asistentes por evento) y columnas obligatorias
      // como birthdate rechazan '' como fecha inválida, tumbando todo el guardado.
      const cleanUpdates: Record<string, any> = {};
      Object.entries(editUserForm).forEach(([k, v]) => {
        if (v !== '' && v !== null && v !== undefined) cleanUpdates[k] = v;
      });
      const { data, error } = await supabase.functions.invoke('admin-update-user', {
        body: { userId: editingUserId, updates: cleanUpdates },
      });
      if (error || data?.error) {
        setUserEditError(error?.message || data?.error || 'Error al guardar los cambios');
        return;
      }
      setShowEditUserModal(false);
      setEditingUserId(null);
      await loadDashboardData();
      // Refrescar también las vistas que muestran datos de usuarios en otro
      // formato (no se actualizan solas con loadDashboardData).
      if (selectedEventForAttendees) await handleViewAttendees(selectedEventForAttendees);
      if (selectedParticipantEventId) await loadParticipantAttendees(selectedParticipantEventId);
    } catch (e: any) {
      setUserEditError(e.message || 'Error inesperado al guardar');
    } finally {
      setSavingUserEdit(false);
    }
  };

  const handleAddExistingUserToEvent = async (userId: string) => {
    if (!selectedEventForConfig) return;
    setAddingUserId(userId);
    setAddUserError(null);
    setAddUserSuccess(null);
    try {
      const { data, error } = await supabase.functions.invoke('admin-add-user-to-event', {
        body: { userId, eventId: selectedEventForConfig.id },
      });
      if (error || data?.error) {
        setAddUserError(data?.error || error?.message || 'Error al agregar el usuario');
        return;
      }
      setAddUserSuccess(`${data.userName} fue agregado al evento correctamente.`);
      setAddUserSearchQuery('');
      await loadDashboardData();
    } catch (e: any) {
      setAddUserError(e.message || 'Error inesperado al agregar el usuario');
    } finally {
      setAddingUserId(null);
    }
  };

  const handleRunReconcile = async () => {
    setReconciling(true);
    setReconcileMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke('admin-reconcile-payments', { body: {} });
      if (error || data?.error) {
        setReconcileMessage('Error al verificar pagos: ' + (data?.error || error?.message));
        return;
      }
      const fixed = (data.results || []).filter((r: any) => r.appointmentConfirmed).length;
      setReconcileMessage(`Se revisaron ${data.checked} pago(s) pendientes. ${fixed} cita(s) confirmada(s) automáticamente.`);
      await loadDashboardData();
    } catch (e: any) {
      setReconcileMessage('Error inesperado: ' + e.message);
    } finally {
      setReconciling(false);
    }
  };

  const handleAddMissingAppointment = async (userId: string, eventId: string) => {
    const key = `pay_${userId}_${eventId}`;
    setResolvingKey(key);
    try {
      const { data, error } = await supabase.functions.invoke('admin-add-user-to-event', {
        body: { userId, eventId },
      });
      if (error || data?.error) {
        window.alert(data?.error || error?.message || 'Error al agregar la cita');
        return;
      }
      window.alert(`${data.userName} fue agregado al evento correctamente.`);
      await loadDashboardData();
    } catch (e: any) {
      window.alert('Error inesperado: ' + e.message);
    } finally {
      setResolvingKey(null);
    }
  };

  const handleMarkPaymentCompleted = async (appointmentId: string) => {
    const confirmed = window.confirm('¿Confirmas que este usuario sí pagó y quieres marcar el pago como completado?');
    if (!confirmed) return;
    setResolvingKey(`apt_${appointmentId}`);
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ payment_status: 'completed' })
        .eq('id', appointmentId);
      if (error) {
        window.alert('Error al actualizar: ' + error.message);
        return;
      }
      await loadDashboardData();
    } catch (e: any) {
      window.alert('Error inesperado: ' + e.message);
    } finally {
      setResolvingKey(null);
    }
  };

  const handleCancelUnpaidAppointment = async (appointmentId: string) => {
    const confirmed = window.confirm('¿Cancelar esta cita porque el pago nunca se completó?');
    if (!confirmed) return;
    setResolvingKey(`apt_${appointmentId}`);
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'cancelada' })
        .eq('id', appointmentId);
      if (error) {
        window.alert('Error al cancelar: ' + error.message);
        return;
      }
      await loadDashboardData();
    } catch (e: any) {
      window.alert('Error inesperado: ' + e.message);
    } finally {
      setResolvingKey(null);
    }
  };

  // Para el botón de WhatsApp en la tabla general de Usuarios, donde no hay un
  // evento único de contexto: usa la próxima cita confirmada de la persona
  // (o la más reciente, si ya no tiene ninguna futura). Devuelve la cita
  // completa (no solo el evento) para poder marcarla como "WhatsApp enviado".
  const getNextConfirmedAppointmentForUser = (userId: string) => {
    const userApts = appointments.filter(a => a.user_id === userId && a.status === 'confirmada' && a.events?.date);
    if (userApts.length === 0) return null;
    const now = new Date();
    const future = userApts.filter(a => new Date(a.events.date) >= now);
    const sorted = (future.length > 0 ? future : userApts).sort(
      (a, b) => new Date(a.events.date).getTime() - new Date(b.events.date).getTime()
    );
    return sorted[0] || null;
  };

  // Marca en la base de datos (y en el estado local, para no tener que
  // recargar todo) que ya se le mandó el WhatsApp de confirmación de compra
  // a esta cita puntual — así el botón masivo no se lo vuelve a mandar.
  const markPurchaseWhatsAppSent = async (appointmentId: string) => {
    const sentAt = new Date().toISOString();
    setAppointments(prev => prev.map(a => a.id === appointmentId ? { ...a, purchase_whatsapp_sent_at: sentAt } : a));
    try {
      await supabase.from('appointments').update({ purchase_whatsapp_sent_at: sentAt }).eq('id', appointmentId);
    } catch (e) { console.error('Error marcando WhatsApp enviado:', e); }
  };

  const loadEventParticipants = async (eventId: string) => {
    try {
      
      const { data, error } = await supabase
        .from('event_participants')
        .select(`
          id,
          event_id,
          user_id,
          confirmed,
          check_in_time,
          is_presented,
          presented_at,
          users (
            id,
            name,
            email,
            phone,
            city,
            country,
            interested_in,
            gender,
            age
          )
        `)
        .eq('event_id', eventId)
        .order('check_in_time', { ascending: false });

      if (error) {
        console.error('Error loading event participants:', error);
        return;
      }

      setEventParticipants(data || []);
    } catch (error) {
      console.error('Failed to load event participants:', error);
    }
  };

  const handleViewAttendees = async (event: Event) => {
    
    setSelectedEventForAttendees(event);
    setLoadingAttendees(true);
    setShowAttendeesModal(true);

    try {
      const { data, error } = await supabase
        .rpc('get_event_attendees_for_admin', { p_event_id: event.id });

      if (error) {
        console.error('❌ Error loading event attendees:', error);
        window.alert('No se pudieron cargar los asistentes: ' + error.message);
        setEventAttendees([]);
      } else {
        
        // Transform the flat data structure into the nested structure
        const transformedAttendees = data?.map((att: any) => ({
          id: att.id,
          user_id: att.user_id,
          event_id: att.event_id,
          status: att.status,
          payment_status: att.payment_status,
          created_at: att.created_at,
          purchase_whatsapp_sent_at: att.purchase_whatsapp_sent_at,
          users: {
            id: att.user_id,
            name: att.user_name,
            email: att.user_email,
            phone: att.user_phone,
            city: att.user_city,
            country: att.user_country,
            interested_in: att.user_interested_in,
            gender: att.user_gender,
            age: att.user_age,
            age_range_min: att.user_age_range_min,
            age_range_max: att.user_age_range_max,
          },
        })) || [];
        
        setEventAttendees(transformedAttendees);
      }
    } catch (error) {
      console.error('❌ Failed to load attendees:', error);
      window.alert('Error inesperado al cargar asistentes');
      setEventAttendees([]);
    } finally {
      setLoadingAttendees(false);
    }
  };

  const handleOpenMoveAttendeeModal = (attendee: EventAttendee) => {
    setSelectedAttendeeToMove(attendee);
    setTargetEventId('');
    setShowMoveAttendeeModal(true);
  };

  const handleMoveAttendee = async () => {
    if (!selectedAttendeeToMove || !targetEventId) {
      window.alert('Por favor selecciona un evento de destino');
      return;
    }

    const targetEvent = events.find(e => e.id === targetEventId);
    if (!targetEvent) {
      window.alert('Evento de destino no encontrado');
      return;
    }

    const confirmed = window.confirm(
      `¿Estás seguro de que quieres mover a ${selectedAttendeeToMove.users.name} al evento "${targetEvent.name || targetEvent.type + ' - ' + targetEvent.city}"?`
    );
    
    if (!confirmed) return;

    try {
      setMovingAttendee(true);

      // Update the appointment to point to the new event
      const { error } = await supabase
        .from('appointments')
        .update({ event_id: targetEventId, updated_at: new Date().toISOString() })
        .eq('id', selectedAttendeeToMove.id);

      if (error) {
        console.error('Error moving attendee:', error);
        window.alert('Error al mover asistente: ' + error.message);
        return;
      }

      window.alert(`${selectedAttendeeToMove.users.name} ha sido movido exitosamente al nuevo evento`);
      
      // Close modals and reload data
      setShowMoveAttendeeModal(false);
      setSelectedAttendeeToMove(null);
      setTargetEventId('');
      
      // Reload attendees list for current event
      if (selectedEventForAttendees) {
        handleViewAttendees(selectedEventForAttendees);
      }
      
      // Reload dashboard data
      loadDashboardData();
    } catch (error) {
      console.error('Failed to move attendee:', error);
      window.alert('Error inesperado al mover asistente');
    } finally {
      setMovingAttendee(false);
    }
  };

  const openCreateEventModal = () => {
    setEditingEventId(null);
    setEventForm({
      name: '',
      city: '',
      description: '',
      type: 'bar',
      date: '',
      time: '',
      location_name: '',
      location_address: '',
      maps_link: '',
      max_participants: 6,
      is_location_revealed: false,
      event_status: 'draft',
      confirmation_code: '1986',
    });
    // Load default questions for new event
    // No precargar preguntas hardcodeadas — saveEventQuestions copiará
    // automáticamente las preguntas globales de la DB al crear el evento.
    setEventQuestions({ divertido: [], sensual: [], atrevido: [] });
    setShowEventQuestionsSection(false);
    setShowEventModal(true);
  };

  const openEditEventModal = async (event: Event) => {
    setEditingEventId(event.id);
    
    let dateValue = '';
    let timeValue = '';
    
    if (event.start_time) {
      const startDate = new Date(event.start_time);
      dateValue = startDate.toISOString().split('T')[0];
      const hours = startDate.getHours().toString().padStart(2, '0');
      const minutes = startDate.getMinutes().toString().padStart(2, '0');
      timeValue = `${hours}:${minutes}`;
    } else if (event.date && event.time) {
      dateValue = event.date;
      timeValue = event.time;
    }
    
    setEventForm({
      name: event.name || '',
      city: event.city || '',
      description: event.description || '',
      type: event.type || 'bar',
      date: dateValue,
      time: timeValue,
      location_name: event.location_name || '',
      location_address: event.location_address || '',
      maps_link: event.maps_link || '',
      max_participants: event.max_participants || 6,
      is_location_revealed: event.is_location_revealed || false,
      event_status: event.event_status || 'draft',
      confirmation_code: event.confirmation_code || '1986',
    });

    // Load existing questions for this event
    try {
      const { data: existingQuestions, error } = await supabase
        .from('event_questions')
        .select('*')
        .eq('event_id', event.id)
        .order('question_order', { ascending: true });

      if (error) {
        console.error('Error loading event questions:', error);
      } else {
        const questionsByLevel = {
          divertido: existingQuestions?.filter(q => q.level === 'divertido').map(q => q.question_text) || [],
          sensual: existingQuestions?.filter(q => q.level === 'sensual').map(q => q.question_text) || [],
          atrevido: existingQuestions?.filter(q => q.level === 'atrevido').map(q => q.question_text) || [],
        };
        setEventQuestions(questionsByLevel);
      }
    } catch (error) {
      console.error('Failed to load event questions:', error);
    }

    setShowEventQuestionsSection(false);
    setShowEventModal(true);
  };

  const saveEventQuestions = async (eventId: string) => {
    try {
      // Verificar si el admin agregó preguntas custom para este evento
      const hasCustomQuestions = Object.values(eventQuestions).some(
        (list) => list.some((q) => q.trim().length > 0)
      );

      if (hasCustomQuestions) {
        // El admin configuró preguntas específicas — usarlas
        await supabase.from('event_questions').delete().eq('event_id', eventId);

        const questionsToInsert: any[] = [];
        let orderCounter = 0;

        for (const [level, questionsList] of Object.entries(eventQuestions)) {
          questionsList.forEach((questionText) => {
            if (questionText.trim()) {
              questionsToInsert.push({
                event_id: eventId,
                level,
                question_text: questionText.trim(),
                question_order: orderCounter++,
                is_default: false,
              });
            }
          });
        }

        const { error } = await supabase.from('event_questions').insert(questionsToInsert);
        if (error) {
          console.error('Error saving custom event questions:', error);
          window.alert('Advertencia: No se pudieron guardar las preguntas del evento');
        }
      } else {
        // No hay preguntas custom — copiar las globales (event_id = null) al evento
        const { data: globalQuestions, error: fetchError } = await supabase
          .from('event_questions')
          .select('level, question_text, question_order')
          .is('event_id', null)
          .order('level', { ascending: true })
          .order('question_order', { ascending: true });

        if (fetchError || !globalQuestions || globalQuestions.length === 0) {
          console.log('saveEventQuestions: no hay preguntas globales para copiar');
          return;
        }

        // Borrar preguntas previas del evento (por si es una edición)
        await supabase.from('event_questions').delete().eq('event_id', eventId);

        const questionsToInsert = globalQuestions.map((q, index) => ({
          event_id: eventId,
          level: q.level,
          question_text: q.question_text,
          question_order: index,
          is_default: true,
        }));

        const { error: insertError } = await supabase
          .from('event_questions')
          .insert(questionsToInsert);

        if (insertError) {
          console.error('Error copiando preguntas globales al evento:', insertError);
        } else {
          console.log(`saveEventQuestions: ${questionsToInsert.length} preguntas globales copiadas al evento`);
        }
      }
    } catch (error) {
      console.error('Failed to save event questions:', error);
    }
  };

  const handleSaveEvent = async () => {

    try {
      if (!eventForm.name || !eventForm.city) {
        window.alert('Por favor completa el nombre y la ciudad del evento');
        return;
      }

      if (!eventForm.date || !eventForm.time) {
        window.alert('Debes seleccionar fecha y hora válidas antes de guardar el evento.');
        return;
      }

      let finalConfirmationCode = eventForm.confirmation_code.trim();
      if (!finalConfirmationCode) {
        finalConfirmationCode = '1986';
      }

      const combinedDateString = `${eventForm.date}T${eventForm.time}:00`;
      const combinedDate = new Date(combinedDateString);

      if (isNaN(combinedDate.getTime())) {
        window.alert('Fecha u hora inválida.');
        return;
      }

      const isoDate = combinedDate.toISOString();

      // FIX: Map 'restaurant' to 'restaurante' to match database constraint
      const eventData = {
        name: eventForm.name,
        city: eventForm.city,
        description: eventForm.description,
        type: eventForm.type === 'restaurant' ? 'restaurante' : eventForm.type,
        date: isoDate,
        time: eventForm.time,
        location: eventForm.is_location_revealed && eventForm.location_name 
          ? eventForm.location_name 
          : 'Se revelará próximamente',
        location_name: eventForm.location_name,
        location_address: eventForm.location_address,
        maps_link: eventForm.maps_link,
        start_time: isoDate,
        max_participants: eventForm.max_participants,
        current_participants: 0,
        status: 'active',
        is_location_revealed: eventForm.is_location_revealed,
        event_status: eventForm.event_status,
        confirmation_code: finalConfirmationCode,
      };


      if (editingEventId) {
        const { data, error } = await supabase
          .from('events')
          .update(eventData)
          .eq('id', editingEventId)
          .select();

        if (error) {
          console.error('Error updating event:', error);
          window.alert('Error al actualizar evento: ' + error.message);
          return;
        }

        
        // Save event questions
        await saveEventQuestions(editingEventId);
        
        window.alert('Evento actualizado exitosamente');
      } else {
        const { data, error } = await supabase
          .from('events')
          .insert([eventData])
          .select();

        if (error) {
          console.error('Error creating event:', error);
          window.alert('Error al crear evento: ' + error.message);
          return;
        }

        
        // Save event questions for new event
        if (data && data[0]) {
          await saveEventQuestions(data[0].id);
        }
        
        window.alert('Evento creado exitosamente');
      }

      setShowEventModal(false);
      setEditingEventId(null);
      setEventForm({
        name: '',
        city: '',
        description: '',
        type: 'bar',
        date: '',
        time: '',
        location_name: '',
        location_address: '',
        maps_link: '',
        max_participants: 6,
        is_location_revealed: false,
        event_status: 'draft',
        confirmation_code: '1986',
      });
      setEventQuestions({
        divertido: [],
        sensual: [],
        atrevido: [],
      });
      loadDashboardData();
    } catch (error) {
      console.error('Unexpected error saving event:', error);
      window.alert('Error inesperado: ' + String(error));
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    const confirmed = window.confirm('¿Estás seguro de que quieres eliminar este evento?');
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId);

      if (error) {
        window.alert('Error al eliminar evento: ' + error.message);
        return;
      }

      window.alert('Evento eliminado exitosamente');
      loadDashboardData();
    } catch (error) {
      console.error('Failed to delete event:', error);
    }
  };

  const handleDuplicateEvent = async (event: Event) => {
    const confirmed = window.confirm(
      `¿Duplicar el evento "${event.name || event.type + ' - ' + event.city}"? Se copiará toda la info como borrador. Recuerda cambiarle la fecha.`
    );
    if (!confirmed) return;
    try {
      const { data: newEvent, error } = await supabase.from('events').insert({
        name: (event.name ? event.name + ' (copia)' : null),
        city: event.city,
        description: event.description,
        type: event.type,
        date: event.date,
        start_time: event.start_time,
        time: event.time,
        location_name: event.location_name,
        location_address: event.location_address,
        maps_link: event.maps_link,
        is_location_revealed: false,
        max_participants: event.max_participants,
        current_participants: 0,
        event_status: 'draft',
        confirmation_code: event.confirmation_code,
      }).select('id').single();

      if (error || !newEvent) {
        window.alert('Error al duplicar: ' + (error?.message || 'sin respuesta'));
        return;
      }

      // Copy questions from original event
      const { data: originalQuestions, error: qError } = await supabase
        .from('event_questions')
        .select('level, question_text, question_order, is_default')
        .eq('event_id', event.id)
        .order('level', { ascending: true })
        .order('question_order', { ascending: true });

      if (!qError && originalQuestions && originalQuestions.length > 0) {
        const questionsToInsert = originalQuestions.map((q) => ({
          event_id: newEvent.id,
          level: q.level,
          question_text: q.question_text,
          question_order: q.question_order,
          is_default: q.is_default,
        }));
        const { error: insertError } = await supabase
          .from('event_questions')
          .insert(questionsToInsert);
        if (insertError) {
          console.error('Error copiando preguntas:', insertError);
        }
      }

      window.alert('✅ Evento duplicado como borrador con sus preguntas. Recuerda cambiarle la fecha.');
      loadDashboardData();
    } catch (err) {
      window.alert('Error inesperado al duplicar');
    }
  };

  const handleRevealLocation = async (eventId: string) => {
    const confirmed = window.confirm('¿Revelar la ubicación de este evento?');
    if (!confirmed) return;

    try {
      const { data: eventData, error: fetchError } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (fetchError || !eventData) {
        window.alert('Error al obtener datos del evento');
        return;
      }

      // Build full location string for the app's `location` column
      const fullLocation = [eventData.location_name, eventData.location_address]
        .filter(Boolean).join(' — ') || 'Ubicación revelada';

      const { error } = await supabase
        .from('events')
        .update({ 
          is_location_revealed: true,
          location: fullLocation,
        })
        .eq('id', eventId);

      if (error) {
        window.alert('Error al revelar ubicación: ' + error.message);
        return;
      }

      window.alert('Ubicación revelada exitosamente');
      loadDashboardData();
    } catch (error) {
      console.error('Failed to reveal location:', error);
    }
  };

  const handleCloseEvent = async (eventId: string) => {
    const confirmed = window.confirm('¿Cerrar este evento?');
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('events')
        .update({ event_status: 'closed' })
        .eq('id', eventId);

      if (error) {
        window.alert('Error al cerrar evento: ' + error.message);
        return;
      }

      window.alert('Evento cerrado exitosamente');
      loadDashboardData();
    } catch (error) {
      console.error('Failed to close event:', error);
    }
  };

  const handleToggleRegistration = async (eventId: string, closeIt: boolean) => {
    const confirmed = window.confirm(closeIt ? 'Cerrar inscripciones de este evento' : 'Reabrir inscripciones de este evento'); 
    if (!confirmed) return;
    try {
      const { error } = await supabase
      .from('events')
      .update({ is_full: closeIt })
      .eq('id', eventId);
      if (error) {
        window.alert('Error al actualizar inscripciones: ' + error.message);
        return;
      }

      window.alert(closeIt ? 'Inscripciones cerradas' : 'Inscripciones reabiertas');
      loadDashboardData();
    } catch (error) {
      console.error('Failed to toggle registration:', error);
    }
  };

  const handlePublishEvent = async (eventId: string) => {
    const confirmed = window.confirm('¿Publicar este evento?');
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('events')
        .update({ event_status: 'published' })
        .eq('id', eventId);

      if (error) {
        window.alert('Error al publicar evento: ' + error.message);
        return;
      }

      window.alert('Evento publicado exitosamente');
      loadDashboardData();
    } catch (error) {
      console.error('Failed to publish event:', error);
    }
  };

  const loadQuestions = async () => {
    setLoadingQuestions(true);
    try {
      const { data, error } = await supabase
        .from('event_questions')
        .select('*')
        .is('event_id', null)
        .eq('level', selectedLevel)
        .order('question_order', { ascending: true });

      if (error) {
        console.error('Error loading questions:', error);
        window.alert('Error al cargar preguntas: ' + error.message);
        return;
      }

      setQuestions(data || []);
    } catch (error) {
      console.error('Failed to load questions:', error);
    } finally {
      setLoadingQuestions(false);
    }
  };

  const handleAddQuestion = async () => {
    if (!newQuestionText.trim()) {
      window.alert('Por favor ingresa el texto de la pregunta');
      return;
    }

    try {
      const maxOrder = questions.length > 0 ? Math.max(...questions.map(q => q.question_order)) : -1;

      const { error } = await supabase
        .from('event_questions')
        .insert({
          event_id: null,
          level: selectedLevel,
          question_text: newQuestionText.trim(),
          question_order: maxOrder + 1,
          is_default: true,
        });

      if (error) {
        console.error('Error adding question:', error);
        window.alert('Error al agregar pregunta: ' + error.message);
        return;
      }

      setNewQuestionText('');
      loadQuestions();
      window.alert('Pregunta agregada exitosamente');
    } catch (error) {
      console.error('Failed to add question:', error);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    const confirmed = window.confirm('¿Eliminar esta pregunta?');
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('event_questions')
        .delete()
        .eq('id', questionId);

      if (error) {
        console.error('Error deleting question:', error);
        window.alert('Error al eliminar pregunta: ' + error.message);
        return;
      }

      loadQuestions();
      window.alert('Pregunta eliminada exitosamente');
    } catch (error) {
      console.error('Failed to delete question:', error);
    }
  };

  const handleUpdateQuestion = async (questionId: string, newText: string) => {
    if (!newText.trim()) {
      window.alert('El texto de la pregunta no puede estar vacío');
      return;
    }

    try {
      const { error } = await supabase
        .from('event_questions')
        .update({ question_text: newText.trim(), updated_at: new Date().toISOString() })
        .eq('id', questionId);

      if (error) {
        console.error('Error updating question:', error);
        window.alert('Error al actualizar pregunta: ' + error.message);
        return;
      }

      loadQuestions();
      window.alert('Pregunta actualizada exitosamente');
    } catch (error) {
      console.error('Failed to update question:', error);
    }
  };

  // NEW: Restore default questions without duplicating
  const handleRestoreDefaultQuestions = async () => {
    const confirmed = window.confirm('¿Restaurar las preguntas predeterminadas? Esto NO eliminará las preguntas existentes, solo agregará las que falten.');
    if (!confirmed) return;

    setLoadingQuestions(true);
    try {
      // Get all existing questions
      const { data: existingQuestions, error: fetchError } = await supabase
        .from('event_questions')
        .select('question_text, level')
        .is('event_id', null);

      if (fetchError) {
        console.error('Error fetching existing questions:', fetchError);
        window.alert('Error al cargar preguntas existentes: ' + fetchError.message);
        return;
      }

      // Create a set of existing question texts per level for quick lookup
      const existingQuestionsSet = new Set(
        existingQuestions?.map(q => `${q.level}:${q.question_text.toLowerCase().trim()}`) || []
      );

      // Prepare questions to insert (only those that don't exist)
      const questionsToInsert: any[] = [];
      let orderCounter = 0;

      for (const [level, questionsList] of Object.entries(DEFAULT_QUESTIONS_DATA)) {
        questionsList.forEach((questionText) => {
          const key = `${level}:${questionText.toLowerCase().trim()}`;
          if (!existingQuestionsSet.has(key)) {
            questionsToInsert.push({
              event_id: null,
              level: level,
              question_text: questionText,
              question_order: orderCounter++,
              is_default: true,
            });
          }
        });
      }

      if (questionsToInsert.length === 0) {
        window.alert('Todas las preguntas predeterminadas ya existen. No se agregó ninguna pregunta nueva.');
        return;
      }

      // Insert new questions
      const { error: insertError } = await supabase
        .from('event_questions')
        .insert(questionsToInsert);

      if (insertError) {
        console.error('Error inserting default questions:', insertError);
        window.alert('Error al restaurar preguntas: ' + insertError.message);
        return;
      }

      window.alert(`✅ Se restauraron ${questionsToInsert.length} preguntas predeterminadas exitosamente.`);
      loadQuestions();
    } catch (error) {
      console.error('Failed to restore default questions:', error);
      window.alert('Error inesperado al restaurar preguntas');
    } finally {
      setLoadingQuestions(false);
    }
  };

  // NEW: Download template for mass upload
  const handleDownloadTemplate = () => {
    const data = [
      { nivel: 'divertido', pregunta: '¿Cuál es tu mayor sueño?' },
      { nivel: 'sensual',   pregunta: '¿Qué te atrae de una persona?' },
      { nivel: 'atrevido',  pregunta: '¿Cuál es tu secreto mejor guardado?' },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    // Ajustar ancho de columnas
    ws['!cols'] = [{ wch: 12 }, { wch: 60 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
    XLSX.writeFile(wb, 'plantilla_preguntas.xlsx');
  };

  const handleMassUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          const workbook = XLSX.read(arrayBuffer, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

          const questionsToInsert: any[] = [];
          let orderCounter = 0;

          for (const row of rows) {
            const level = String(row.nivel || row.Nivel || row.NIVEL || '').trim().toLowerCase();
            const questionText = String(row.pregunta || row.Pregunta || row.PREGUNTA || '').trim();

            if (!level || !questionText) continue;
            if (!['divertido', 'sensual', 'atrevido'].includes(level)) continue;

            questionsToInsert.push({
              event_id: null,
              level,
              question_text: questionText,
              question_order: orderCounter++,
              is_default: true,
            });
          }

          if (questionsToInsert.length === 0) {
            window.alert('No se encontraron preguntas válidas. Asegúrate de usar las columnas "nivel" y "pregunta".');
            return;
          }

          const { error } = await supabase.from('event_questions').insert(questionsToInsert);

          if (error) {
            console.error('Error uploading questions:', error);
            window.alert('Error al cargar preguntas: ' + error.message);
            return;
          }

          window.alert(`✅ Se cargaron ${questionsToInsert.length} preguntas exitosamente`);
          loadQuestions();
        } catch (error) {
          console.error('Failed to parse file:', error);
          window.alert('Error al procesar el archivo. Asegúrate de que sea un Excel (.xlsx) o CSV válido.');
        }
      };
      reader.readAsArrayBuffer(file);
    };
    input.click();
  };

  const handleDragStart = (questionId: string) => {
    setDraggedQuestionId(questionId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (targetQuestionId: string) => {
    if (!draggedQuestionId || draggedQuestionId === targetQuestionId) {
      setDraggedQuestionId(null);
      return;
    }

    const draggedIndex = questions.findIndex(q => q.id === draggedQuestionId);
    const targetIndex = questions.findIndex(q => q.id === targetQuestionId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedQuestionId(null);
      return;
    }

    // Reorder questions array
    const newQuestions = [...questions];
    const [draggedQuestion] = newQuestions.splice(draggedIndex, 1);
    newQuestions.splice(targetIndex, 0, draggedQuestion);

    // Update question_order for all questions
    const updates = newQuestions.map((q, index) => ({
      id: q.id,
      question_order: index,
    }));

    // Optimistically update UI
    setQuestions(newQuestions);
    setDraggedQuestionId(null);

    // Update database
    try {
      for (const update of updates) {
        const { error } = await supabase
          .from('event_questions')
          .update({ question_order: update.question_order, updated_at: new Date().toISOString() })
          .eq('id', update.id);

        if (error) {
          console.error('Error updating question order:', error);
          window.alert('Error al reordenar preguntas: ' + error.message);
          loadQuestions(); // Reload to revert
          return;
        }
      }

    } catch (error) {
      console.error('Failed to reorder questions:', error);
      window.alert('Error inesperado al reordenar preguntas');
      loadQuestions(); // Reload to revert
    }
  };

  const handleDeleteAttendee = async (attendeeId: string, attendeeName: string) => {
    const confirmed = window.confirm(`¿Estás seguro de que quieres eliminar a ${attendeeName} de este evento?`);
    if (!confirmed) return;

    try {
      
      // Delete from appointments table
      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', attendeeId);

      if (error) {
        console.error('Error deleting attendee:', error);
        window.alert('Error al eliminar asistente: ' + error.message);
        return;
      }

      window.alert('Asistente eliminado exitosamente');
      
      // Reload attendees list
      if (selectedEventForAttendees) {
        handleViewAttendees(selectedEventForAttendees);
      }
    } catch (error) {
      console.error('Failed to delete attendee:', error);
      window.alert('Error inesperado al eliminar asistente');
    }
  };

  const loadEventMatchesAndRatings = async (eventId: string) => {
    setLoadingMatches(true);
    try {
      // Load matches
      const { data: matchesData, error: matchesError } = await supabase
        .from('event_matches')
        .select(`
          *,
          user1:users!event_matches_user1_id_fkey(id, name, email),
          user2:users!event_matches_user2_id_fkey(id, name, email)
        `)
        .eq('event_id', eventId)
        .order('level', { ascending: true })
        .order('created_at', { ascending: true });

      if (matchesError) {
        console.error('Error loading matches:', matchesError);
      } else {
        setEventMatches(matchesData || []);
      }

      // Load ratings
      const { data: ratingsData, error: ratingsError } = await supabase
        .from('event_ratings')
        .select(`
          *,
          rater:users!event_ratings_rater_user_id_fkey(id, name),
          rated:users!event_ratings_rated_user_id_fkey(id, name)
        `)
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });

      if (ratingsError) {
        console.error('Error loading ratings:', ratingsError);
      } else {
        setEventRatings(ratingsData || []);
      }
    } catch (error) {
      console.error('Failed to load matches and ratings:', error);
    } finally {
      setLoadingMatches(false);
    }
  };

  // NEW: Open configuration modal
  const handleOpenConfigModal = (event: Event) => {
    setSelectedEventForConfig(event);
    setShowConfigModal(true);
  };

  const handleSyncQuestionsToAllEvents = async () => {
    const confirmed = window.confirm(
      '¿Copiar las preguntas globales a TODOS los eventos que no tienen preguntas propias? ' +
      'Los eventos que ya tienen preguntas configuradas NO serán modificados.'
    );
    if (!confirmed) return;

    setLoadingQuestions(true);
    try {
      // 1. Traer todas las preguntas globales
      const { data: globalQuestions, error: fetchError } = await supabase
        .from('event_questions')
        .select('level, question_text, question_order')
        .is('event_id', null)
        .order('level', { ascending: true })
        .order('question_order', { ascending: true });

      if (fetchError || !globalQuestions || globalQuestions.length === 0) {
        window.alert('No hay preguntas globales para sincronizar. Agrega preguntas primero.');
        return;
      }

      // 2. Traer todos los eventos publicados y en borrador
      const { data: allEvents, error: eventsError } = await supabase
        .from('events')
        .select('id')
        .in('event_status', ['published', 'draft']);

      if (eventsError || !allEvents || allEvents.length === 0) {
        window.alert('No se encontraron eventos.');
        return;
      }

      // 3. Para cada evento, verificar si ya tiene preguntas propias
      let synced = 0;
      let skipped = 0;

      for (const event of allEvents) {
        const { data: existing } = await supabase
          .from('event_questions')
          .select('id')
          .eq('event_id', event.id)
          .limit(1);

        if (existing && existing.length > 0) {
          skipped++;
          continue; // Ya tiene preguntas — no tocar
        }

        // No tiene preguntas — copiar las globales
        const toInsert = globalQuestions.map((q, index) => ({
          event_id: event.id,
          level: q.level,
          question_text: q.question_text,
          question_order: index,
          is_default: true,
        }));

        const { error: insertError } = await supabase
          .from('event_questions')
          .insert(toInsert);

        if (!insertError) synced++;
      }

      window.alert(
        `✅ Sincronización completada.
` +
        `• ${synced} evento(s) actualizados con las preguntas globales.
` +
        `• ${skipped} evento(s) omitidos (ya tenían preguntas propias).`
      );
    } catch (err: any) {
      console.error('handleSyncQuestionsToAllEvents error:', err);
      window.alert('Error inesperado: ' + err.message);
    } finally {
      setLoadingQuestions(false);
    }
  };

  const renderQuestions = () => {
    return (
      <View style={styles.listContainer}>
        <Text style={styles.sectionTitle}>Preguntas Globales</Text>
        <Text style={{ fontSize: 15, color: '#6B7280', marginBottom: 24 }}>
          Estas preguntas aplican a todos los eventos. Puedes reordenarlas arrastrando.
        </Text>

        <View style={styles.levelSelector}>
          <TouchableOpacity
            style={[styles.levelButton, selectedLevel === 'divertido' && styles.levelButtonActive]}
            onPress={() => { setSelectedLevel('divertido'); setTimeout(loadQuestions, 0); }}
          >
            <Text style={[styles.levelButtonText, selectedLevel === 'divertido' && styles.levelButtonTextActive]}>
              😄 Divertido
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.levelButton, selectedLevel === 'sensual' && styles.levelButtonActive]}
            onPress={() => { setSelectedLevel('sensual'); setTimeout(loadQuestions, 0); }}
          >
            <Text style={[styles.levelButtonText, selectedLevel === 'sensual' && styles.levelButtonTextActive]}>
              😘 Sensual
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.levelButton, selectedLevel === 'atrevido' && styles.levelButtonActive]}
            onPress={() => { setSelectedLevel('atrevido'); setTimeout(loadQuestions, 0); }}
          >
            <Text style={[styles.levelButtonText, selectedLevel === 'atrevido' && styles.levelButtonTextActive]}>
              🔥 Atrevido
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.addQuestionSection}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Nueva pregunta..."
            value={newQuestionText}
            onChangeText={setNewQuestionText}
            onSubmitEditing={handleAddQuestion}
          />
          <TouchableOpacity style={styles.addButton} onPress={handleAddQuestion}>
            <Text style={styles.addButtonText}>+ Agregar</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bulkActionsSection}>
          <TouchableOpacity style={styles.bulkActionButton} onPress={handleRestoreDefaultQuestions}>
            <Text style={styles.bulkActionButtonText}>🔄 Restaurar predeterminadas</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bulkActionButton} onPress={handleDownloadTemplate}>
            <Text style={styles.bulkActionButtonText}>📥 Descargar plantilla Excel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bulkActionButton} onPress={handleMassUpload}>
            <Text style={styles.bulkActionButtonText}>📤 Cargar desde Excel (.xlsx)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bulkActionButton, { backgroundColor: '#D1FAE5', borderWidth: 1, borderColor: '#059669' }]}
            onPress={handleSyncQuestionsToAllEvents}
          >
            <Text style={[styles.bulkActionButtonText, { color: '#065F46' }]}>
              📋 Sincronizar a todos los eventos
            </Text>
          </TouchableOpacity>
        </View>

        {loadingQuestions ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={nospiColors.purpleDark} />
            <Text style={styles.loadingText}>Cargando preguntas...</Text>
          </View>
        ) : questions.length === 0 ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Text style={{ fontSize: 16, color: '#9CA3AF' }}>
              No hay preguntas para este nivel. Agrega una o restaura las predeterminadas.
            </Text>
          </View>
        ) : (
          <View>
            {questions.map((question, index) => (
              <div
                key={question.id}
                draggable
                onDragStart={() => handleDragStart(question.id)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(question.id)}
                style={{ cursor: 'grab', opacity: draggedQuestionId === question.id ? 0.5 : 1 }}
              >
                <View style={styles.questionItem}>
                  <Text style={styles.dragHandle}>⋮⋮</Text>
                  <Text style={styles.questionNumber}>#{index + 1}</Text>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    value={question.question_text}
                    onChangeText={(text) => {
                      const updated = [...questions];
                      updated[index].question_text = text;
                      setQuestions(updated);
                    }}
                    onBlur={() => handleUpdateQuestion(question.id, question.question_text)}
                  />
                  <TouchableOpacity
                    style={styles.deleteQuestionButton}
                    onPress={() => handleDeleteQuestion(question.id)}
                  >
                    <Text style={styles.deleteQuestionButtonText}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </div>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderReconciliation = () => {
    const orphanPayments = paymentAttempts.filter((pa: any) => {
      if (pa.status !== 'APPROVED' || !pa.user_id || !pa.event_id) return false;
      return !appointments.some(
        (a) => a.user_id === pa.user_id && a.event_id === pa.event_id && a.payment_status === 'completed'
      );
    });

    const orphanAppointments = appointments.filter(
      (a) => a.status === 'confirmada' && a.payment_status !== 'completed'
    );

    const pendingCount = paymentAttempts.filter(
      (pa: any) => !['APPROVED', 'DECLINED', 'VOIDED', 'ERROR'].includes(pa.status)
    ).length;

    return (
      <View style={styles.listContainer}>
        <Text style={styles.sectionTitle}>🔄 Reconciliación de Pagos</Text>
        <Text style={{ fontSize: 15, color: '#6B7280', marginBottom: 20 }}>
          Compara los pagos aprobados en Wompi contra las citas confirmadas en la app, para detectar usuarios que pagaron sin quedar inscritos, o inscripciones sin pago aprobado detrás.
        </Text>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28, flexWrap: 'wrap' }}>
          <button
            onClick={handleRunReconcile}
            disabled={reconciling}
            style={{
              backgroundColor: nospiColors.purpleDark, color: 'white', border: 'none',
              borderRadius: 10, padding: '12px 20px', fontSize: 14, fontWeight: 700,
              cursor: reconciling ? 'default' : 'pointer', opacity: reconciling ? 0.6 : 1,
            }}
          >
            {reconciling ? 'Verificando...' : '🔄 Verificar pagos pendientes en Wompi'}
          </button>
          {pendingCount > 0 && (
            <span style={{ fontSize: 13, color: '#9CA3AF' }}>{pendingCount} pago(s) todavía sin confirmar por Wompi (pendientes)</span>
          )}
          {reconcileMessage && (
            <span style={{ fontSize: 13, color: '#6B21A8', fontWeight: 600 }}>{reconcileMessage}</span>
          )}
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', marginBottom: 24, borderLeft: '4px solid #EF4444' }}>
          <Text style={styles.subsectionTitle}>💳 Pagos aprobados sin cita confirmada ({orphanPayments.length})</Text>
          <Text style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 16 }}>
            Wompi aprobó el pago pero no hay una cita con payment_status = completed para ese usuario y evento.
          </Text>
          {orphanPayments.length === 0 ? (
            <Text style={{ fontSize: 14, color: '#10B981', fontWeight: 600 }}>✅ No hay pagos huérfanos por ahora.</Text>
          ) : (
            orphanPayments.map((pa: any) => {
              const u = users.find((x) => x.id === pa.user_id);
              const ev = events.find((x) => x.id === pa.event_id);
              const key = `pay_${pa.user_id}_${pa.event_id}`;
              return (
                <div key={pa.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '1px solid #F3F4F6', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>{u?.name || pa.user_id}</div>
                    <div style={{ fontSize: 12, color: '#6B7280' }}>{u?.phone || ''} · {ev?.name || pa.event_id} · {ev?.date || ''}</div>
                    <div style={{ fontSize: 11, color: '#9CA3AF' }}>Transacción {pa.transaction_id} · {pa.payment_method} · ${Number(pa.amount || 0).toLocaleString('es-CO')} COP</div>
                  </div>
                  <button
                    onClick={() => handleAddMissingAppointment(pa.user_id, pa.event_id)}
                    disabled={resolvingKey === key}
                    style={{
                      backgroundColor: '#10B981', color: 'white', border: 'none', borderRadius: 8,
                      padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      opacity: resolvingKey === key ? 0.6 : 1,
                    }}
                  >
                    {resolvingKey === key ? 'Agregando...' : '✅ Agregar cita'}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderLeft: '4px solid #F59E0B' }}>
          <Text style={styles.subsectionTitle}>📝 Citas confirmadas sin pago aprobado ({orphanAppointments.length})</Text>
          <Text style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 16 }}>
            El usuario quedó inscrito al evento, pero no hay un pago con payment_status = completed detrás.
          </Text>
          {orphanAppointments.length === 0 ? (
            <Text style={{ fontSize: 14, color: '#10B981', fontWeight: 600 }}>✅ No hay inscripciones sin pago por ahora.</Text>
          ) : (
            orphanAppointments.map((a) => {
              const key = `apt_${a.id}`;
              return (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '1px solid #F3F4F6', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>{a.users?.name}</div>
                    <div style={{ fontSize: 12, color: '#6B7280' }}>{a.users?.phone} · {a.events?.name} · {a.events?.date}</div>
                    <div style={{ fontSize: 11, color: '#9CA3AF' }}>Estado de pago: {a.payment_status} · Inscrito: {new Date(a.created_at).toLocaleDateString('es-CO')}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleMarkPaymentCompleted(a.id)}
                      disabled={resolvingKey === key}
                      style={{ backgroundColor: '#10B981', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: resolvingKey === key ? 0.6 : 1 }}
                    >
                      Marcar pago completado
                    </button>
                    <button
                      onClick={() => handleCancelUnpaidAppointment(a.id)}
                      disabled={resolvingKey === key}
                      style={{ backgroundColor: '#EF4444', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: resolvingKey === key ? 0.6 : 1 }}
                    >
                      Cancelar cita
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </View>
    );
  };

  const renderConfig = () => {
    const toastColor = configSaved === 'success' ? '#10B981' : '#EF4444';
    return (
      <View style={styles.listContainer}>
        <Text style={styles.sectionTitle}>⚙️ Configuración de la App</Text>
        <Text style={{ fontSize: 15, color: '#6B7280', marginBottom: 28 }}>
          Estos valores se aplican globalmente en la app. Los cambios se reflejan en tiempo real para todos los usuarios.
        </Text>

        {configSaved && (
          <div style={{
            backgroundColor: toastColor, color: 'white', borderRadius: 12,
            padding: '14px 20px', marginBottom: 20, fontSize: 15, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            {configSaved === 'success' ? '✅ Configuración guardada correctamente' : '❌ Error al guardar, intenta de nuevo'}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 28 }}>
          {/* Precio */}
          <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderLeft: '4px solid #6B21A8' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#6B21A8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              💰 Precio del Evento
            </div>
            <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 14 }}>
              Valor en pesos colombianos (COP), sin puntos ni comas
            </div>
            <input
              type="number"
              value={configEventPrice}
              onChange={(e) => setConfigEventPrice(e.target.value)}
              placeholder="30000"
              style={{
                width: '100%', backgroundColor: '#F5F3FF', border: '2px solid #DDD6FE',
                borderRadius: 10, padding: '12px 14px', fontSize: 18, fontWeight: 700,
                color: '#6B21A8', outline: 'none', boxSizing: 'border-box',
              }}
            />
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>
              Actualmente: <strong>$ {Number(configEventPrice || 0).toLocaleString('es-CO')} COP</strong>
            </div>
          </div>

          {/* Email */}
          <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderLeft: '4px solid #3B82F6' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              ✉️ Email de Soporte
            </div>
            <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 14 }}>
              Dirección de correo que verán los usuarios en la pestaña Perfil
            </div>
            <input
              type="email"
              value={configSupportEmail}
              onChange={(e) => setConfigSupportEmail(e.target.value)}
              placeholder="soporte@nospi.app"
              style={{
                width: '100%', backgroundColor: '#EFF6FF', border: '2px solid #BFDBFE',
                borderRadius: 10, padding: '12px 14px', fontSize: 15,
                color: '#1D4ED8', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* WhatsApp */}
          <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderLeft: '4px solid #10B981' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#065F46', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              💬 WhatsApp de Soporte
            </div>
            <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 14 }}>
              Número con código de país, sin + ni espacios. Ej: 573001234567
            </div>
            <input
              type="tel"
              value={configSupportWhatsapp}
              onChange={(e) => setConfigSupportWhatsapp(e.target.value)}
              placeholder="573001234567"
              style={{
                width: '100%', backgroundColor: '#ECFDF5', border: '2px solid #A7F3D0',
                borderRadius: 10, padding: '12px 14px', fontSize: 15,
                color: '#065F46', outline: 'none', boxSizing: 'border-box',
              }}
            />
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>
              Link generado: <strong>wa.me/{configSupportWhatsapp}</strong>
            </div>
          </div>
          {/* Toggle Pago de Prueba */}
          <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderLeft: `4px solid ${configTestPaymentEnabled ? '#F59E0B' : '#9CA3AF'}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: configTestPaymentEnabled ? '#92400E' : '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              🧪 Botón Pago de Prueba
            </div>
            <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 20 }}>
              Muestra u oculta el botón "Pago de Prueba (TEST)" en la pantalla de pago de la app
            </div>
            <div
              onClick={() => setConfigTestPaymentEnabled(!configTestPaymentEnabled)}
              style={{
                display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer',
                backgroundColor: configTestPaymentEnabled ? '#FEF3C7' : '#F3F4F6',
                borderRadius: 12, padding: '14px 18px',
                border: `2px solid ${configTestPaymentEnabled ? '#F59E0B' : '#E5E7EB'}`,
                transition: 'all 0.2s', userSelect: 'none',
              }}
            >
              {/* Toggle pill */}
              <div style={{
                width: 52, height: 28, borderRadius: 14, position: 'relative', flexShrink: 0,
                backgroundColor: configTestPaymentEnabled ? '#F59E0B' : '#D1D5DB',
                transition: 'background 0.2s',
              }}>
                <div style={{
                  position: 'absolute', top: 3, left: configTestPaymentEnabled ? 27 : 3,
                  width: 22, height: 22, borderRadius: '50%', backgroundColor: 'white',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.2s',
                }} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: configTestPaymentEnabled ? '#92400E' : '#6B7280' }}>
                  {configTestPaymentEnabled ? '✅ Activado — visible en la app' : '⛔ Desactivado — oculto en la app'}
                </div>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
                  {configTestPaymentEnabled ? 'El botón 🧪 aparece en la pantalla de pago' : 'Los usuarios no ven el botón de prueba'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={handleSaveConfig}
          disabled={savingConfig}
          style={{
            backgroundColor: savingConfig ? '#9CA3AF' : '#6B21A8',
            color: 'white', border: 'none', borderRadius: 14,
            padding: '16px 40px', fontSize: 17, fontWeight: 700,
            cursor: savingConfig ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 10,
            transition: 'background 0.2s',
          }}
        >
          {savingConfig ? '⏳ Guardando...' : '💾 Guardar Configuración'}
        </button>

        {/* ── CAMBIAR CONTRASEÑA DE ADMINISTRADOR ── */}
        <div style={{ marginTop: 40, borderTop: '2px dashed #E9D5FF', paddingTop: 32 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#6B0F3A', marginBottom: 6 }}>
            🔑 Contraseña del Administrador
          </div>
          <div style={{ fontSize: 14, color: '#9CA3AF', marginBottom: 24 }}>
            Cambia la contraseña que se usa para acceder a este panel. La nueva contraseña se guarda en app_config.
          </div>

          {adminPasswordSaved && (
            <div style={{
              backgroundColor: adminPasswordSaved === 'success' ? '#10B981' : '#EF4444',
              color: 'white', borderRadius: 12, padding: '12px 18px',
              marginBottom: 20, fontSize: 14, fontWeight: 700,
            }}>
              {adminPasswordSaved === 'success' && '✅ Contraseña actualizada correctamente'}
              {adminPasswordSaved === 'mismatch' && '❌ Las contraseñas no coinciden'}
              {adminPasswordSaved === 'error' && '❌ Error al guardar, intenta de nuevo'}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 20 }}>
            {/* Nueva contraseña */}
            <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderLeft: '4px solid #6B0F3A' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6B0F3A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Nueva contraseña
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  placeholder="Escribe la nueva contraseña"
                  style={{
                    width: '100%', backgroundColor: '#FDF2F8', border: '2px solid #FBCFE8',
                    borderRadius: 10, padding: '11px 44px 11px 14px', fontSize: 15,
                    color: '#6B0F3A', outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <button
                  onClick={() => setShowNewPassword(p => !p)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 17, color: '#9CA3AF', padding: 2, lineHeight: 1,
                  }}
                  type="button"
                >
                  {showNewPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* Confirmar contraseña */}
            <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderLeft: '4px solid #6B0F3A' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6B0F3A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Confirmar contraseña
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmAdminPassword}
                  onChange={(e) => setConfirmAdminPassword(e.target.value)}
                  placeholder="Repite la nueva contraseña"
                  style={{
                    width: '100%', backgroundColor: '#FDF2F8', border: '2px solid #FBCFE8',
                    borderRadius: 10, padding: '11px 44px 11px 14px', fontSize: 15,
                    color: '#6B0F3A', outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <button
                  onClick={() => setShowConfirmPassword(p => !p)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 17, color: '#9CA3AF', padding: 2, lineHeight: 1,
                  }}
                  type="button"
                >
                  {showConfirmPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={handleChangeAdminPassword}
            disabled={savingAdminPassword || !newAdminPassword}
            style={{
              backgroundColor: (savingAdminPassword || !newAdminPassword) ? '#9CA3AF' : '#6B0F3A',
              color: 'white', border: 'none', borderRadius: 14,
              padding: '14px 36px', fontSize: 16, fontWeight: 700,
              cursor: (savingAdminPassword || !newAdminPassword) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 10,
              transition: 'background 0.2s',
            }}
          >
            {savingAdminPassword ? '⏳ Guardando...' : '🔑 Actualizar Contraseña'}
          </button>
        </div>
      </View>
    );
  };

  const loadFunnelData = async (dateFrom: string, dateTo: string, timeFrom: string, timeTo: string, showAlert = false) => {
    setFunnelLoading(true);
    try {
      // Validar fechas solo si se especificaron parcialmente
      if (showAlert && ((dateFrom && !dateTo) || (!dateFrom && dateTo))) {
        alert('Por favor selecciona tanto fecha desde como fecha hasta.');
        setFunnelLoading(false);
        return;
      }

      // Usar onboarding_sessions para el funnel — cuenta device_ids únicos por paso
      let sessionsQuery = supabase.from('onboarding_sessions').select('device_id, last_step, utm_source, created_at');
      if (dateFrom) sessionsQuery = sessionsQuery.gte('created_at', `${dateFrom}T${timeFrom}:00-05:00`);
      if (dateTo) sessionsQuery = sessionsQuery.lte('created_at', `${dateTo}T${timeTo}:00-05:00`);
      if (funnelUtmSource) sessionsQuery = sessionsQuery.eq('utm_source', funnelUtmSource);
      const { data: allSessions } = await sessionsQuery;

      if (allSessions && allSessions.length > 0) {
        const stepOrder = [
          { key: 'landing_click', label: '0. Clic en landing (nospi.co)' },
          { key: 'start',         label: '1. Presionaron Empezar en la app' },
          { key: 'interests',     label: '2. Intereses' },
          { key: 'name',          label: '3. Nombre' },
          { key: 'birthdate',     label: '4. Fecha de nacimiento' },
          { key: 'gender',        label: '5. Género' },
          { key: 'interested_in', label: '6. A quién quieren conocer' },
          { key: 'age_range',     label: '7. Rango de edad' },
          { key: 'location',      label: '8. Ubicación' },
          { key: 'compatibility', label: '9. Compatibilidad' },
          { key: 'phone',         label: '10. Teléfono' },
          { key: 'photo',         label: '11. Foto de perfil' },
          { key: 'photo_skipped', label: '11. Saltaron la foto' },
          { key: 'completed',     label: '12. Completaron registro ✅' },
        ];
        // Deduplicar por device_id — contar dispositivos únicos por paso
        const uniqueByStep: Record<string, Set<string>> = {};
        allSessions.forEach((s: any) => {
          if (!uniqueByStep[s.last_step]) uniqueByStep[s.last_step] = new Set();
          uniqueByStep[s.last_step].add(s.device_id);
        });
        const total = Object.values(uniqueByStep).reduce((acc: number, set: Set<string>) => Math.max(acc, set.size), 0);
        const counts: Record<string, number> = {};
        Object.entries(uniqueByStep).forEach(([step, set]) => { counts[step] = (set as Set<string>).size; });
        const steps = stepOrder
          .filter(s => counts[s.key])
          .map(s => ({ step: s.label, count: counts[s.key], pct: Math.round((counts[s.key] / total) * 100) }));
        setFunnelData(steps);
      } else {
        setFunnelData([]);
      }
    } catch (e) { console.warn('Funnel error', e); }
    // Cargar sesiones de onboarding
    try {
      let query = supabase.from('onboarding_sessions').select('last_step, created_at');
      if (dateFrom) query = query.gte('created_at', `${dateFrom}T${timeFrom}:00-05:00`);
      if (dateTo) query = query.lte('created_at', `${dateTo}T${timeTo}:00-05:00`);
      const { data: sessions } = await query;
      if (sessions) {
        const stepOrder = ['landing_click','start','interests','name','birthdate','gender','interested_in','age_range','location','compatibility','phone','photo','photo_skipped','completed'];
        const counts: Record<string, number> = {};
        sessions.forEach((s: any) => { counts[s.last_step] = (counts[s.last_step] || 0) + 1; });
        setSessionData(stepOrder.filter(s => counts[s]).map(s => ({ step: s, count: counts[s] })));
      }
    } catch(e) { console.warn('Sessions error', e); }

    setFunnelLoading(false);
  };

  const renderFunnel = () => (
    <View style={{ marginTop: 24, backgroundColor: '#1a0010', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#880E4F' }}>
      <Text style={{ color: '#F06292', fontSize: 18, fontWeight: '700', marginBottom: 4 }}>🔍 Funnel de Registro</Text>
      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 16 }}>Filtra por rango de fecha y hora (hora Colombia)</Text>

      {/* Filtros con date/time pickers nativos */}
      <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <style>{`
          .funnel-picker {
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(240,98,146,0.3);
            border-radius: 8px;
            padding: 10px 12px;
            color: #fff;
            font-size: 14px;
            width: 100%;
            cursor: pointer;
            outline: none;
            font-family: inherit;
          }
          .funnel-picker::-webkit-calendar-picker-indicator {
            filter: invert(1) brightness(0.7);
            cursor: pointer;
          }
          .funnel-picker:focus { border-color: #F06292; }
          .funnel-label { color: rgba(255,255,255,0.6); font-size: 12px; margin-bottom: 4px; display: block; }
          .funnel-row { display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
          .funnel-col { flex: 1; min-width: 140px; }
          .funnel-btn-row { display: flex; gap: 10px; margin-top: 4px; }
          .funnel-btn-primary { flex: 1; background: #880E4F; border: none; border-radius: 8px; padding: 12px; color: #fff; font-weight: 700; font-size: 14px; cursor: pointer; }
          .funnel-btn-primary:hover { background: #a01060; }
          .funnel-btn-secondary { flex: 1; background: rgba(255,255,255,0.08); border: 1px solid rgba(240,98,146,0.3); border-radius: 8px; padding: 12px; color: rgba(255,255,255,0.7); font-weight: 700; font-size: 14px; cursor: pointer; }
          .funnel-btn-secondary:hover { background: rgba(255,255,255,0.12); }
        `}</style>
        <div className="funnel-row">
          <div className="funnel-col">
            <span className="funnel-label">📅 Fecha desde</span>
            <input
              type="date"
              className="funnel-picker"
              value={funnelDateFrom}
              onChange={(e: any) => { setFunnelDateFrom(e.target.value); setFunnelTimeFrom('00:00'); }}
            />
          </div>
          <div className="funnel-col">
            <span className="funnel-label">📅 Fecha hasta</span>
            <input
              type="date"
              className="funnel-picker"
              value={funnelDateTo}
              onChange={(e: any) => { setFunnelDateTo(e.target.value); setFunnelTimeTo('23:59'); }}
            />
          </div>
        </div>
        <div className="funnel-row">
          <div className="funnel-col">
            <span className="funnel-label">🕐 Hora desde</span>
            <input
              type="time"
              className="funnel-picker"
              value={funnelTimeFrom}
              onChange={(e: any) => setFunnelTimeFrom(e.target.value)}
            />
          </div>
          <div className="funnel-col">
            <span className="funnel-label">🕐 Hora hasta</span>
            <input
              type="time"
              className="funnel-picker"
              value={funnelTimeTo}
              onChange={(e: any) => setFunnelTimeTo(e.target.value)}
            />
          </div>
        </div>
        <div className="funnel-row">
          <div className="funnel-col">
            <span className="funnel-label">🔗 Landing (utm_source)</span>
            <select
              className="funnel-picker"
              value={funnelUtmSource}
              onChange={(e: any) => setFunnelUtmSource(e.target.value)}
              style={{ background: '#1a0010', color: 'white', border: '1px solid rgba(240,98,146,0.3)', borderRadius: 8, padding: '10px 12px', fontSize: 14 }}
            >
              <option value="">Todas las landings</option>
              <option value="lp1">LP1 — Landing actual (nospi.co)</option>
              <option value="lp2">LP2 — Corta y directa</option>
              <option value="lp3">LP3 — Evento específico</option>
              <option value="lp4">LP4 — Recién llegadas</option>
            </select>
          </div>
        </div>
        <div className="funnel-btn-row">
          <button
            className="funnel-btn-primary"
            onClick={() => loadFunnelData(funnelDateFrom, funnelDateTo, funnelTimeFrom, funnelTimeTo, true)}
          >
            {funnelLoading ? 'Cargando...' : '🔍 Filtrar'}
          </button>
          <button
            className="funnel-btn-secondary"
            onClick={() => { setFunnelDateFrom(''); setFunnelDateTo(''); setFunnelTimeFrom('00:00'); setFunnelTimeTo('23:59'); setFunnelUtmSource(''); loadFunnelData('', '', '00:00', '23:59'); }}
          >
            ↺ Ver todo
          </button>
        </div>
      </View>

      {/* Resultados */}
      {funnelLoading ? (
        <Text style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 20 }}>Cargando...</Text>
      ) : (
        <>
          {funnelData.map((item, i) => (
            <View key={i} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, flex: 1 }}>{item.step}</Text>
                <Text style={{ color: '#F06292', fontSize: 13, fontWeight: '700', marginLeft: 8 }}>{item.count} ({item.pct}%)</Text>
              </View>
              <View style={{ height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
                <View style={{ height: 8, width: `${item.pct}%` as any, backgroundColor: item.pct > 60 ? '#10B981' : item.pct > 30 ? '#F59E0B' : '#EF4444', borderRadius: 4 }} />
              </View>
            </View>
          ))}
              {funnelData.length === 0 && <Text style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>Sin datos para el rango seleccionado</Text>}

          {/* Sesiones anónimas */}
          {sessionData.length > 0 && (
            <View style={{ marginTop: 24, borderTopWidth: 1, borderTopColor: 'rgba(240,98,146,0.2)', paddingTop: 16 }}>
              <Text style={{ color: '#F06292', fontSize: 15, fontWeight: '700', marginBottom: 12 }}>📱 Sesiones iniciadas (dispositivos)</Text>
              {sessionData.map((s, i) => {
                const stepNames: Record<string, string> = {
                  'landing_click': 'Clic en landing (nospi.co)',
                  'start': 'Presionaron Empezar en la app',
                  'interests': 'Intereses',
                  'name': 'Nombre',
                  'birthdate': 'Fecha de nacimiento',
                  'gender': 'Género',
                  'interested_in': 'A quién quiere conocer',
                  'age_range': 'Rango de edad',
                  'location': 'Ubicación',
                  'compatibility': 'Compatibilidad',
                  'phone': 'Teléfono',
                  'photo': 'Foto de perfil',
                  'photo_skipped': 'Saltó la foto',
                  'completed': 'Completaron registro',
                };
                const label = stepNames[s.step] || s.step;
                return (
                  <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>{s.step === 'completed' ? `✅ ${label}` : `⏸ Se quedaron en: ${label}`}</Text>
                    <Text style={{ color: s.step === 'completed' ? '#10B981' : '#F59E0B', fontWeight: '700', fontSize: 13 }}>{s.count}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
    </View>
  );

  const renderDashboard = () => {
    const statsData = [
      { label: 'Total Eventos', value: totalEvents, color: nospiColors.purpleDark },
      { label: 'Eventos Publicados', value: activeEvents, color: nospiColors.purpleMid },
      { label: 'Total Usuarios', value: totalUsers, color: nospiColors.purpleLight },
      { label: 'Total Citas', value: totalAppointments, color: '#8B5CF6' },
    ];

    return (
      <View style={styles.dashboardContainer}>
        <Text style={styles.sectionTitle}>Panel de Control</Text>
        <View style={styles.statsGrid}>
          {statsData.map((stat, index) => (
            <View key={index} style={[styles.statCard, { borderLeftColor: stat.color }]}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {renderFunnel()}
        <View style={styles.quickActions}>
          <Text style={styles.quickActionsTitle}>Acciones Rápidas</Text>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={openCreateEventModal}
          >
            <Text style={styles.actionButtonText}>+ Crear Nuevo Evento</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonSecondary]}
            onPress={() => setCurrentView('events')}
          >
            <Text style={styles.actionButtonTextSecondary}>Ver Todos los Eventos</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonSecondary]}
            onPress={() => setCurrentView('realtime')}
          >
            <Text style={styles.actionButtonTextSecondary}>Monitoreo en Tiempo Real</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#059669' }]}
            onPress={exportAllParticipantsToExcel}
            disabled={exportingAll}
          >
            <Text style={styles.actionButtonText}>
              {exportingAll ? '⏳ Generando Excel...' : '📥 Descargar todos los participantes (Excel)'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderEvents = () => {
    return (
      <View style={styles.listContainer}>
        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>Gestión de Eventos</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              style={[styles.createButton, { backgroundColor: '#25D366' }]}
              onPress={() => {
                const pending = appointments.filter(
                  a => a.status === 'confirmada' && a.users?.phone && !a.purchase_whatsapp_sent_at
                );
                if (pending.length === 0) {
                  window.alert('No hay nadie pendiente por recibir el WhatsApp de confirmación — ya se le mandó a todos.');
                  return;
                }
                if (!window.confirm(`Se van a abrir ${pending.length} pestañas de WhatsApp (una por persona pendiente, de todos los eventos). Tendrás que darle "Enviar" en cada una. ¿Continuar?`)) return;
setBulkWhatsAppPending(pending);
              }}
            >
              <Text style={styles.createButtonText}>💬 Enviar Confirmación a Todos (pendientes)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.createButton}
              onPress={openCreateEventModal}
            >
              <Text style={styles.createButtonText}>+ Crear Evento</Text>
            </TouchableOpacity>
          </View>
        </View>

        {events.map((event) => {
          const eventTypeText = event.type === 'bar' ? 'Bar' : 'Restaurante';
          const statusText = event.event_status === 'published' ? 'Publicado' : event.event_status === 'draft' ? 'Borrador' : 'Cerrado';
          const statusColor = event.event_status === 'published' ? '#10B981' : event.event_status === 'draft' ? '#F59E0B' : '#EF4444';
          const confirmationCode = event.confirmation_code || '1986';
          
          const eventAppointmentsCount = appointments.filter(a => a.event_id === event.id).length;

          return (
            <View key={event.id} style={styles.listItemCompact}>
              <View style={styles.listItemHeader}>
                <Text style={styles.listItemTitle}>{event.name || `${eventTypeText} - ${event.city}`}</Text>
                <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                  <Text style={styles.statusBadgeText}>{statusText}</Text>
                </View>
              </View>
              <View style={styles.compactInfoRow}>
                <Text style={styles.compactInfoText}>📍 {event.city}</Text>
                <Text style={styles.compactInfoText}>📅 {event.start_time ? new Date(event.start_time).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : event.date}</Text>
                <Text style={styles.compactInfoText}>🕐 {event.time}</Text>
              </View>
              <View style={styles.compactInfoRow}>
                <Text style={styles.compactInfoText}>👥 {eventAppointmentsCount} registrados</Text>
                <Text style={styles.compactInfoText}>🔑 {confirmationCode}</Text>
              </View>

              {/* Location — always visible in admin */}
              {(event.location_name || event.location_address) && (
                <View style={[styles.compactInfoRow, { backgroundColor: event.is_location_revealed ? '#ECFDF5' : '#FFF7ED', borderRadius: 8, padding: 8, marginTop: 4 }]}>
                  <Text style={[styles.compactInfoText, { color: event.is_location_revealed ? '#065F46' : '#92400E', fontWeight: '700', flex: 1 }]}>
                    📍 {event.location_name || ''}{event.location_name && event.location_address ? ' — ' : ''}{event.location_address || ''}
                    {!event.is_location_revealed ? '  🔒' : '  ✅'}
                  </Text>
                  {event.maps_link ? (
                    <Text
                      style={[styles.compactInfoText, { color: '#3B82F6', textDecorationLine: 'underline' }]}
                      onPress={() => window.open(event.maps_link, '_blank')}
                    >
                      🗺️ Ver mapa
                    </Text>
                  ) : null}
                </View>
              )}

              <TouchableOpacity
                style={styles.configButton}
                onPress={() => handleOpenConfigModal(event)}
              >
                <Text style={styles.configButtonText}>⚙️ Configurar</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    );
  };

  const [exportingAll, setExportingAll] = useState(false);

  const exportAllParticipantsToExcel = async () => {
    setExportingAll(true);
    try {
      // Traer todas las citas con info de usuario y evento
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id, user_id, event_id, status, payment_status, created_at,
          users!inner (
            id, name, email, phone, city, country,
            interested_in, gender, age, age_range_min, age_range_max
          ),
          events!inner (
            id, name, type, city, date, start_time, event_status
          )
        `)
        .order('created_at', { ascending: false });

      if (error) { window.alert('Error al cargar datos: ' + error.message); return; }
      if (!data || data.length === 0) { window.alert('No hay participantes registrados.'); return; }

      // Traer todas las calificaciones de una vez
      const { data: ratingsData } = await supabase
        .from('event_ratings')
        .select('rated_user_id, event_id, rating');

      // Construir mapa de calificaciones: key = userId_eventId
      const ratingsMap: Record<string, { sum: number; count: number }> = {};
      for (const r of (ratingsData || [])) {
        const key = `${r.rated_user_id}_${r.event_id}`;
        if (!ratingsMap[key]) ratingsMap[key] = { sum: 0, count: 0 };
        ratingsMap[key].sum += r.rating;
        ratingsMap[key].count += 1;
      }

      const statusLabel = (s: string) =>
        s === 'confirmada' ? 'Confirmada' : s === 'cancelada' ? 'Cancelada' : s === 'anterior' ? 'Anterior' : s;

      const eventStatusLabel = (s: string) =>
        s === 'published' ? 'Publicado' : s === 'closed' ? 'Cerrado' : 'Borrador';

      const rows = data.map((apt: any, i: number) => {
        const u = apt.users;
        const ev = apt.events;
        const rKey = `${apt.user_id}_${apt.event_id}`;
        const rData = ratingsMap[rKey];
        const avgRating = rData ? (rData.sum / rData.count).toFixed(1) : '';
        const ratingStr = rData ? `${avgRating}/5 (${rData.count} votos)` : 'Sin calificación';

        const eventDate = ev.start_time
          ? new Date(ev.start_time).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
          : ev.date || '';

        const eventName = ev.name || `${ev.type} - ${ev.city}`;

        return {
          '#': i + 1,
          'Evento': eventName,
          'Fecha evento': eventDate,
          'Estado evento': eventStatusLabel(ev.event_status),
          'Estado participante': statusLabel(apt.status),
          'Nombre': u.name || '',
          'Email': u.email || '',
          'Teléfono': u.phone || '',
          'Ciudad': u.city || '',
          'País': u.country || '',
          'Género': u.gender === 'hombre' ? 'Hombre' : u.gender === 'mujer' ? 'Mujer' : 'No especificado',
          'Interesado en': u.interested_in === 'hombres' ? 'Hombres' : u.interested_in === 'mujeres' ? 'Mujeres' : u.interested_in === 'ambos' ? 'Ambos' : 'No especificado',
          'Edad': u.age || '',
          'Rango edad mín': u.age_range_min || 18,
          'Rango edad máx': u.age_range_max || 99,
          'Calificación recibida': ratingStr,
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      // Ajustar anchos de columna
      ws['!cols'] = [
        { wch: 5 },  // #
        { wch: 28 }, // Evento
        { wch: 16 }, // Fecha evento
        { wch: 14 }, // Estado evento
        { wch: 18 }, // Estado participante
        { wch: 22 }, // Nombre
        { wch: 28 }, // Email
        { wch: 14 }, // Teléfono
        { wch: 14 }, // Ciudad
        { wch: 12 }, // País
        { wch: 12 }, // Género
        { wch: 14 }, // Interesado en
        { wch: 8  }, // Edad
        { wch: 14 }, // Rango mín
        { wch: 14 }, // Rango máx
        { wch: 22 }, // Calificación
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Todos los participantes');
      XLSX.writeFile(wb, `todos_participantes_nospi_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err: any) {
      console.error('exportAllParticipants error:', err);
      window.alert('Error al exportar: ' + err.message);
    } finally {
      setExportingAll(false);
    }
  };

  const exportUsersToExcel = () => {
    if (users.length === 0) { window.alert('No hay usuarios para exportar'); return; }
    const data = users.map((u, i) => ({
      '#': i + 1,
      'Nombre': u.name || '',
      'Fecha registro': (u as any).created_at ? new Date((u as any).created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '',
      'Email': u.email || '',
      'Teléfono': u.phone || '',
      'Ciudad': u.city || '',
      'País': u.country || '',
      'Género': u.gender === 'hombre' ? 'Hombre' : u.gender === 'mujer' ? 'Mujer' : 'No especificado',
      'Interesado en': u.interested_in === 'hombres' ? 'Hombres' : u.interested_in === 'mujeres' ? 'Mujeres' : u.interested_in === 'ambos' ? 'Ambos' : 'No especificado',
      'Edad': u.age || '',
      'Rango edad mín': u.age_range_min || 18,
      'Rango edad máx': u.age_range_max || 99,
      'Calificación promedio': userRatingAverages[u.id] ? `${userRatingAverages[u.id].avg.toFixed(1)}/5 (${userRatingAverages[u.id].count} votos)` : 'Sin votos',
      'Plataforma': u.registered_from === 'ios' ? 'iOS' : u.registered_from === 'android' ? 'Android' : u.registered_from === 'web' ? 'Web' : 'Desconocido',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Usuarios');
    XLSX.writeFile(wb, `usuarios_nospi_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportParticipantsToExcel = (eventName: string) => {
    if (participantAttendees.length === 0) { window.alert('No hay participantes para exportar'); return; }
    const filtered = participantAttendees.filter(a => a.status === participantTab);
    const data = filtered.map((a, i) => {
      const u = a.users as any;
      const statusLabel = a.status === 'confirmada' ? 'Confirmada' : a.status === 'cancelada' ? 'Cancelada' : 'Anterior';
      return {
        '#': i + 1,
        'Nombre': u.name || '',
        'Email': u.email || '',
        'Teléfono': u.phone || '',
        'Ciudad': u.city || '',
        'País': u.country || '',
        'Género': u.gender === 'hombre' ? 'Hombre' : u.gender === 'mujer' ? 'Mujer' : 'No especificado',
        'Interesado en': u.interested_in === 'hombres' ? 'Hombres' : u.interested_in === 'mujeres' ? 'Mujeres' : u.interested_in === 'ambos' ? 'Ambos' : 'No especificado',
        'Edad': u.age || '',
        'Rango edad mín': u.age_range_min || 18,
        'Rango edad máx': u.age_range_max || 99,
        'Estado': statusLabel,
        'Calificación': (a as any).avgRating != null ? `${((a as any).avgRating).toFixed(1)}/5 (${(a as any).ratingCount} votos)` : 'Sin calificación',
      };
    });
    if (data.length === 0) { window.alert('No hay participantes en esta pestaña para exportar'); return; }
    const safeName = eventName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Participantes');
    XLSX.writeFile(wb, `participantes_${safeName}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const loadDeclinedPayments = async () => {
    setLoadingDeclinedPayments(true);
    try {
      const { data, error } = await supabase.rpc('get_declined_payments_global');
      if (error) {
        console.error('Error cargando pagos declinados:', error);
        setDeclinedPayments([]);
        return;
      }
      setDeclinedPayments(data || []);
    } catch (e) {
      console.error('Error cargando pagos declinados:', e);
      setDeclinedPayments([]);
    } finally {
      setLoadingDeclinedPayments(false);
    }
  };

  const markDeclinedWhatsAppSent = async (userId: string, eventId: string) => {
    const sentAt = new Date().toISOString();
    setDeclinedPayments(prev => prev.map(p =>
      p.user_id === userId && p.event_id === eventId ? { ...p, declined_whatsapp_sent_at: sentAt } : p
    ));
    try {
      const { data: latest } = await supabase
        .from('payment_attempts')
        .select('id')
        .eq('user_id', userId)
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest?.id) {
        await supabase.from('payment_attempts').update({ declined_whatsapp_sent_at: sentAt }).eq('id', latest.id);
      }
    } catch (e) { console.error('Error marcando WhatsApp declinado enviado:', e); }
  };

  const loadParticipantAttendees = async (eventId: string) => {
    setLoadingParticipantAttendees(true);
    try {
      // Traer TODOS los estados (confirmada, cancelada, anterior)
      const [aptsResult, ratingsResult] = await Promise.all([
        supabase
          .from('appointments')
          .select(`
            id, user_id, event_id, status, payment_status, created_at, purchase_whatsapp_sent_at,
            users!inner (
              id, name, email, phone, city, country,
              interested_in, gender, age, age_range_min, age_range_max
            )
          `)
          .eq('event_id', eventId)
          .order('created_at', { ascending: false }),
        supabase
          .from('event_ratings')
          .select('rated_user_id, rating')
          .eq('event_id', eventId),
      ]);

      if (aptsResult.error) { window.alert('Error al cargar participantes: ' + aptsResult.error.message); return; }

      // Calcular promedio de calificaciones por usuario
      const ratingsMap: Record<string, { sum: number; count: number }> = {};
      for (const r of (ratingsResult.data || [])) {
        if (!ratingsMap[r.rated_user_id]) ratingsMap[r.rated_user_id] = { sum: 0, count: 0 };
        ratingsMap[r.rated_user_id].sum += r.rating;
        ratingsMap[r.rated_user_id].count += 1;
      }

      const transformed = (aptsResult.data || []).map((att: any) => {
        const rData = ratingsMap[att.user_id];
        const avgRating = rData ? (rData.sum / rData.count) : null;
        return {
          id: att.id, user_id: att.user_id, event_id: att.event_id,
          status: att.status, payment_status: att.payment_status, created_at: att.created_at,
          purchase_whatsapp_sent_at: att.purchase_whatsapp_sent_at,
          avgRating,
          ratingCount: rData?.count || 0,
          users: {
            id: att.users.id, name: att.users.name, email: att.users.email,
            phone: att.users.phone, city: att.users.city, country: att.users.country,
            interested_in: att.users.interested_in, gender: att.users.gender,
            age: att.users.age, age_range_min: att.users.age_range_min, age_range_max: att.users.age_range_max,
          },
        };
      });
      setParticipantAttendees(transformed);
    } catch (err: any) {
      console.error('loadParticipantAttendees error:', err);
      window.alert('Error inesperado al cargar participantes');
    } finally {
      setLoadingParticipantAttendees(false);
    }
  };

  const TABLE_HEADERS_USERS = ['#', 'Nombre', 'Registro', 'Email', 'Teléfono', 'Ciudad', 'País', 'Género', 'Interesado en', 'Edad', 'Rango edad', 'Calificación promedio', 'Plataforma'];
  const TABLE_HEADERS_PARTICIPANTS = ['#', 'Nombre', 'Email', 'Teléfono', 'Ciudad', 'País', 'Género', 'Interesado en', 'Edad', 'Rango edad', 'Estado', 'Calificación'];

  // Sort helper
  const makeSort = (
    setSortCol: (c: string) => void,
    setSortAsc: (a: boolean) => void,
    currentCol: string,
    currentAsc: boolean
  ) => (col: string) => {
    if (col === currentCol) setSortAsc(!currentAsc);
    else { setSortCol(col); setSortAsc(true); }
  };

  const applySort = (arr: any[], col: string, asc: boolean) => {
    if (!col) return arr;
    return [...arr].sort((a, b) => {
      const va = (a[col] ?? '').toString().toLowerCase();
      const vb = (b[col] ?? '').toString().toLowerCase();
      const n = va.localeCompare(vb, undefined, { numeric: true });
      return asc ? n : -n;
    });
  };

  // Per-column filter (uses Set<string> — empty Set means no filter)
  const applyColFilters = (arr: any[], filters: Record<string, Set<string>>) => {
    return arr.filter(item =>
      Object.entries(filters).every(([col, selected]) => {
        if (!selected || selected.size === 0) return true;
        let v = item[col] ?? '';
        if (v === '' || v === null || v === undefined) {
          return selected.has('(Vacío)');
        }
        const str = String(v);
        // Normalize timestamps to date-only for comparison
        const display = str.includes('T') && str.includes(':')
          ? new Date(str).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
          : str;
        return selected.has(display);
      })
    );
  };



  const cellStyle: any = {
    padding: '10px 14px', fontSize: 13, color: '#374151', borderBottom: '1px solid #F3F4F6',
    whiteSpace: 'nowrap', verticalAlign: 'middle',
  };
  const headerCellStyle: any = {
    padding: '12px 14px', fontSize: 12, fontWeight: 700, color: '#6B21A8',
    backgroundColor: '#F5F3FF', textTransform: 'uppercase', letterSpacing: '0.05em',
    whiteSpace: 'nowrap', borderBottom: '2px solid #DDD6FE', position: 'sticky', top: 0,
  };
  const rowEvenStyle: any = { backgroundColor: '#FAFAFA' };
  const rowOddStyle: any = { backgroundColor: '#FFFFFF' };

  const editInputStyle: any = {
    width: '100%', border: '1.5px solid #E5E7EB', borderRadius: 10,
    padding: '10px 12px', fontSize: 14, backgroundColor: '#FAFAFA', color: '#111',
    marginBottom: 4, boxSizing: 'border-box',
  };

  const renderUsers = () => {
    const onSortUsers = makeSort(setUserSortCol, setUserSortAsc, userSortCol, userSortAsc);
    const sortedUsers = applySort(applyColFilters(users, userColFilters), userSortCol, userSortAsc);
    const activeFilters = Object.values(userColFilters).filter((v: any) => v && v.size > 0).length;
    const cols: { label: string; key: string; w?: number }[] = [
      { label: 'Nombre', key: 'name', w: 130 }, { label: 'Registro', key: 'created_at', w: 150 },
      { label: 'Email', key: 'email', w: 170 },
      { label: 'Teléfono', key: 'phone', w: 130 }, { label: 'Ciudad', key: 'city', w: 100 },
      { label: 'País', key: 'country', w: 90 }, { label: 'Género', key: 'gender', w: 80 },
      { label: 'Interesado en', key: 'interested_in', w: 110 }, { label: 'Edad', key: 'age', w: 65 },
      { label: 'Rango edad', key: 'age_range_min', w: 100 }, { label: 'Calificación', key: '_rating', w: 110 },
      { label: 'Plataforma', key: 'registered_from', w: 100 },
      { label: 'Editar', key: '_edit', w: 90 },
      { label: 'WhatsApp', key: '_whatsapp', w: 100 },
      { label: 'Declinados', key: '_declinado', w: 110 },
    ];
    return (
      <View style={styles.listContainer}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Text style={styles.sectionTitle}>Usuarios Registrados ({sortedUsers.length}{activeFilters > 0 ? ` de ${users.length}` : ''})</Text>
            {activeFilters > 0 && (
              <button onClick={() => setUserColFilters({})} style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                ✕ Limpiar filtros ({activeFilters})
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {declinedPayments.filter((p: any) => p.user_phone && !p.declined_whatsapp_sent_at).length > 0 && (
              <button
                onClick={() => {
                  const pending = declinedPayments.filter((p: any) => p.user_phone && !p.declined_whatsapp_sent_at);
                  setBulkDeclinedPending(pending);
                }}
                style={{ backgroundColor: '#25D366', color: 'white', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
              >
                💬 Enviar a Declinados ({declinedPayments.filter((p: any) => p.user_phone && !p.declined_whatsapp_sent_at).length})
              </button>
            )}
            <button onClick={exportUsersToExcel} style={{ backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              📥 Descargar Excel
            </button>
          </div>
        </div>

        <HorizontalScrollSync minWidth={1100}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
            <thead>
              <tr>
                <th style={{ ...headerCellStyle, width: 40 }}>#</th>
                  {cols.map(c => <ExcelFilterTh key={c.key} colKey={c.key} label={c.label} sortCol={userSortCol} sortAsc={userSortAsc} onSort={onSortUsers} filters={userColFilters} setFilters={setUserColFilters} allRows={users} width={c.w} />)}
              </tr>
            </thead>
            <tbody>
              {sortedUsers.length === 0 ? (
                <tr><td colSpan={16} style={{ ...cellStyle, textAlign: 'center', color: '#9CA3AF', padding: 40 }}>{activeFilters > 0 ? 'Sin resultados para los filtros aplicados' : 'No hay usuarios registrados'}</td></tr>
              ) : sortedUsers.map((user: any, i: number) => {
                const gender = user.gender === 'hombre' ? 'Hombre' : user.gender === 'mujer' ? 'Mujer' : '—';
                const interest = user.interested_in === 'hombres' ? 'Hombres' : user.interested_in === 'mujeres' ? 'Mujeres' : user.interested_in === 'ambos' ? 'Ambos' : '—';
                const ageRange = `${user.age_range_min || 18} – ${user.age_range_max || 99}`;
                const uRating = userRatingAverages[user.id];
                const createdAt = user.created_at
                  ? new Date(user.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : (() => {
                      // Fallback: earliest appointment date for this user
                      const userApts = appointments.filter(a => a.user_id === user.id);
                      if (userApts.length === 0) return '—';
                      const earliest = userApts.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];
                      return new Date(earliest.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' *';
                    })();
                const row = i % 2 === 0 ? rowEvenStyle : rowOddStyle;
                return (
                  <tr key={user.id} style={row}>
                    <td style={{ ...cellStyle, color: '#9CA3AF', textAlign: 'center', width: 40 }}>{i + 1}</td>
                    <td style={{ ...cellStyle, fontWeight: 600, color: '#6B21A8' }}>{user.name}</td>
                    <td style={{ ...cellStyle, textAlign: 'center', color: '#6B7280', whiteSpace: 'nowrap' }}>{createdAt}</td>
                    <td style={cellStyle}>{user.email}</td>
                    <td style={cellStyle}>{user.phone}</td>
                    <td style={cellStyle}>{user.city}</td>
                    <td style={cellStyle}>{user.country}</td>
                    <td style={{ ...cellStyle, textAlign: 'center' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, backgroundColor: user.gender === 'hombre' ? '#DBEAFE' : '#FCE7F3', color: user.gender === 'hombre' ? '#1D4ED8' : '#BE185D' }}>{gender}</span>
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'center' }}>{interest}</td>
                    <td style={{ ...cellStyle, textAlign: 'center' }}>{user.age || '—'}</td>
                    <td style={{ ...cellStyle, textAlign: 'center', color: '#6B7280' }}>{ageRange}</td>
                    <td style={{ ...cellStyle, textAlign: 'center' }}>
                      {uRating ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <span style={{ fontSize: 14 }}>{'⭐'.repeat(Math.round(uRating.avg))}{'☆'.repeat(5 - Math.round(uRating.avg))}</span>
                          <span style={{ fontSize: 11, color: '#6B7280' }}>{uRating.avg.toFixed(1)}/5 · {uRating.count}v</span>
                        </div>
                      ) : <span style={{ fontSize: 12, color: '#D1D5DB' }}>Sin votos</span>}
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'center' }}>
                      {user.registered_from === 'ios' ? (
                        <span title="iOS" style={{ fontSize: 18 }}>🍎</span>
                      ) : user.registered_from === 'android' ? (
                        <span title="Android" style={{ fontSize: 18 }}>🤖</span>
                      ) : user.registered_from === 'web' ? (
                        <span title="Web" style={{ fontSize: 18 }}>🌐</span>
                      ) : (
                        <span style={{ fontSize: 12, color: '#D1D5DB' }}>—</span>
                      )}
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'center' }}>
                      <button
                        onClick={() => handleOpenEditUser(user)}
                        style={{
                          backgroundColor: '#EDE9FE', color: '#6B21A8', border: 'none',
                          borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        ✏️ Editar
                      </button>
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'center' }}>
                      {user.phone && (() => {
                        const nextAppt = getNextConfirmedAppointmentForUser(user.id);
                        const alreadySent = !!nextAppt?.purchase_whatsapp_sent_at;
                        return (
                          <a
                            href={buildWhatsAppLink(user.phone, user.name, nextAppt?.events?.name, nextAppt?.events?.date, nextAppt?.events?.time)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => { if (nextAppt) markPurchaseWhatsAppSent(nextAppt.id); }}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              backgroundColor: alreadySent ? '#9CA3AF' : '#25D366', color: 'white', textDecoration: 'none',
                              padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                            }}
                          >
                            {alreadySent ? '✅ Enviado' : '💬 Enviar'}
                          </a>
                        );
                      })()}
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'center' }}>
                      {(() => {
                        const declined = declinedPayments.find((p: any) => p.user_id === user.id);
                        if (!declined || !declined.user_phone) return <span style={{ fontSize: 12, color: '#D1D5DB' }}>—</span>;
                        const alreadySent = !!declined.declined_whatsapp_sent_at;
                        return (
                          <a
                            href={buildDeclinedPaymentWhatsAppLink(declined.user_phone, declined.user_name, declined.event_name, declined.event_date)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => markDeclinedWhatsAppSent(declined.user_id, declined.event_id)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              backgroundColor: alreadySent ? '#9CA3AF' : '#DC2626', color: 'white', textDecoration: 'none',
                              padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                            }}
                          >
                            {alreadySent ? '✅ Enviado' : '💬 Enviar'}
                          </a>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </HorizontalScrollSync>
      </View>
    );
  };

  const renderParticipants = () => {
    const selectedEvent = events.find(e => e.id === selectedParticipantEventId);
    const filtered = participantAttendees.filter(a => a.status === participantTab);

    const tabConfig: { key: 'confirmada' | 'cancelada' | 'anterior'; label: string; emoji: string; color: string; bg: string }[] = [
      { key: 'confirmada', label: 'Confirmadas', emoji: '✅', color: '#065F46', bg: '#D1FAE5' },
      { key: 'cancelada',  label: 'Canceladas',  emoji: '❌', color: '#92400E', bg: '#FEF3C7' },
      { key: 'anterior',   label: 'Anteriores',  emoji: '🕐', color: '#1D4ED8', bg: '#DBEAFE' },
    ];

    const statusBadge = (status: string) => {
      const cfg = tabConfig.find(t => t.key === status);
      if (!cfg) return null;
      return (
        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, backgroundColor: cfg.bg, color: cfg.color }}>
          {cfg.emoji} {cfg.label.slice(0, -2)}
        </span>
      );
    };

    return (
      <View style={styles.listContainer}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <Text style={styles.sectionTitle}>Participantes por Evento</Text>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {filtered.length > 0 && selectedEvent && (
              <button
                onClick={() => {
                  const withPhone = filtered.filter((a: any) => a.users?.phone);
                  if (withPhone.length === 0) { window.alert('Nadie en esta lista tiene teléfono registrado'); return; }
                  if (!window.confirm(`Se van a abrir ${withPhone.length} pestañas de WhatsApp (una por persona). Tendrás que darle "Enviar" en cada una. ¿Continuar?`)) return;
                  withPhone.forEach((a: any) => {
                    window.open(
                      buildWhatsAppLink(a.users.phone, a.users.name, selectedEvent.name, selectedEvent.date, selectedEvent.time),
                      '_blank'
                    );
                  });
                }}
                style={{ backgroundColor: '#25D366', color: 'white', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                💬 Enviar WhatsApp a todos ({filtered.filter((a: any) => a.users?.phone).length})
              </button>
            )}
            {filtered.length > 0 && selectedEvent && (
              <button
                onClick={() => exportParticipantsToExcel(selectedEvent.name || `${selectedEvent.type}_${selectedEvent.city}`)}
                style={{ backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                📥 Este evento ({participantTab})
              </button>
            )}
            <button
              onClick={exportAllParticipantsToExcel}
              disabled={exportingAll}
              style={{ backgroundColor: '#6B21A8', color: 'white', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: exportingAll ? 0.7 : 1 }}
            >
              {exportingAll ? '⏳ Generando...' : '📥 Todos los eventos'}
            </button>
          </div>
        </div>

        {/* Selector de evento */}
        <div style={{ marginBottom: 16 }}>
          <select
            style={{ backgroundColor: '#F5F3FF', border: '2px solid #DDD6FE', borderRadius: 10, padding: '10px 16px', fontSize: 15, width: '100%', color: '#374151', outline: 'none' }}
            value={selectedParticipantEventId}
            onChange={(e) => {
              const id = e.target.value;
              setSelectedParticipantEventId(id);
              setParticipantAttendees([]);
              setParticipantTab('confirmada');
              if (id) loadParticipantAttendees(id);
            }}
          >
            <option value="">— Selecciona un evento —</option>
            {events.map(ev => (
              <option key={ev.id} value={ev.id}>
                {ev.name || `${ev.type} - ${ev.city}`} · {ev.start_time ? new Date(ev.start_time).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : ev.date} · {ev.event_status === 'published' ? '✅ Publicado' : ev.event_status === 'closed' ? '🔒 Cerrado' : '📝 Borrador'}
              </option>
            ))}
          </select>
        </div>

        {!selectedParticipantEventId ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9CA3AF', fontSize: 16 }}>
            Selecciona un evento para ver sus participantes
          </div>
        ) : loadingParticipantAttendees ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={nospiColors.purpleDark} />
            <Text style={styles.loadingText}>Cargando participantes...</Text>
          </View>
        ) : (
          <>
            {/* Info del evento */}
            {selectedEvent && (
              <div style={{ backgroundColor: '#F5F3FF', borderRadius: 10, padding: '12px 18px', marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 14, color: '#6B21A8', fontWeight: 700 }}>{selectedEvent.name || `${selectedEvent.type} - ${selectedEvent.city}`}</span>
                <span style={{ fontSize: 14, color: '#6B7280' }}>📅 {selectedEvent.start_time ? new Date(selectedEvent.start_time).toLocaleDateString('es-CO', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : selectedEvent.date}</span>
                <span style={{ fontSize: 14, color: '#6B7280' }}>👥 {participantAttendees.length} total</span>
              </div>
            )}

            {/* Clear filters */}
            {Object.values(partColFilters).some((v: any) => v && v.size > 0) && (
              <div style={{ marginBottom: 8 }}>
                <button onClick={() => setPartColFilters({})} style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  ✕ Limpiar filtros ({Object.values(partColFilters).filter(v => v && v.size > 0).length})
                </button>
              </div>
            )}
            {/* Sub-pestañas */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '2px solid #EDE9FE', paddingBottom: 0 }}>
              {tabConfig.map(({ key, label, emoji }) => {
                const count = participantAttendees.filter(a => a.status === key).length;
                const active = participantTab === key;
                return (
                  <button
                    key={key}
                    onClick={() => setParticipantTab(key)}
                    style={{
                      padding: '10px 20px', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700,
                      borderRadius: '8px 8px 0 0', transition: 'all 0.15s',
                      backgroundColor: active ? '#6B21A8' : 'transparent',
                      color: active ? 'white' : '#6B7280',
                      borderBottom: active ? '2px solid #6B21A8' : '2px solid transparent',
                      marginBottom: -2,
                    }}
                  >
                    {emoji} {label} <span style={{ fontSize: 12, opacity: 0.85, marginLeft: 4, backgroundColor: active ? 'rgba(255,255,255,0.2)' : '#EDE9FE', color: active ? 'white' : '#6B21A8', borderRadius: 20, padding: '1px 8px' }}>{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Tabla */}
            {(() => {
              const partCols: { label: string; key: string; w?: number }[] = [
                { label: 'Nombre', key: 'name', w: 130 }, { label: 'Email', key: 'email', w: 160 },
                { label: 'Teléfono', key: 'phone', w: 120 }, { label: 'Ciudad', key: 'city', w: 90 },
                { label: 'País', key: 'country', w: 80 }, { label: 'Género', key: 'gender', w: 80 },
                { label: 'Interesado en', key: 'interested_in', w: 110 }, { label: 'Edad', key: 'age', w: 65 },
                { label: 'Rango edad', key: 'age_range_min', w: 100 }, { label: 'Estado', key: 'status', w: 100 },
                { label: 'Calificación', key: '_rating', w: 110 }, { label: 'WhatsApp', key: '_whatsapp', w: 110 },
              ];
              const onSortPart = makeSort(setPartSortCol, setPartSortAsc, partSortCol, partSortAsc);
              const activePartFilters = Object.values(partColFilters).filter((v: any) => v && v.size > 0).length;
              const allPartRows = filtered.map(att => ({ ...att, ...(att.users as any) }));
              const flatFiltered = applyColFilters(allPartRows, partColFilters);
              const sortedPart = applySort(flatFiltered, partSortCol, partSortAsc);
              return (
                <div style={{ overflowX: 'auto', borderRadius: 12, boxShadow: '0 1px 8px rgba(0,0,0,0.08)', border: '1px solid #EDE9FE' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1150 }}>
                    <thead>
                      <tr>
                        <th style={{ ...headerCellStyle, width: 40 }}>#</th>
                        {partCols.map(c => <ExcelFilterTh key={c.key} colKey={c.key} label={c.label} sortCol={partSortCol} sortAsc={partSortAsc} onSort={onSortPart} filters={partColFilters} setFilters={setPartColFilters} allRows={allPartRows} width={c.w} />)}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPart.length === 0 ? (
                        <tr><td colSpan={13} style={{ ...cellStyle, textAlign: 'center', color: '#9CA3AF', padding: 48, fontSize: 15 }}>
                          {Object.values(partColFilters).some((v: any) => v && v.size > 0) ? 'Sin resultados para los filtros aplicados' : `No hay participantes ${participantTab === 'confirmada' ? 'confirmados' : participantTab === 'cancelada' ? 'cancelados' : 'anteriores'} en este evento`}
                        </td></tr>
                      ) : sortedPart.map((att: any, i: number) => {
                        const u = att.users as any || att;
                        const gender = u.gender === 'hombre' ? 'Hombre' : u.gender === 'mujer' ? 'Mujer' : '—';
                        const interest = u.interested_in === 'hombres' ? 'Hombres' : u.interested_in === 'mujeres' ? 'Mujeres' : u.interested_in === 'ambos' ? 'Ambos' : '—';
                        const ageRange = `${u.age_range_min || 18} – ${u.age_range_max || 99}`;
                        const row = i % 2 === 0 ? rowEvenStyle : rowOddStyle;
                        return (
                          <tr key={att.id} style={row}>
                            <td style={{ ...cellStyle, color: '#9CA3AF', textAlign: 'center', width: 40 }}>{i + 1}</td>
                            <td style={{ ...cellStyle, fontWeight: 600, color: '#6B21A8' }}>{u.name}</td>
                            <td style={cellStyle}>{u.email}</td>
                            <td style={cellStyle}>{u.phone}</td>
                            <td style={cellStyle}>{u.city}</td>
                            <td style={cellStyle}>{u.country}</td>
                            <td style={{ ...cellStyle, textAlign: 'center' }}>
                              <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, backgroundColor: u.gender === 'hombre' ? '#DBEAFE' : '#FCE7F3', color: u.gender === 'hombre' ? '#1D4ED8' : '#BE185D' }}>{gender}</span>
                            </td>
                            <td style={{ ...cellStyle, textAlign: 'center' }}>{interest}</td>
                            <td style={{ ...cellStyle, textAlign: 'center' }}>{u.age || '—'}</td>
                            <td style={{ ...cellStyle, textAlign: 'center', color: '#6B7280' }}>{ageRange}</td>
                            <td style={{ ...cellStyle, textAlign: 'center' }}>{statusBadge(att.status)}</td>
                            <td style={{ ...cellStyle, textAlign: 'center' }}>
                              {att.avgRating != null ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                  <span style={{ fontSize: 14 }}>{'⭐'.repeat(Math.round(att.avgRating))}{'☆'.repeat(5 - Math.round(att.avgRating))}</span>
                                  <span style={{ fontSize: 11, color: '#6B7280' }}>{att.avgRating.toFixed(1)}/5 · {att.ratingCount}v</span>
                                </div>
                              ) : <span style={{ fontSize: 12, color: '#D1D5DB' }}>Sin votos</span>}
                            </td>
                            <td style={{ ...cellStyle, textAlign: 'center' }}>
                              {u.phone && (
                                <a
                                  href={buildWhatsAppLink(u.phone, u.name, selectedEvent?.name, selectedEvent?.date, selectedEvent?.time)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={() => markPurchaseWhatsAppSent(att.id)}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    backgroundColor: att.purchase_whatsapp_sent_at ? '#9CA3AF' : '#25D366', color: 'white', textDecoration: 'none',
                                    padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                                  }}
                                >
                                  {att.purchase_whatsapp_sent_at ? '✅ Enviado' : '💬 Enviar'}
                                </a>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </>
        )}
      </View>
    );
  };

  const renderRealtime = () => {
    return (
      <View style={styles.listContainer}>
        <Text style={styles.sectionTitle}>Monitoreo en Tiempo Real</Text>
        
        <View style={styles.realtimeInfo}>
          <Text style={styles.realtimeInfoText}>
            Selecciona un evento para monitorear la asistencia en tiempo real
          </Text>
        </View>

        <View style={styles.eventSelector}>
          <Text style={styles.inputLabel}>Seleccionar Evento:</Text>
          <select
            style={{
              backgroundColor: '#F5F5F5',
              borderWidth: 1,
              borderColor: '#E0E0E0',
              borderRadius: 12,
              padding: 12,
              fontSize: 16,
              marginBottom: 16,
              width: '100%',
            }}
            value={selectedEventForMonitoring || ''}
            onChange={(e) => {
              const eventId = e.target.value;
              setSelectedEventForMonitoring(eventId);
              if (eventId) {
                loadEventParticipants(eventId);
              }
            }}
          >
            <option value="">-- Selecciona un evento --</option>
            {events.filter(e => e.event_status === 'published').map((event) => (
              <option key={event.id} value={event.id}>
                {event.name || `${event.type} - ${event.city}`} - {event.date}
              </option>
            ))}
          </select>
        </View>

        {selectedEventForMonitoring && (
          <View style={styles.participantsContainer}>
            <Text style={styles.participantsTitle}>
              Participantes Confirmados ({eventParticipants.length})
            </Text>
            {eventParticipants.map((participant, index) => {
              const checkInStatus = participant.is_presented ? '✅ Presente' : '⏳ Pendiente';
              const checkInColor = participant.is_presented ? '#10B981' : '#F59E0B';
              
              return (
                <View key={participant.id} style={styles.participantItem}>
                  <View style={styles.participantHeader}>
                    <Text style={styles.participantNumber}>#{index + 1}</Text>
                    <Text style={styles.participantName}>{participant.users?.name || 'Usuario'}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: checkInColor }]}>
                      <Text style={styles.statusBadgeText}>{checkInStatus}</Text>
                    </View>
                  </View>
                  {participant.users && (
                    <>
                      <Text style={styles.participantDetail}>📧 {participant.users.email}</Text>
                      <Text style={styles.participantDetail}>📱 {participant.users.phone}</Text>
                      <Text style={styles.participantDetail}>📍 {participant.users.city}</Text>
                      {participant.users.phone && (
                        <a
                          href={buildWhatsAppLink(
                            participant.users.phone,
                            participant.users.name,
                            events.find(e => e.id === selectedEventForMonitoring)?.name,
                            events.find(e => e.id === selectedEventForMonitoring)?.date,
                            events.find(e => e.id === selectedEventForMonitoring)?.time
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            backgroundColor: '#25D366', color: 'white', textDecoration: 'none',
                            padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700,
                            marginTop: 8,
                          }}
                        >
                          💬 Enviar WhatsApp
                        </a>
                      )}
                    </>
                  )}
                  {participant.check_in_time && (
                    <Text style={styles.participantDetail}>
                      🕐 Check-in: {new Date(participant.check_in_time).toLocaleString('es-ES')}
                    </Text>
                  )}
                  {participant.presented_at && (
                    <Text style={styles.participantDetail}>
                      ✅ Presentado: {new Date(participant.presented_at).toLocaleString('es-ES')}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  const renderMatches = () => {
    const selectedEvent = events.find(e => e.id === selectedEventForMatches);
    
    return (
      <View style={styles.listContainer}>
        <Text style={styles.sectionTitle}>Matches y Calificaciones</Text>
        
        {!selectedEventForMatches ? (
          <View style={styles.realtimeInfo}>
            <Text style={styles.realtimeInfoText}>
              Selecciona un evento desde la vista de Eventos para ver los matches y calificaciones
            </Text>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => setCurrentView('events')}
            >
              <Text style={styles.actionButtonText}>Ir a Eventos</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {selectedEvent && (
              <View style={styles.eventInfoSection}>
                <Text style={styles.eventInfoTitle}>
                  {selectedEvent.name || `${selectedEvent.type} - ${selectedEvent.city}`}
                </Text>
                <Text style={styles.eventInfoDetail}>
                  📅 {selectedEvent.date} a las {selectedEvent.time}
                </Text>
              </View>
            )}

            {loadingMatches ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={nospiColors.purpleDark} />
                <Text style={styles.loadingText}>Cargando datos...</Text>
              </View>
            ) : (
              <>
                <View style={styles.matchesSection}>
                  <Text style={styles.subsectionTitle}>💜 Matches por Nivel ({eventMatches.length})</Text>
                  {eventMatches.length === 0 ? (
                    <Text style={styles.emptyText}>No hay matches registrados para este evento</Text>
                  ) : (
                    eventMatches.map((match) => {
                      const levelEmoji = match.level === 'divertido' ? '😄' : match.level === 'sensual' ? '😘' : '🔥';
                      const levelText = match.level === 'divertido' ? 'Divertido' : match.level === 'sensual' ? 'Sensual' : 'Atrevido';
                      
                      return (
                        <View key={match.id} style={styles.matchItem}>
                          <View style={styles.matchHeader}>
                            <Text style={styles.matchLevel}>{levelEmoji} {levelText}</Text>
                            <Text style={styles.matchDate}>
                              {new Date(match.created_at).toLocaleString('es-ES')}
                            </Text>
                          </View>
                          <Text style={styles.matchUsers}>
                            👤 {match.user1?.name || 'Usuario 1'} ↔️ {match.user2?.name || 'Usuario 2'}
                          </Text>
                          <Text style={styles.matchEmails}>
                            📧 {match.user1?.email || 'N/A'} ↔️ {match.user2?.email || 'N/A'}
                          </Text>
                        </View>
                      );
                    })
                  )}
                </View>

                <View style={styles.ratingsSection}>
                  <Text style={styles.subsectionTitle}>⭐ Calificaciones ({eventRatings.length})</Text>
                  {eventRatings.length === 0 ? (
                    <Text style={styles.emptyText}>No hay calificaciones registradas para este evento</Text>
                  ) : (
                    eventRatings.map((rating) => {
                      const stars = '⭐'.repeat(rating.rating);
                      
                      return (
                        <View key={rating.id} style={styles.ratingItem}>
                          <View style={styles.ratingHeader}>
                            <Text style={styles.ratingStars}>{stars} ({rating.rating}/5)</Text>
                            <Text style={styles.ratingDate}>
                              {new Date(rating.created_at).toLocaleString('es-ES')}
                            </Text>
                          </View>
                          <Text style={styles.ratingUsers}>
                            👤 {rating.rater?.name || 'Usuario'} calificó a {rating.rated?.name || 'Usuario'}
                          </Text>
                        </View>
                      );
                    })
                  )}
                </View>
              </>
            )}
          </>
        )}
      </View>
    );
  };

  // Password modal
  if (showPasswordModal) {
    return (
      <View style={styles.fullScreenContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.passwordContainer}>
          <Text style={styles.passwordTitle}>🔐 Panel de Administración</Text>
          <Text style={styles.passwordSubtitle}>Ingresa la contraseña de administrador</Text>
          <div style={{ position: 'relative', width: '100%', maxWidth: 400 }}>
            <TextInput
              style={[styles.passwordInput, { paddingRight: 48, width: '100%' }]}
              placeholder="Contraseña"
              secureTextEntry={!showLoginPassword}
              value={adminPassword}
              onChangeText={setAdminPassword}
              autoCapitalize="none"
              onSubmitEditing={handlePasswordSubmit}
            />
            <button
              onClick={() => setShowLoginPassword(p => !p)}
              style={{
                position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 18, color: '#9CA3AF', padding: 4, lineHeight: 1,
              }}
              type="button"
            >
              {showLoginPassword ? '🙈' : '👁️'}
            </button>
          </div>
          <TouchableOpacity style={styles.passwordButton} onPress={handlePasswordSubmit}>
            <Text style={styles.passwordButtonText}>Acceder</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>← Volver</Text>
          </TouchableOpacity>
          <Text style={styles.passwordHint}>Contraseña por defecto: nospi2024</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.fullScreenContainer}>
        <Stack.Screen options={{ title: 'Panel de Administración' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={nospiColors.purpleDark} />
          <Text style={styles.loadingText}>Cargando datos...</Text>
        </View>
      </View>
    );
  }

  const NAV_ITEMS: { key: AdminView; icon: string; label: string }[] = [
    { key: 'dashboard',    icon: '📊', label: 'Dashboard' },
    { key: 'events',       icon: '🎉', label: 'Eventos' },
    { key: 'users',        icon: '👤', label: 'Usuarios' },
    { key: 'participants', icon: '👥', label: 'Participantes' },
    { key: 'questions',    icon: '❓', label: 'Preguntas' },
    { key: 'realtime',     icon: '🔴', label: 'En Vivo' },
    { key: 'reconciliation', icon: '🔄', label: 'Reconciliación' },
    { key: 'config',       icon: '⚙️', label: 'Config' },
  ];

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Inject real CSS — StyleSheet can't do position:fixed, 100vh, or media queries */}
      <style dangerouslySetInnerHTML={{ __html: `
        html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; }

        /* SIDEBAR — always position:fixed, independent of any parent */
        .nospi-sidebar {
          position: fixed;
          top: 0; left: 0;
          width: 240px;
          height: 100%;
          background: #6B0F3A;
          display: flex;
          flex-direction: column;
          z-index: 400;
          box-shadow: 4px 0 24px rgba(0,0,0,0.28);
          transition: transform 0.26s cubic-bezier(.4,0,.2,1);
        }
        .nospi-sidebar-hdr {
          display: flex; align-items: center; gap: 12px;
          padding: 28px 20px 22px;
          border-bottom: 1px solid rgba(255,255,255,0.12);
          flex-shrink: 0;
        }
        .nospi-logo {
          width: 42px; height: 42px; border-radius: 12px;
          background: rgba(255,255,255,0.18);
          display: flex; align-items: center; justify-content: center;
          font-size: 22px; font-weight: 700; color: #fff; flex-shrink: 0;
        }
        .nospi-brand { display: flex; flex-direction: column; }
        .nospi-brand-name { font-size: 15px; font-weight: 700; color: #fff; letter-spacing: 3px; }
        .nospi-brand-sub  { font-size: 10px; color: rgba(255,255,255,0.5); letter-spacing: 1.5px; margin-top: 2px; }
        .nospi-nav { flex: 1; padding: 12px 10px; overflow-y: auto; }
        .nospi-nav-btn {
          display: flex; align-items: center; gap: 12px;
          width: 100%; padding: 12px 14px; border-radius: 10px; margin-bottom: 4px;
          background: transparent; border: none; cursor: pointer;
          position: relative; text-align: left; transition: background 0.15s;
          -webkit-tap-highlight-color: transparent;
        }
        .nospi-nav-btn:hover  { background: rgba(255,255,255,0.10); }
        .nospi-nav-btn.active { background: rgba(255,255,255,0.18); }
        .nospi-nav-icon  { font-size: 17px; width: 22px; text-align: center; flex-shrink: 0; }
        .nospi-nav-label { font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.65); flex: 1; }
        .nospi-nav-btn.active .nospi-nav-label { color: #fff; }
        .nospi-nav-dot {
          position: absolute; right: 0; top: 50%; transform: translateY(-50%);
          width: 3px; height: 22px; border-radius: 2px; background: #FF6B9D;
        }
        .nospi-sidebar-ftr {
          padding: 14px 20px; border-top: 1px solid rgba(255,255,255,0.10);
          font-size: 11px; color: rgba(255,255,255,0.3); text-align: center; flex-shrink: 0;
        }

        /* OVERLAY — behind sidebar, above content */
        .nospi-overlay {
          display: none; position: fixed; inset: 0;
          background: rgba(0,0,0,0.55); z-index: 300;
        }
        .nospi-overlay.show { display: block; }

        /* MAIN CONTENT — offset by sidebar width on desktop */
        .nospi-main {
          position: fixed;
          top: 0; left: 240px; right: 0; bottom: 0;
          display: flex; flex-direction: column;
          background: #F3E8FF;
          z-index: 1;
        }
        .nospi-mobile-hdr {
          display: none; flex-direction: row;
          align-items: center; justify-content: space-between;
          background: #6B0F3A; padding: 13px 16px; flex-shrink: 0;
          box-shadow: 0 2px 10px rgba(0,0,0,0.25);
        }
        .nospi-burger {
          width: 40px; height: 40px; border-radius: 8px;
          background: rgba(255,255,255,0.15); border: none;
          font-size: 20px; color: #fff; cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
        .nospi-mobile-title { font-size: 15px; font-weight: 700; color: #fff; letter-spacing: 2.5px; }
        .nospi-content {
          flex: 1; overflow-y: auto; overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
        }
        .nospi-content-inner {
          padding: 24px; max-width: 1400px;
          margin: 0 auto; width: 100%; box-sizing: border-box;
        }

        /* MOBILE */
        @media (max-width: 767px) {
          .nospi-sidebar { transform: translateX(-240px); }
          .nospi-sidebar.open { transform: translateX(0); }
          .nospi-main { left: 0; }
          .nospi-mobile-hdr { display: flex; }
        }
      ` }} />

      {/* Overlay — closes sidebar on tap */}
      <div className={`nospi-overlay${sidebarOpen ? ' show' : ''}`} onClick={() => setSidebarOpen(false)} />

      {/* SIDEBAR — position:fixed, independent, always on top */}
      <div className={`nospi-sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="nospi-sidebar-hdr">
          <div className="nospi-logo">N</div>
          <div className="nospi-brand">
            <span className="nospi-brand-name">NOSPI</span>
            <span className="nospi-brand-sub">Admin Panel</span>
          </div>
        </div>
        <div className="nospi-nav">
          {NAV_ITEMS.map(item => (
            <button
              key={item.key}
              className={`nospi-nav-btn${currentView === item.key ? ' active' : ''}`}
              onClick={() => {
                if (item.key === 'questions') loadQuestions();
                setCurrentView(item.key);
                setSidebarOpen(false);
              }}
            >
              <span className="nospi-nav-icon">{item.icon}</span>
              <span className="nospi-nav-label">{item.label}</span>
              {currentView === item.key && <div className="nospi-nav-dot" />}
            </button>
          ))}
        </div>
        <div className="nospi-sidebar-ftr">Nospi © 2025</div>
      </div>

      {/* MAIN — position:fixed offset from sidebar */}
      <div className="nospi-main">
        <div className="nospi-mobile-hdr">
          <button className="nospi-burger" onClick={() => setSidebarOpen(p => !p)}>
            {sidebarOpen ? '✕' : '☰'}
          </button>
          <span className="nospi-mobile-title">NOSPI Admin</span>
          <div style={{ width: 40 }} />
        </div>
        <div className="nospi-content">
          <div className="nospi-content-inner">
            {currentView === 'dashboard'    && renderDashboard()}
            {currentView === 'events'       && renderEvents()}
            {currentView === 'users'        && renderUsers()}
            {currentView === 'participants' && renderParticipants()}
            {currentView === 'questions'    && renderQuestions()}
            {currentView === 'realtime'     && renderRealtime()}
            {currentView === 'reconciliation' && renderReconciliation()}
            {currentView === 'config'       && renderConfig()}
          </div>
        </div>
      </div>

      {/* NEW: Configuration Modal */}
      <Modal
        visible={showConfigModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowConfigModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.configModalContent}>
            <View style={styles.configModalHeader}>
              <Text style={styles.configModalTitle}>Configuración del Evento</Text>
              <TouchableOpacity
                style={styles.closeModalButton}
                onPress={() => setShowConfigModal(false)}
              >
                <Text style={styles.closeModalButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedEventForConfig && (
              <>
                <View style={styles.eventInfoSection}>
                  <Text style={styles.eventInfoTitle}>
                    {selectedEventForConfig.name || `${selectedEventForConfig.type} - ${selectedEventForConfig.city}`}
                  </Text>
                  <Text style={styles.eventInfoDetail}>
                    📅 {selectedEventForConfig.date} a las {selectedEventForConfig.time}
                  </Text>
                </View>

                <ScrollView style={styles.configActionsContainer}>
                  <TouchableOpacity
                    style={styles.configActionButton}
                    onPress={() => {
                      setShowConfigModal(false);
                      handleViewAttendees(selectedEventForConfig);
                    }}
                  >
                    <Text style={styles.configActionButtonText}>
                      👥 Ver Asistentes ({appointments.filter(a => a.event_id === selectedEventForConfig.id).length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.configActionButton, { backgroundColor: '#25D366' }]}
                    onPress={() => {
                      const confirmedForEvent = appointments.filter(
                        a => a.event_id === selectedEventForConfig.id && a.status === 'confirmada' && a.users?.phone
                      );
                      if (confirmedForEvent.length === 0) {
                        window.alert('No hay participantes confirmados con teléfono para este evento');
                        return;
                      }
                      setReminderWhatsAppModal({ list: confirmedForEvent, kind: '48h' });
                    }}
                  >
                    <Text style={styles.configActionButtonText}>📍 Confirmar 48 horas antes</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.configActionButton, { backgroundColor: '#128C7E' }]}
                    onPress={() => {
                      const confirmedForEvent = appointments.filter(
                        a => a.event_id === selectedEventForConfig.id && a.status === 'confirmada' && a.users?.phone
                      );
                      if (confirmedForEvent.length === 0) {
                        window.alert('No hay participantes confirmados con teléfono para este evento');
                        return;
                      }
                      setReminderWhatsAppModal({ list: confirmedForEvent, kind: 'sameday' });
                    }}
                  >
                    <Text style={styles.configActionButtonText}>🎉 Confirmar el Mismo Día</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.configActionButton, { backgroundColor: nospiColors.purpleDark }]}
                    onPress={() => {
                      setAddUserSearchQuery('');
                      setAddUserError(null);
                      setAddUserSuccess(null);
                      setShowConfigModal(false);
                      setShowAddExistingUserModal(true);
                    }}
                    >
                      <Text style={styles.configActionButtonText}>➕ Agregar Usuario Existente</Text>
                  </TouchableOpacity>

                  {selectedEventForConfig.event_status === 'draft' && (
                    <TouchableOpacity
                      style={[styles.configActionButton, { backgroundColor: nospiColors.purpleDark }]}
                      onPress={() => {
                        setShowConfigModal(false);
                        handlePublishEvent(selectedEventForConfig.id);
                      }}
                    >
                      <Text style={styles.configActionButtonText}>✅ Publicar Evento</Text>
                    </TouchableOpacity>
                  )}

                  {selectedEventForConfig.event_status === 'published' && !selectedEventForConfig.is_location_revealed && (
                    <TouchableOpacity
                      style={[styles.configActionButton, { backgroundColor: '#3B82F6' }]}
                      onPress={() => {
                        setShowConfigModal(false);
                        handleRevealLocation(selectedEventForConfig.id);
                      }}
                    >
                      <Text style={styles.configActionButtonText}>📍 Revelar Ubicación</Text>
                    </TouchableOpacity>
                )}
                {selectedEventForConfig.event_status === 'published' && !selectedEventForConfig.is_full && (
                <TouchableOpacity
                  style={[styles.configActionButton, { backgroundColor: '#EF4444' }]}
                  onPress={() => {
                    setShowConfigModal(false);
                    handleToggleRegistration(selectedEventForConfig.id, true);
                  }}
                  >
                <Text style={styles.configActionButtonText}>🚫 Cerrar Inscripciones</Text>
                </TouchableOpacity>
                )}
                  {selectedEventForConfig.event_status === 'published' && selectedEventForConfig.is_full && (
                <TouchableOpacity
                  style={[styles.configActionButton, { backgroundColor: '#22C55E' }]}
                  onPress={() => {
                    setShowConfigModal(false);
                    handleToggleRegistration(selectedEventForConfig.id, false);
                  }}
                  >
                <Text style={styles.configActionButtonText}>🔓 Abrir Inscripciones</Text>
                </TouchableOpacity>
                )}

                  {selectedEventForConfig.event_status === 'published' && (
                    <TouchableOpacity
                      style={[styles.configActionButton, { backgroundColor: '#F59E0B' }]}
                      onPress={() => {
                        setShowConfigModal(false);
                        handleCloseEvent(selectedEventForConfig.id);
                      }}
                    >
                      <Text style={styles.configActionButtonText}>🔒 Cerrar Evento</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.configActionButton, { backgroundColor: '#6366F1' }]}
                    onPress={() => {
                      setShowConfigModal(false);
                      openEditEventModal(selectedEventForConfig);
                    }}
                  >
                    <Text style={styles.configActionButtonText}>✏️ Editar Evento</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.configActionButton, { backgroundColor: '#0EA5E9' }]}
                    onPress={() => {
                      setShowConfigModal(false);
                      handleDuplicateEvent(selectedEventForConfig);
                    }}
                  >
                    <Text style={styles.configActionButtonText}>📋 Duplicar Evento</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.configActionButton, { backgroundColor: '#EF4444' }]}
                    onPress={() => {
                      setShowConfigModal(false);
                      handleDeleteEvent(selectedEventForConfig.id);
                    }}
                  >
                    <Text style={styles.configActionButtonText}>🗑️ Eliminar Evento</Text>
                  </TouchableOpacity>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
      {/* Bulk WhatsApp Pending Modal — envío uno por uno, evita que el navegador móvil bloquee varias pestañas a la vez */}
      <Modal
        visible={bulkWhatsAppPending !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setBulkWhatsAppPending(null)}
        >
      
      <View style={styles.modalOverlay}>
      <View style={styles.configModalContent}>
      <View style={styles.configModalHeader}>
      <Text style={styles.configModalTitle}>Enviar Confirmación por WhatsApp</Text>
        <TouchableOpacity style={styles.closeModalButton} onPress={() => setBulkWhatsAppPending(null)}>
          <Text style={styles.closeModalButtonText}>✕</Text>
        </TouchableOpacity>
      </View>
        <Text style={{ paddingHorizontal: 20, paddingTop: 10, color: '#6B7280', fontSize: 13 }}>Toca "Enviar" en cada persona — el navegador móvil solo permite abrir una pestaña de WhatsApp a la vez.</Text>
        <ScrollView style={styles.configActionsContainer}>
          {(bulkWhatsAppPending || []).length === 0 && <Text style={{ padding: 20, color: '#6B7280' }}>✅ Ya se le envió a todos.</Text>}
          {(bulkWhatsAppPending || []).map(a => (
          <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}>
            <Text style={{ fontSize: 14, color: '#111827', flex: 1 }}>{a.users?.name}</Text>
            <a href={buildWhatsAppLink(a.users.phone, a.users.name, a.events?.name, a.events?.date, a.events?.time)} target="_blank" rel="noopener noreferrer" onClick={() => { markPurchaseWhatsAppSent(a.id); setBulkWhatsAppPending(prev => (prev || []).filter(x => x.id !== a.id)); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, backgroundColor: '#25D366', color: 'white', textDecoration: 'none', padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>💬 Enviar</a>
          </View>))}
        </ScrollView>
      </View>
      </View>
      </Modal>
      {/* Bulk Declined Payments WhatsApp Modal — envío uno por uno, mismo motivo que el anterior */}
      <Modal
        visible={bulkDeclinedPending !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setBulkDeclinedPending(null)}
        >
      
      <View style={styles.modalOverlay}>
      <View style={styles.configModalContent}>
      <View style={styles.configModalHeader}>
      <Text style={styles.configModalTitle}>Enviar WhatsApp a Pagos Declinados</Text>
        <TouchableOpacity style={styles.closeModalButton} onPress={() => setBulkDeclinedPending(null)}>
          <Text style={styles.closeModalButtonText}>✕</Text>
        </TouchableOpacity>
      </View>
        <Text style={{ paddingHorizontal: 20, paddingTop: 10, color: '#6B7280', fontSize: 13 }}>Toca "Enviar" en cada persona — el navegador móvil solo permite abrir una pestaña de WhatsApp a la vez.</Text>
        <ScrollView style={styles.configActionsContainer}>
          {(bulkDeclinedPending || []).length === 0 && <Text style={{ padding: 20, color: '#6B7280' }}>✅ Ya se le envió a todos.</Text>}
          {(bulkDeclinedPending || []).map((p: any) => (
          <View key={`${p.user_id}_${p.event_id}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}>
            <Text style={{ fontSize: 14, color: '#111827', flex: 1 }}>{p.user_name}</Text>
            <a href={buildDeclinedPaymentWhatsAppLink(p.user_phone, p.user_name, p.event_name, p.event_date)} target="_blank" rel="noopener noreferrer" onClick={() => { markDeclinedWhatsAppSent(p.user_id, p.event_id); setBulkDeclinedPending(prev => (prev || []).filter(x => !(x.user_id === p.user_id && x.event_id === p.event_id))); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, backgroundColor: '#25D366', color: 'white', textDecoration: 'none', padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>💬 Enviar</a>
          </View>))}
        </ScrollView>
      </View>
      </View>
      </Modal>
      {/* Event Reminder WhatsApp Modal — envío uno por uno, mismo motivo que el anterior */}
      <Modal
        visible={reminderWhatsAppModal !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setReminderWhatsAppModal(null)}
        >
      
      <View style={styles.modalOverlay}>
      <View style={styles.configModalContent}>
      <View style={styles.configModalHeader}>
      <Text style={styles.configModalTitle}>{reminderWhatsAppModal?.kind === '48h' ? 'Recordatorio 48 Horas Antes' : 'Mensaje del Día del Evento'}</Text>
      <TouchableOpacity style={styles.closeModalButton} onPress={() => setReminderWhatsAppModal(null)}>
      <Text style={styles.closeModalButtonText}>✕</Text>
      </TouchableOpacity>
      </View>
      <Text style={{ paddingHorizontal: 20, paddingTop: 10, color: '#6B7280', fontSize: 13 }}>Toca "Enviar" en cada persona — el navegador móvil solo permite abrir una pestaña de WhatsApp a la vez.</Text>
      <ScrollView style={styles.configActionsContainer}>
        {(reminderWhatsAppModal?.list || []).length === 0 && <Text style={{ padding: 20, color: '#6B7280' }}>✅ Ya se le envió a todos.</Text>}
        {(reminderWhatsAppModal?.list || []).map(a => (
          <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}>
          <Text style={{ fontSize: 14, color: '#111827', flex: 1 }}>{a.users?.name}</Text>
          <a href={buildReminderLinkForModal(a)} target="_blank" rel="noopener noreferrer" onClick={() => setReminderWhatsAppModal(prev => prev ? { ...prev, list: prev.list.filter(x => x.id !== a.id) } : prev)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, backgroundColor: '#25D366', color: 'white', textDecoration: 'none', padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>💬 Enviar</a>
          </View>))}
      </ScrollView>
      </View>
      </View>
      </Modal>
      {/* Attendees Modal */}
      <Modal
        visible={showAttendeesModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAttendeesModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.attendeesModalContent}>
            <View style={styles.attendeesModalHeader}>
              <Text style={styles.attendeesModalTitle}>
                Asistentes del Evento
              </Text>
              <TouchableOpacity
                style={styles.closeModalButton}
                onPress={() => setShowAttendeesModal(false)}
              >
                <Text style={styles.closeModalButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedEventForAttendees && (
              <View style={styles.eventInfoSection}>
                <Text style={styles.eventInfoTitle}>{selectedEventForAttendees.name || `${selectedEventForAttendees.type} - ${selectedEventForAttendees.city}`}</Text>
                <Text style={styles.eventInfoDetail}>Fecha: {selectedEventForAttendees.date} a las {selectedEventForAttendees.time}</Text>
                <Text style={styles.eventInfoDetail}>Total registrados: {eventAttendees.length}</Text>
              </View>
            )}

            {loadingAttendees ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={nospiColors.purpleDark} />
                <Text style={styles.loadingText}>Cargando asistentes...</Text>
              </View>
            ) : eventAttendees.length === 0 ? (
              <View style={styles.emptyAttendeesContainer}>
                <Text style={styles.emptyAttendeesText}>No hay usuarios registrados en este evento aún</Text>
              </View>
            ) : (
              <ScrollView style={styles.attendeesList}>
                {eventAttendees.map((attendee, index) => {
                  const statusColor = attendee.status === 'confirmed' ? '#10B981' : '#F59E0B';
                  const paymentColor = attendee.payment_status === 'paid' ? '#10B981' : '#EF4444';
                  const interestedInText = attendee.users.interested_in === 'hombres' ? 'Hombres' : attendee.users.interested_in === 'mujeres' ? 'Mujeres' : attendee.users.interested_in === 'ambos' ? 'Ambos' : 'No especificado';
                  const genderText = attendee.users.gender === 'hombre' ? 'Hombre' : attendee.users.gender === 'mujer' ? 'Mujer' : 'No especificado';
                  
                  // Calculate age range preference display
                  const ageRangeMin = attendee.users.age_range_min || 18;
                  const ageRangeMax = attendee.users.age_range_max || 99;
                  const ageRangeText = `${ageRangeMin} - ${ageRangeMax} años`;
                  
                  return (
                    <View key={attendee.id} style={styles.attendeeItem}>
                      <View style={styles.attendeeHeader}>
                        <Text style={styles.attendeeNumber}>#{index + 1}</Text>
                        <Text style={styles.attendeeName}>{attendee.users.name}</Text>
                        <TouchableOpacity
                          style={styles.deleteAttendeeButton}
                          onPress={() => handleDeleteAttendee(attendee.id, attendee.users.name)}
                        >
                          <Text style={styles.deleteAttendeeButtonText}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.attendeeDetail}>📧 {attendee.users.email}</Text>
                      <Text style={styles.attendeeDetail}>
                        📝 Se inscribió: {attendee.created_at
                          ? new Date(attendee.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </Text>
                      <Text style={styles.attendeeDetail}>📱 {attendee.users.phone}</Text>
                      <Text style={styles.attendeeDetail}>📍 {attendee.users.city}, {attendee.users.country}</Text>
                      <Text style={styles.attendeeDetail}>👤 Género: {genderText}</Text>
                      <Text style={styles.attendeeDetail}>💝 Interesado en: {interestedInText}</Text>
                      {attendee.users.age && <Text style={styles.attendeeDetail}>🎂 Edad: {attendee.users.age} años</Text>}
                      <View style={styles.ageRangeHighlight}>
                        <Text style={styles.ageRangeLabel}>🎯 Rango de edad preferido:</Text>
                        <Text style={styles.ageRangeValue}>{ageRangeText}</Text>
                      </View>
                      <View style={styles.attendeeStatusRow}>
                        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                          <Text style={styles.statusBadgeText}>{attendee.status}</Text>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: paymentColor }]}>
                          <Text style={styles.statusBadgeText}>
                            {attendee.payment_status === 'paid' ? 'Pagado' : 'Pendiente'}
                          </Text>
                        </View>
                      </View>
                      {attendee.users.phone && (
                        <a
                          href={buildWhatsAppLink(
                            attendee.users.phone,
                            attendee.users.name,
                            selectedEventForAttendees?.name,
                            selectedEventForAttendees?.date,
                            selectedEventForAttendees?.time
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => markPurchaseWhatsAppSent(attendee.id)}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            backgroundColor: attendee.purchase_whatsapp_sent_at ? '#9CA3AF' : '#25D366', color: 'white', textDecoration: 'none',
                            padding: '10px 16px', borderRadius: 10, fontSize: 14, fontWeight: 700,
                            marginTop: 8,
                          }}
                        >
                          {attendee.purchase_whatsapp_sent_at ? '✅ WhatsApp Enviado' : '💬 Enviar WhatsApp'}
                        </a>
                      )}
                      <TouchableOpacity
                        style={[styles.moveAttendeeButton, { backgroundColor: '#EDE9FE', marginTop: 8 }]}
                        onPress={() => handleOpenEditUser(attendee.users)}
                      >
                        <Text style={[styles.moveAttendeeButtonText, { color: '#6B21A8' }]}>✏️ Editar Usuario</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.moveAttendeeButton}
                        onPress={() => handleOpenMoveAttendeeModal(attendee)}
                      >
                        <Text style={styles.moveAttendeeButtonText}>🔄 Mover a Otro Evento</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Event Creation/Edit Modal */}
      <Modal
        visible={showEventModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEventModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.eventModalContent}>
            <View style={styles.eventModalHeader}>
              <Text style={styles.eventModalTitle}>
                {editingEventId ? 'Editar Evento' : 'Crear Nuevo Evento'}
              </Text>
              <TouchableOpacity
                style={styles.closeModalButton}
                onPress={() => setShowEventModal(false)}
              >
                <Text style={styles.closeModalButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.eventModalBody}>
              <Text style={styles.inputLabel}>Nombre del Evento *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: Noche de Solteros"
                value={eventForm.name}
                onChangeText={(text) => setEventForm({ ...eventForm, name: text })}
              />

              <Text style={styles.inputLabel}>Ciudad *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: Bogotá"
                value={eventForm.city}
                onChangeText={(text) => setEventForm({ ...eventForm, city: text })}
              />

              <Text style={styles.inputLabel}>Descripción</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Describe el evento..."
                value={eventForm.description}
                onChangeText={(text) => setEventForm({ ...eventForm, description: text })}
                multiline
                numberOfLines={4}
              />

              <Text style={styles.inputLabel}>Tipo de Evento *</Text>
              <select
                style={{
                  backgroundColor: '#F5F5F5',
                  borderWidth: 1,
                  borderColor: '#E0E0E0',
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 16,
                  marginBottom: 16,
                  width: '100%',
                }}
                value={eventForm.type}
                onChange={(e) => setEventForm({ ...eventForm, type: e.target.value })}
              >
                <option value="bar">Bar</option>
                <option value="restaurant">Restaurante</option>
              </select>

              <Text style={styles.inputLabel}>Fecha *</Text>
              <input
                type="date"
                style={{
                  backgroundColor: '#F5F5F5',
                  border: '1px solid #E0E0E0',
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 16,
                  marginBottom: 16,
                  width: '100%',
                }}
                value={eventForm.date}
                onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })}
              />

              <Text style={styles.inputLabel}>Hora *</Text>
              <input
                type="time"
                style={{
                  backgroundColor: '#F5F5F5',
                  border: '1px solid #E0E0E0',
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 16,
                  marginBottom: 16,
                  width: '100%',
                }}
                value={eventForm.time}
                onChange={(e) => setEventForm({ ...eventForm, time: e.target.value })}
              />

              <Text style={styles.inputLabel}>Nombre del Lugar</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: Bar La Terraza"
                value={eventForm.location_name}
                onChangeText={(text) => setEventForm({ ...eventForm, location_name: text })}
              />

              <Text style={styles.inputLabel}>Dirección del Lugar</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: Calle 85 #15-20"
                value={eventForm.location_address}
                onChangeText={(text) => setEventForm({ ...eventForm, location_address: text })}
              />

              <Text style={styles.inputLabel}>Enlace de Google Maps</Text>
              <TextInput
                style={styles.input}
                placeholder="https://maps.google.com/..."
                value={eventForm.maps_link}
                onChangeText={(text) => setEventForm({ ...eventForm, maps_link: text })}
              />

              <Text style={styles.inputLabel}>Máximo de Participantes</Text>
              <TextInput
                style={styles.input}
                placeholder="6"
                keyboardType="numeric"
                value={String(eventForm.max_participants)}
                onChangeText={(text) => setEventForm({ ...eventForm, max_participants: parseInt(text) || 6 })}
              />

              <Text style={styles.inputLabel}>Código de Confirmación</Text>
              <TextInput
                style={styles.input}
                placeholder="1986"
                value={eventForm.confirmation_code}
                onChangeText={(text) => setEventForm({ ...eventForm, confirmation_code: text })}
              />

              <View style={styles.checkboxContainer}>
                <TouchableOpacity
                  style={styles.checkbox}
                  onPress={() => setEventForm({ ...eventForm, is_location_revealed: !eventForm.is_location_revealed })}
                >
                  <Text style={styles.checkboxText}>
                    {eventForm.is_location_revealed ? '☑' : '☐'} Revelar ubicación inmediatamente
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Estado del Evento</Text>
              <select
                style={{
                  backgroundColor: '#F5F5F5',
                  borderWidth: 1,
                  borderColor: '#E0E0E0',
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 16,
                  marginBottom: 16,
                  width: '100%',
                }}
                value={eventForm.event_status}
                onChange={(e) => setEventForm({ ...eventForm, event_status: e.target.value as 'draft' | 'published' | 'closed' })}
              >
                <option value="draft">Borrador</option>
                <option value="published">Publicado</option>
                <option value="closed">Cerrado</option>
              </select>

              {/* Event Questions Section with Drag-and-Drop */}
              <View style={styles.questionsSection}>
                <TouchableOpacity
                  style={styles.questionsSectionHeader}
                  onPress={() => setShowEventQuestionsSection(!showEventQuestionsSection)}
                >
                  <Text style={styles.questionsSectionTitle}>
                    ❓ Preguntas del Evento (Opcional)
                  </Text>
                  <Text style={styles.questionsSectionToggle}>
                    {showEventQuestionsSection ? '▼' : '▶'}
                  </Text>
                </TouchableOpacity>

                {showEventQuestionsSection && (
                  <View style={styles.questionsContent}>
                    <Text style={styles.questionsInfo}>
                      Personaliza las preguntas para este evento específico. Arrastra las preguntas para reordenarlas. Si no agregas preguntas, se usarán las predeterminadas.
                    </Text>

                    {(['divertido', 'sensual', 'atrevido'] as const).map((level) => {
                      const levelEmoji = level === 'divertido' ? '😄' : level === 'sensual' ? '😘' : '🔥';
                      const levelText = level === 'divertido' ? 'Divertido' : level === 'sensual' ? 'Sensual' : 'Atrevido';
                      
                      return (
                        <View key={level} style={styles.questionLevelSection}>
                          <Text style={styles.questionLevelTitle}>
                            {levelEmoji} Nivel {levelText}
                          </Text>
                          {eventQuestions[level].map((question, index) => (
                            <div
                              key={index}
                              draggable
                              onDragStart={() => {
                                // Store the dragged question info
                                (window as any).__draggedEventQuestion = { level, index };
                              }}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={() => {
                                const draggedInfo = (window as any).__draggedEventQuestion;
                                if (!draggedInfo || draggedInfo.level !== level || draggedInfo.index === index) {
                                  return;
                                }
                                
                                // Reorder questions within the same level
                                const newQuestions = { ...eventQuestions };
                                const [draggedQuestion] = newQuestions[level].splice(draggedInfo.index, 1);
                                newQuestions[level].splice(index, 0, draggedQuestion);
                                setEventQuestions(newQuestions);
                                
                                delete (window as any).__draggedEventQuestion;
                              }}
                              style={{
                                cursor: 'grab',
                                marginBottom: 8,
                              }}
                            >
                              <View style={styles.questionInputRow}>
                                <Text style={styles.dragHandle}>⋮⋮</Text>
                                <TextInput
                                  style={[styles.input, { flex: 1 }]}
                                  placeholder={`Pregunta ${index + 1}`}
                                  value={question}
                                  onChangeText={(text) => {
                                    const newQuestions = { ...eventQuestions };
                                    newQuestions[level][index] = text;
                                    setEventQuestions(newQuestions);
                                  }}
                                />
                                <TouchableOpacity
                                  style={styles.removeQuestionButton}
                                  onPress={() => {
                                    const newQuestions = { ...eventQuestions };
                                    newQuestions[level].splice(index, 1);
                                    setEventQuestions(newQuestions);
                                  }}
                                >
                                  <Text style={styles.removeQuestionButtonText}>✕</Text>
                                </TouchableOpacity>
                              </View>
                            </div>
                          ))}
                          <TouchableOpacity
                            style={styles.addQuestionButton}
                            onPress={() => {
                              const newQuestions = { ...eventQuestions };
                              newQuestions[level].push('');
                              setEventQuestions(newQuestions);
                            }}
                          >
                            <Text style={styles.addQuestionButtonText}>+ Agregar Pregunta</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={styles.saveEventButton}
                onPress={handleSaveEvent}
              >
                <Text style={styles.saveEventButtonText}>
                  {editingEventId ? '💾 Guardar Cambios' : '✨ Crear Evento'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Move Attendee Modal */}
      <Modal
        visible={showMoveAttendeeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMoveAttendeeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.moveAttendeeModalContent}>
            <View style={styles.moveAttendeeModalHeader}>
              <Text style={styles.moveAttendeeModalTitle}>Mover Asistente</Text>
              <TouchableOpacity
                style={styles.closeModalButton}
                onPress={() => setShowMoveAttendeeModal(false)}
              >
                <Text style={styles.closeModalButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedAttendeeToMove && (
              <View style={styles.moveAttendeeModalBody}>
                <View style={styles.attendeeInfoSection}>
                  <Text style={styles.attendeeInfoTitle}>Asistente:</Text>
                  <Text style={styles.attendeeInfoName}>{selectedAttendeeToMove.users.name}</Text>
                  <Text style={styles.attendeeInfoDetail}>📧 {selectedAttendeeToMove.users.email}</Text>
                </View>

                <Text style={styles.inputLabel}>Seleccionar Evento de Destino:</Text>
                <ScrollView style={styles.eventSelectionList}>
                  {events
                    .filter(e => e.id !== selectedAttendeeToMove.event_id && e.event_status === 'published')
                    .map((event) => {
                      const eventName = event.name || `${event.type} - ${event.city}`;
                      const eventDate = event.date;
                      const eventTime = event.time;
                      const isSelected = targetEventId === event.id;
                      
                      return (
                        <TouchableOpacity
                          key={event.id}
                          style={[
                            styles.eventSelectionItem,
                            isSelected && styles.eventSelectionItemSelected,
                          ]}
                          onPress={() => setTargetEventId(event.id)}
                        >
                          <View style={styles.eventSelectionRadio}>
                            {isSelected && <View style={styles.eventSelectionRadioInner} />}
                          </View>
                          <View style={styles.eventSelectionInfo}>
                            <Text style={styles.eventSelectionName}>{eventName}</Text>
                            <Text style={styles.eventSelectionDate}>📅 {eventDate} a las {eventTime}</Text>
                            <Text style={styles.eventSelectionCity}>📍 {event.city}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                </ScrollView>

                <View style={styles.moveAttendeeModalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalButtonCancel]}
                    onPress={() => setShowMoveAttendeeModal(false)}
                  >
                    <Text style={styles.modalButtonTextCancel}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modalButton,
                      styles.modalButtonConfirm,
                      (!targetEventId || movingAttendee) && styles.modalButtonDisabled,
                    ]}
                    onPress={handleMoveAttendee}
                    disabled={!targetEventId || movingAttendee}
                  >
                    {movingAttendee ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Text style={styles.modalButtonTextConfirm}>Mover Asistente</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        visible={showEditUserModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditUserModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.moveAttendeeModalContent}>
            <View style={styles.moveAttendeeModalHeader}>
              <Text style={styles.moveAttendeeModalTitle}>Editar Usuario</Text>
              <TouchableOpacity
                style={styles.closeModalButton}
                onPress={() => setShowEditUserModal(false)}
              >
                <Text style={styles.closeModalButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.moveAttendeeModalBody}>
              {userEditError && (
                <View style={{ backgroundColor: '#FEE2E2', borderRadius: 10, padding: 12, marginBottom: 14 }}>
                  <Text style={{ color: '#DC2626', fontSize: 13, fontWeight: '600' }}>{userEditError}</Text>
                </View>
              )}

              <Text style={styles.inputLabel}>Nombre</Text>
              <input
                style={editInputStyle}
                value={editUserForm.name || ''}
                onChange={(e: any) => setEditUserForm({ ...editUserForm, name: e.target.value })}
              />

              <Text style={styles.inputLabel}>Email</Text>
              <input
                style={editInputStyle}
                value={editUserForm.email || ''}
                onChange={(e: any) => setEditUserForm({ ...editUserForm, email: e.target.value })}
              />

              <Text style={styles.inputLabel}>Teléfono</Text>
              <input
                style={editInputStyle}
                value={editUserForm.phone || ''}
                onChange={(e: any) => setEditUserForm({ ...editUserForm, phone: e.target.value })}
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Ciudad</Text>
                  <input
                    style={editInputStyle}
                    value={editUserForm.city || ''}
                    onChange={(e: any) => setEditUserForm({ ...editUserForm, city: e.target.value })}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>País</Text>
                  <input
                    style={editInputStyle}
                    value={editUserForm.country || ''}
                    onChange={(e: any) => setEditUserForm({ ...editUserForm, country: e.target.value })}
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Género</Text>
                  <select
                    style={editInputStyle}
                    value={editUserForm.gender || ''}
                    onChange={(e: any) => setEditUserForm({ ...editUserForm, gender: e.target.value })}
                  >
                    <option value="hombre">Hombre</option>
                    <option value="mujer">Mujer</option>
                  </select>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Interesado en</Text>
                  <select
                    style={editInputStyle}
                    value={editUserForm.interested_in || ''}
                    onChange={(e: any) => setEditUserForm({ ...editUserForm, interested_in: e.target.value })}
                  >
                    <option value="hombres">Hombres</option>
                    <option value="mujeres">Mujeres</option>
                    <option value="ambos">Ambos</option>
                  </select>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Edad</Text>
                  <input
                    type="number"
                    style={editInputStyle}
                    value={editUserForm.age ?? ''}
                    onChange={(e: any) => setEditUserForm({ ...editUserForm, age: parseInt(e.target.value, 10) || 0 })}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Rango edad mín</Text>
                  <input
                    type="number"
                    style={editInputStyle}
                    value={editUserForm.age_range_min ?? ''}
                    onChange={(e: any) => setEditUserForm({ ...editUserForm, age_range_min: parseInt(e.target.value, 10) || 18 })}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Rango edad máx</Text>
                  <input
                    type="number"
                    style={editInputStyle}
                    value={editUserForm.age_range_max ?? ''}
                    onChange={(e: any) => setEditUserForm({ ...editUserForm, age_range_max: parseInt(e.target.value, 10) || 99 })}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Fecha de nacimiento</Text>
              <input
                type="date"
                style={editInputStyle}
                value={editUserForm.birthdate || ''}
                onChange={(e: any) => setEditUserForm({ ...editUserForm, birthdate: e.target.value })}
              />
            </ScrollView>

            <View style={styles.moveAttendeeModalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowEditUserModal(false)}
              >
                <Text style={styles.modalButtonTextCancel}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm, savingUserEdit && styles.modalButtonDisabled]}
                onPress={handleSaveUserEdit}
                disabled={savingUserEdit}
              >
                {savingUserEdit ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.modalButtonTextConfirm}>Guardar Cambios</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Existing User To Event Modal */}
      <Modal
        visible={showAddExistingUserModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddExistingUserModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.moveAttendeeModalContent}>
            <View style={styles.moveAttendeeModalHeader}>
              <Text style={styles.moveAttendeeModalTitle}>
                ➕ Agregar Usuario a {selectedEventForConfig?.name || 'Evento'}
              </Text>
              <TouchableOpacity
                style={styles.closeModalButton}
                onPress={() => setShowAddExistingUserModal(false)}
              >
                <Text style={styles.closeModalButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={{ padding: 16, paddingBottom: 0 }}>
              <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 10 }}>
                Busca por nombre o email. Se agregará con la cita ya confirmada, sin necesidad de pago.
              </Text>
              <input
                autoFocus
                placeholder="Buscar por nombre o email..."
                value={addUserSearchQuery}
                onChange={(e: any) => { setAddUserSearchQuery(e.target.value); setAddUserError(null); setAddUserSuccess(null); }}
                style={{
                  width: '100%', border: '1.5px solid #E5E7EB', borderRadius: 10,
                  padding: '10px 12px', fontSize: 14, backgroundColor: '#FAFAFA', color: '#111',
                  boxSizing: 'border-box', marginBottom: 10,
                }}
              />
              {addUserError && (
                <View style={{ backgroundColor: '#FEE2E2', borderRadius: 10, padding: 10, marginBottom: 10 }}>
                  <Text style={{ color: '#DC2626', fontSize: 13, fontWeight: '600' }}>{addUserError}</Text>
                </View>
              )}
              {addUserSuccess && (
                <View style={{ backgroundColor: '#D1FAE5', borderRadius: 10, padding: 10, marginBottom: 10 }}>
                  <Text style={{ color: '#065F46', fontSize: 13, fontWeight: '600' }}>✅ {addUserSuccess}</Text>
                </View>
              )}
            </View>

            <ScrollView style={[styles.moveAttendeeModalBody, { maxHeight: 320 }]}>
              {addUserSearchQuery.trim().length < 2 ? (
                <Text style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', padding: 20 }}>
                  Escribe al menos 2 letras para buscar
                </Text>
              ) : (() => {
                const q = addUserSearchQuery.trim().toLowerCase();
                const results = users
                  .filter(u => (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
                  .slice(0, 10);
                if (results.length === 0) {
                  return (
                    <Text style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', padding: 20 }}>
                      No se encontraron usuarios
                    </Text>
                  );
                }
                return results.map(u => (
                  <View
                    key={u.id}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#6B21A8' }}>{u.name}</Text>
                      <Text style={{ fontSize: 12, color: '#6B7280' }}>{u.email}{u.phone ? ` · ${u.phone}` : ''}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleAddExistingUserToEvent(u.id)}
                      disabled={addingUserId === u.id}
                      style={{
                        backgroundColor: nospiColors.purpleDark, borderRadius: 20,
                        paddingVertical: 6, paddingHorizontal: 14,
                        opacity: addingUserId === u.id ? 0.6 : 1,
                      }}
                    >
                      {addingUserId === u.id
                        ? <ActivityIndicator size="small" color="white" />
                        : <Text style={{ color: 'white', fontSize: 12, fontWeight: '700' }}>Agregar</Text>
                      }
                    </TouchableOpacity>
                  </View>
                ));
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Questions Management Modal */}
      <Modal
        visible={showQuestionsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowQuestionsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.questionsModalContent}>
            <View style={styles.questionsModalHeader}>
              <Text style={styles.questionsModalTitle}>Gestión de Preguntas</Text>
              <TouchableOpacity
                style={styles.closeModalButton}
                onPress={() => setShowQuestionsModal(false)}
              >
                <Text style={styles.closeModalButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.questionsModalBody}>
              <View style={styles.levelSelector}>
                <TouchableOpacity
                  style={[styles.levelButton, selectedLevel === 'divertido' && styles.levelButtonActive]}
                  onPress={() => {
                    setSelectedLevel('divertido');
                    loadQuestions();
                  }}
                >
                  <Text style={[styles.levelButtonText, selectedLevel === 'divertido' && styles.levelButtonTextActive]}>
                    😄 Divertido
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.levelButton, selectedLevel === 'sensual' && styles.levelButtonActive]}
                  onPress={() => {
                    setSelectedLevel('sensual');
                    loadQuestions();
                  }}
                >
                  <Text style={[styles.levelButtonText, selectedLevel === 'sensual' && styles.levelButtonTextActive]}>
                    😘 Sensual
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.levelButton, selectedLevel === 'atrevido' && styles.levelButtonActive]}
                  onPress={() => {
                    setSelectedLevel('atrevido');
                    loadQuestions();
                  }}
                >
                  <Text style={[styles.levelButtonText, selectedLevel === 'atrevido' && styles.levelButtonTextActive]}>
                    🔥 Atrevido
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.addQuestionSection}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Nueva pregunta..."
                  value={newQuestionText}
                  onChangeText={setNewQuestionText}
                />
                <TouchableOpacity style={styles.addButton} onPress={handleAddQuestion}>
                  <Text style={styles.addButtonText}>+ Agregar</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.bulkActionsSection}>
                <TouchableOpacity
                  style={styles.bulkActionButton}
                  onPress={handleRestoreDefaultQuestions}
                >
                  <Text style={styles.bulkActionButtonText}>🔄 Restaurar Predeterminadas</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.bulkActionButton}
                  onPress={handleDownloadTemplate}
                >
                  <Text style={styles.bulkActionButtonText}>📥 Descargar Plantilla Excel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.bulkActionButton}
                  onPress={handleMassUpload}
                >
                  <Text style={styles.bulkActionButtonText}>📤 Cargar desde Excel (.xlsx)</Text>
                </TouchableOpacity>
              </View>

              {loadingQuestions ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={nospiColors.purpleDark} />
                </View>
              ) : (
                <ScrollView style={styles.questionsList}>
                  {questions.map((question, index) => (
                    <div
                      key={question.id}
                      draggable
                      onDragStart={() => handleDragStart(question.id)}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDrop(question.id)}
                      style={{
                        cursor: 'grab',
                        opacity: draggedQuestionId === question.id ? 0.5 : 1,
                      }}
                    >
                      <View style={styles.questionItem}>
                        <Text style={styles.dragHandle}>⋮⋮</Text>
                        <Text style={styles.questionNumber}>#{index + 1}</Text>
                        <TextInput
                          style={[styles.input, { flex: 1 }]}
                          value={question.question_text}
                          onChangeText={(text) => {
                            const updatedQuestions = [...questions];
                            updatedQuestions[index].question_text = text;
                            setQuestions(updatedQuestions);
                          }}
                          onBlur={() => handleUpdateQuestion(question.id, question.question_text)}
                        />
                        <TouchableOpacity
                          style={styles.deleteQuestionButton}
                          onPress={() => handleDeleteQuestion(question.id)}
                        >
                          <Text style={styles.deleteQuestionButtonText}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                    </div>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </View>
      </Modal>
      {/* Manual Confirmation Modal */}

    </>
  );
}

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#F3E8FF',
  },
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: nospiColors.purpleDark,
  },
  passwordContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    maxWidth: 500,
    alignSelf: 'center',
    width: '100%',
  },
  passwordTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 8,
    textAlign: 'center',
  },
  passwordSubtitle: {
    fontSize: 18,
    color: nospiColors.purpleDark,
    opacity: 0.8,
    marginBottom: 32,
    textAlign: 'center',
  },
  passwordInput: {
    width: '100%',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: nospiColors.purpleLight,
  },
  passwordButton: {
    width: '100%',
    backgroundColor: nospiColors.purpleDark,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  passwordButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  backButton: {
    padding: 12,
  },
  backButtonText: {
    color: nospiColors.purpleDark,
    fontSize: 16,
  },
  passwordHint: {
    marginTop: 24,
    fontSize: 14,
    color: nospiColors.purpleDark,
    opacity: 0.6,
    textAlign: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: nospiColors.purpleDark,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  tabTextActive: {
    color: nospiColors.purpleDark,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
    maxWidth: 1400,
    alignSelf: 'center',
    width: '100%',
  },
  dashboardContainer: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
    marginBottom: 32,
  },
  statCard: {
    width: 'calc(25% - 16px)',
    minWidth: 200,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    margin: 8,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '600',
  },
  quickActions: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  quickActionsTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 16,
  },
  actionButton: {
    backgroundColor: nospiColors.purpleDark,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  actionButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: nospiColors.purpleDark,
  },
  actionButtonTextSecondary: {
    color: nospiColors.purpleDark,
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  listContainer: {
    flex: 1,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  createButton: {
    backgroundColor: nospiColors.purpleDark,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  createButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  codeHighlight: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  codeLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#92400E',
    marginBottom: 4,
  },
  codeValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#92400E',
    letterSpacing: 2,
  },
  listItemCompact: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: nospiColors.purpleMid,
  },
  compactInfoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  compactInfoText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  configButton: {
    backgroundColor: nospiColors.purpleDark,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  configButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  configModalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    width: '90%',
    maxWidth: 600,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  configModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  configModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  closeModalButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeModalButtonText: {
    fontSize: 20,
    color: '#6B7280',
    fontWeight: 'bold',
  },
  configActionsContainer: {
    flex: 1,
    padding: 20,
  },
  configActionButton: {
    backgroundColor: nospiColors.purpleMid,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  configActionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  realtimeInfo: {
    backgroundColor: '#E0E7FF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  realtimeInfoText: {
    fontSize: 16,
    color: '#3730A3',
    textAlign: 'center',
    marginBottom: 16,
  },
  eventSelector: {
    marginBottom: 24,
  },
  participantsContainer: {
    marginTop: 24,
  },
  participantsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 16,
  },
  participantItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  participantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  participantNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: nospiColors.purpleMid,
    marginRight: 8,
  },
  participantName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    flex: 1,
  },
  participantDetail: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  matchesSection: {
    marginBottom: 32,
  },
  ratingsSection: {
    marginBottom: 32,
  },
  subsectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
  },
  matchItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  matchLevel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  matchDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  matchUsers: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  matchEmails: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  ratingItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  ratingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ratingStars: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F59E0B',
  },
  ratingDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  ratingUsers: {
    fontSize: 14,
    color: '#6B7280',
  },
  listItem: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  listItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  listItemTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    flex: 1,
  },
  listItemDetail: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: nospiColors.purpleDark,
    marginBottom: 8,
    marginTop: 12,
  },
  eventInfoSection: {
    padding: 20,
    backgroundColor: nospiColors.purpleLight,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  eventInfoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 8,
  },
  eventInfoDetail: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  attendeesModalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    width: '90%',
    maxWidth: 600,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  attendeesModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  attendeesModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  emptyAttendeesContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyAttendeesText: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  attendeesList: {
    flex: 1,
    padding: 20,
  },
  attendeeItem: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  attendeeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  attendeeNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: nospiColors.purpleMid,
    marginRight: 8,
  },
  attendeeName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    flex: 1,
  },
  attendeeDetail: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  attendeeStatusRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  eventModalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    width: '90%',
    maxWidth: 700,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  eventModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  eventModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  eventModalBody: {
    flex: 1,
    padding: 20,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  checkboxContainer: {
    marginBottom: 16,
  },
  checkbox: {
    padding: 12,
  },
  checkboxText: {
    fontSize: 16,
    color: nospiColors.purpleDark,
  },
  questionsSection: {
    marginTop: 24,
    marginBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 16,
  },
  questionsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  questionsSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  questionsSectionToggle: {
    fontSize: 16,
    color: nospiColors.purpleDark,
  },
  questionsContent: {
    marginTop: 16,
  },
  questionsInfo: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  questionLevelSection: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
  },
  questionLevelTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 12,
  },
  questionInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dragHandle: {
    fontSize: 20,
    color: '#9CA3AF',
    marginRight: 8,
    cursor: 'grab',
  },
  removeQuestionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeQuestionButtonText: {
    fontSize: 18,
    color: '#DC2626',
    fontWeight: 'bold',
  },
  addQuestionButton: {
    backgroundColor: nospiColors.purpleLight,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  addQuestionButtonText: {
    color: nospiColors.purpleDark,
    fontSize: 14,
    fontWeight: 'bold',
  },
  saveEventButton: {
    backgroundColor: nospiColors.purpleDark,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 24,
  },
  saveEventButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  questionsModalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    width: '90%',
    maxWidth: 700,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  questionsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  questionsModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  questionsModalBody: {
    flex: 1,
    padding: 20,
  },
  levelSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  levelButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  levelButtonActive: {
    backgroundColor: nospiColors.purpleDark,
  },
  levelButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#6B7280',
  },
  levelButtonTextActive: {
    color: 'white',
  },
  addQuestionSection: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  addButton: {
    backgroundColor: nospiColors.purpleDark,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  addButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  bulkActionsSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  bulkActionButton: {
    backgroundColor: '#E0E7FF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bulkActionButtonText: {
    color: '#3730A3',
    fontSize: 12,
    fontWeight: 'bold',
  },
  questionsList: {
    flex: 1,
  },
  questionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  questionNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: nospiColors.purpleMid,
    width: 32,
  },
  deleteQuestionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteQuestionButtonText: {
    fontSize: 18,
  },
  dragHandle: {
    fontSize: 20,
    color: '#9CA3AF',
    marginRight: 8,
    cursor: 'grab',
  },
  deleteAttendeeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  deleteAttendeeButtonText: {
    fontSize: 16,
  },
  ageRangeHighlight: {
    marginTop: 4,
  },
  ageRangeLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 0,
  },
  ageRangeValue: {
    fontSize: 14,
    color: '#6B7280',
  },
  moveAttendeeButton: {
    backgroundColor: nospiColors.purpleDark,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  moveAttendeeButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  moveAttendeeModalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    width: '90%',
    maxWidth: 600,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  moveAttendeeModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  moveAttendeeModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
  },
  moveAttendeeModalBody: {
    flex: 1,
    padding: 20,
  },
  attendeeInfoSection: {
    backgroundColor: '#F3E8FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  attendeeInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: nospiColors.purpleDark,
    marginBottom: 8,
  },
  attendeeInfoName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 4,
  },
  attendeeInfoDetail: {
    fontSize: 14,
    color: '#6B7280',
  },
  eventSelectionList: {
    flex: 1,
    marginBottom: 20,
  },
  eventSelectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  eventSelectionItemSelected: {
    backgroundColor: '#E0E7FF',
    borderColor: nospiColors.purpleDark,
  },
  eventSelectionRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: nospiColors.purpleDark,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventSelectionRadioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: nospiColors.purpleDark,
  },
  eventSelectionInfo: {
    flex: 1,
  },
  eventSelectionName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: nospiColors.purpleDark,
    marginBottom: 4,
  },
  eventSelectionDate: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 2,
  },
  eventSelectionCity: {
    fontSize: 14,
    color: '#6B7280',
  },
  moveAttendeeModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#F3F4F6',
  },
  modalButtonConfirm: {
    backgroundColor: nospiColors.purpleDark,
  },
  modalButtonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.6,
  },
  modalButtonTextCancel: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalButtonTextConfirm: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
