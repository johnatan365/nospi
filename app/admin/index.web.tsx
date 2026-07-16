https://raw.githubusercontent.com/johnatan365/nospi/main/app/admin/index.web.tsx?cbmsg=1
→ https://raw.githubusercontent.com/johnatan365/nospi/main/app/admin/index.web.tsx?cbmsg=1
Content-Type: text/plain; charset=utf-8

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
  purchase_whatsapp_sent_at?: string | null;
  reminder_48h_sent_at?: string | null;
  sameday_reminder_sent_at?: string | null;
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
    `Abre la app apenas llegues para confirmar e iniciar la experiencia con los demás: https://app.nospi.co/`,
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
  const [userSearchQuery, setUserSearchQuery] = useState('');

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
          reminder_48h_sent_at: apt.reminder_48h_sent_at,
          sameday_reminder_sent_at: apt.sameday_reminder_sent_at,
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

  const handleDeletePaymentAttempt = async (paymentAttemptId: string) => {
    const confirmed = window.confirm('¿Eliminar este registro de pago? Esta acción no se puede deshacer.');
    if (!confirmed) return;
    setResolvingKey(`delpay_${paymentAttemptId}`);
    try {
      const { error } = await supabase
        .from('payment_attempts')
        .delete()
        .eq('id', paymentAttemptId);
      if (error) {
        window.alert('Error al eliminar: ' + error.message);
        return;
      }
      await loadDashboardData();
    } catch (e: any) {
      window.alert('Error inesperado: ' + e.message);
    } finally {
      setResolvingKey(null);
    }
  };

  const handleDeleteOrphanAppointment = async (appointmentId: string) => {
    const confirmed = window.confirm('¿Eliminar esta cita por completo? Esta acción no se puede deshacer.');
    if (!confirmed) return;
    setResolvingKey(`delapt_${appointmentId}`);
    try {
      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', appointmentId);
      if (error) {
        window.alert('Error al eliminar: ' + error.message);
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
      // FIX: usar componentes de fecha en hora LOCAL (no toISOString, que da
      // la fecha en UTC) — si no, un evento a las 7pm en Bogotá (UTC-5) se
      // guarda como medianoche UTC del día siguiente, y al editar se mostraba
      // un día adelantado aunque la hora sí salía correcta.
      const startDate = new Date(event.start_time);
      const yyyy = startDate.getFullYear();
      const mm = (startDate.getMonth() + 1).toString().padStart(2, '0');
      const dd = startDate.getDate().toString().padStart(2, '0');
      dateValue = `${yyyy}-${mm}-${dd}`;
      const hours = startDate.getHours().toString().padStart(2, '0');
      const minutes = startDate.getMinutes().toString().padStart(2, '0');
      timeValue = `${hours}:${minutes}`;
    } else if (event.date && event.time) {
      const startDate = new Date(event.date);
      const yyyy = startDate.getFullYear();
      const mm = (startDate.getMonth() + 1).toString().padStart(2, '0');
      const dd = startDate.getDate().toString().padStart(2, '0');
      dateValue = `${yyyy}-${mm}-${dd}`;
      timeValue = event.time;
    }
    
    setEventForm({
      name: event.name || '',
      city: event.city || '',
      description: event.description || '',
      // FIX: la BD guarda 'restaurante' (español) pero el <select> usa
      // 'restaurant' (inglés) como value — sin este mapeo, el dropdown no
      // encontraba coincidencia y mostraba "Bar" aunque el evento fuera restaurante.
      type: event.type === 'restaurante' ? 'restaurant' : (event.type || 'bar'),
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
                  <div style={{ display: 'flex', gap: 8 }}>
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
                    <button
                      onClick={() => handleDeletePaymentAttempt(pa.id)}
                      disabled={resolvingKey === `delpay_${pa.id}`}
                      style={{
                        backgroundColor: '#EF4444', color: 'white', border: 'none', borderRadius: 8,
                        padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        opacity: resolvingKey === `delpay_${pa.id}` ? 0.6 : 1,
                      }}
                    >
                      {resolvingKey === `delpay_${pa.id}` ? 'Eliminando...' : '🗑️ Eliminar'}
                    </button>
                  </div>
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
                    <button
                      onClick={() => handleDeleteOrphanAppointment(a.id)}
                      disabled={resolvingKey === `delapt_${a.id}`}
                      style={{ backgroundColor: '#7C2D12', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: resolvingKey === `delapt_${a.id}` ? 0.6 : 1 }}
                    >
                      {resolvingKey === `delapt_${a.id}` ? 'Eliminando...' : '🗑️ Eliminar'}
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
          <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderLeft: `4px solid ${configTestPaymentEnabled ? '#F59E0B
