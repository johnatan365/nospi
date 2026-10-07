// Dividir un evento en varios grupos (mesas), desde el admin.
//
// Hasta hoy esto se hacia a mano por consulta directa a la base. Lo que aporta
// esta pantalla sobre eso es la VISTA PREVIA: deja ver como quedarian los
// grupos antes de tocar nada, y decir en voz alta lo que NO se pudo cumplir.
//
// Sobre las prioridades. La idea natural --"primero ciudad, luego edad, luego
// genero"-- esconde que los tres no quieren lo mismo. Ciudad y edad se quieren
// JUNTAR (los de Bogota con los de Bogota); genero se quiere REPARTIR, porque
// "juntar" generos deja una mesa de seis hombres. Por eso cada criterio lleva,
// ademas del orden, su modo.
//
// El orden se traduce a pesos 100 / 10 / 1: el primero manda y los de abajo
// solo desempatan. No es un optimo global --seria un problema de particion-- y
// no hace falta: con 15 personas y 3 mesas, un reparto codicioso en orden de
// bloque de ciudad da resultados que un humano firmaria, y cualquier cosa que
// no quede bien se arregla moviendo a mano.
//
// Lo de "no se pudo cumplir" no es un adorno. En la videollamada del 6 de
// octubre, 7 de las 15 personas eran las unicas de su ciudad: la prioridad de
// ciudad no las podia juntar con nadie. Eso hay que decirlo, no esconderlo.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';

// ── tipos ───────────────────────────────────────────────────────────────────

interface Persona {
  user_id: string;
  nombre: string;
  ciudad: string;
  genero: string;
  edad: number | null;
}
interface EventoRow {
  id: string;
  name: string | null;
  type: string;
  date: string | null;
  time: string | null;
  city: string | null;
  meet_link: string | null;
  dividido_at: string | null;
  dividido_de: string | null;
}
type Modo = 'juntar' | 'repartir';
interface Criterio { key: 'ciudad' | 'edad' | 'genero'; etiqueta: string; modo: Modo; activo: boolean; }
interface GrupoCreado { id: string; nombre: string; personas: number; }

const PESOS = [100, 10, 1];

const PATRONES: { id: string; etiqueta: string; arma: (base: string, i: number) => string }[] = [
  { id: 'mesa',  etiqueta: 'Mesa 1, Mesa 2…',   arma: (b, i) => `${b} - Mesa ${i + 1}` },
  { id: 'grupo', etiqueta: 'Grupo 1, Grupo 2…', arma: (b, i) => `${b} - Grupo ${i + 1}` },
  { id: 'num',   etiqueta: 'Solo el número',    arma: (b, i) => `${b} ${i + 1}` },
];

// ── reparto ─────────────────────────────────────────────────────────────────

/** 13 en 2 → [7,6]. Reparte el sobrante de a uno, empezando por el primero. */
export function tamanosDeGrupo(total: number, k: number): number[] {
  const base = Math.floor(total / k);
  const sobra = total % k;
  const out: number[] = [];
  for (let i = 0; i < k; i++) out.push(base + (i < sobra ? 1 : 0));
  return out;
}

function puntaje(p: Persona, grupo: Persona[], criterios: Criterio[]): number {
  let s = 0;
  criterios.forEach((cr, idx) => {
    if (!cr.activo) return;
    const W = PESOS[idx] ?? 1;
    if (cr.key === 'ciudad') {
      const mismos = grupo.filter((x) => x.ciudad === p.ciudad).length;
      const prop = grupo.length ? mismos / grupo.length : 0;
      // El escalon extra premia tener AL MENOS un paisano, no solo la proporcion.
      s += cr.modo === 'juntar' ? W * prop + (mismos > 0 ? W * 0.6 : 0) : W * (1 - prop);
    } else if (cr.key === 'edad') {
      if (!grupo.length) { s += W * 0.5; return; }
      const conEdad = grupo.filter((x) => typeof x.edad === 'number');
      if (!conEdad.length || typeof p.edad !== 'number') { s += W * 0.5; return; }
      const prom = conEdad.reduce((a, x) => a + (x.edad as number), 0) / conEdad.length;
      const cerca = Math.max(0, 1 - Math.abs(prom - p.edad) / 20);
      s += cr.modo === 'juntar' ? W * cerca : W * (1 - cerca);
    } else {
      const iguales = grupo.filter((x) => x.genero === p.genero).length;
      const share = grupo.length ? iguales / grupo.length : 0.5;
      s += cr.modo === 'repartir' ? W * (1 - share) : W * share;
    }
  });
  return s;
}

/**
 * Arma los grupos. `fijados` son las personas que el admin movio a mano: esas
 * mandan sobre el algoritmo y se sientan primero.
 */
export function armarGrupos(
  gente: Persona[], k: number, criterios: Criterio[], fijados: Record<string, number>,
): Persona[][] {
  const caps = tamanosDeGrupo(gente.length, k);
  const grupos: Persona[][] = Array.from({ length: k }, () => []);

  // Las ciudades numerosas primero, para que el bloque grande no quede picado.
  const porCiudad: Record<string, number> = {};
  gente.forEach((p) => { porCiudad[p.ciudad] = (porCiudad[p.ciudad] || 0) + 1; });
  const orden = gente.slice().sort((a, b) => {
    if (porCiudad[b.ciudad] !== porCiudad[a.ciudad]) return porCiudad[b.ciudad] - porCiudad[a.ciudad];
    if (a.ciudad !== b.ciudad) return a.ciudad < b.ciudad ? -1 : 1;
    return (a.edad ?? 999) - (b.edad ?? 999);
  });

  const sentados = new Set<string>();
  orden.forEach((p) => {
    const fijo = fijados[p.user_id];
    if (fijo !== undefined && fijo < k && grupos[fijo].length < caps[fijo]) {
      grupos[fijo].push(p); sentados.add(p.user_id);
    }
  });

  orden.forEach((p) => {
    if (sentados.has(p.user_id)) return;
    let mejor = -1; let mejorS = -Infinity;
    for (let i = 0; i < k; i++) {
      if (grupos[i].length >= caps[i]) continue;
      const s = puntaje(p, grupos[i], criterios);
      if (s > mejorS) { mejorS = s; mejor = i; }
    }
    if (mejor < 0) { for (let j = 0; j < k; j++) if (grupos[j].length < caps[j]) { mejor = j; break; } }
    if (mejor >= 0) grupos[mejor].push(p);
  });

  grupos.forEach((g) => g.sort((a, b) => (a.edad ?? 999) - (b.edad ?? 999)));
  return grupos;
}

// ── pantalla ────────────────────────────────────────────────────────────────

export default function DividirEventoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const angosto = width < 900;

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [evento, setEvento] = useState<EventoRow | null>(null);
  const [gente, setGente] = useState<Persona[]>([]);

  const [k, setK] = useState(2);
  const [patron, setPatron] = useState('mesa');
  const [fijados, setFijados] = useState<Record<string, number>>({});
  const [elegido, setElegido] = useState<string | null>(null);
  const [criterios, setCriterios] = useState<Criterio[]>([
    { key: 'ciudad', etiqueta: 'Ciudad', modo: 'juntar',   activo: true },
    { key: 'edad',   etiqueta: 'Edad',   modo: 'juntar',   activo: true },
    { key: 'genero', etiqueta: 'Género', modo: 'repartir', activo: true },
  ]);

  const [aplicando, setAplicando] = useState(false);
  const [creados, setCreados] = useState<GrupoCreado[] | null>(null);
  const [deshaciendo, setDeshaciendo] = useState(false);

  const cargar = useCallback(async () => {
    if (!id) return;
    setCargando(true); setError('');
    try {
      const { data: ev, error: e1 } = await supabase
        .from('events')
        .select('id, name, type, date, time, city, meet_link, dividido_at, dividido_de')
        .eq('id', id).single();
      if (e1) throw e1;
      setEvento(ev as EventoRow);

      const { data: citas, error: e2 } = await supabase
        .from('appointments')
        .select('user_id, status, users ( name, city, gender, age )')
        .eq('event_id', id)
        .neq('status', 'cancelada');
      if (e2) throw e2;

      const personas: Persona[] = (citas || []).map((c: any) => ({
        user_id: c.user_id,
        nombre: (c.users?.name || 'Sin nombre').trim(),
        ciudad: c.users?.city || 'Sin ciudad',
        genero: (c.users?.gender || '').toLowerCase(),
        edad: typeof c.users?.age === 'number' ? c.users.age : null,
      }));
      setGente(personas);
      setK((prev) => (personas.length >= 4 ? prev : 2));
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar el evento');
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => { cargar(); }, [cargar]);

  const base = useMemo(() => {
    if (!evento) return 'Evento';
    return (evento.name || `${evento.type} · ${evento.city || ''}`).trim();
  }, [evento]);

  const nombreDe = useCallback((i: number) => {
    const p = PATRONES.find((x) => x.id === patron) || PATRONES[0];
    return p.arma(base, i);
  }, [patron, base]);

  const grupos = useMemo(
    () => (gente.length ? armarGrupos(gente, k, criterios, fijados) : []),
    [gente, k, criterios, fijados],
  );

  // ── avisos ────────────────────────────────────────────────────────────────
  const avisos = useMemo(() => {
    const out: { tono: 'alerta' | 'malo' | 'bien'; texto: string }[] = [];
    if (!grupos.length) return out;

    const porCiudad: Record<string, number> = {};
    gente.forEach((p) => { porCiudad[p.ciudad] = (porCiudad[p.ciudad] || 0) + 1; });
    const solos = gente.filter((p) => porCiudad[p.ciudad] === 1);
    const ciudadJunta = criterios.some((c) => c.key === 'ciudad' && c.activo && c.modo === 'juntar');
    if (ciudadJunta && solos.length) {
      out.push({
        tono: 'alerta',
        texto: `${solos.length} ${solos.length === 1 ? 'persona es la única' : 'personas son las únicas'} de su ciudad (${solos.map((p) => `${p.nombre} · ${p.ciudad}`).join(', ')}). La prioridad de ciudad no ${solos.length === 1 ? 'la' : 'las'} puede juntar con nadie.`,
      });
    }

    const unGenero = grupos.filter((g) => g.length > 1 && g.every((p) => p.genero === g[0].genero));
    if (unGenero.length) {
      out.push({
        tono: 'malo',
        texto: `${unGenero.length} ${unGenero.length === 1 ? 'grupo quedó' : 'grupos quedaron'} de un solo género. Sube «Género» en las prioridades o mueve a alguien a mano.`,
      });
    }

    const sinEdad = gente.filter((p) => p.edad === null).length;
    if (sinEdad && criterios.some((c) => c.key === 'edad' && c.activo)) {
      out.push({ tono: 'alerta', texto: `${sinEdad} ${sinEdad === 1 ? 'persona no tiene' : 'personas no tienen'} edad en su perfil: para ellas la prioridad de edad no aplica.` });
    }

    if (!out.length) out.push({ tono: 'bien', texto: `Los ${k} grupos quedaron repartidos y sin advertencias.` });
    return out;
  }, [grupos, gente, criterios, k]);

  // ── acciones ──────────────────────────────────────────────────────────────

  const mover = (userId: string, destino: number) => {
    setFijados((f) => ({ ...f, [userId]: destino }));
    setElegido(null);
  };

  const tocarPersona = (p: Persona, gi: number) => {
    if (elegido && elegido !== p.user_id) {
      const origen = grupos.findIndex((g) => g.some((x) => x.user_id === elegido));
      if (origen !== gi) { mover(elegido, gi); return; }
    }
    setElegido((e) => (e === p.user_id ? null : p.user_id));
  };

  const tocarGrupo = (gi: number) => {
    if (!elegido) return;
    const origen = grupos.findIndex((g) => g.some((x) => x.user_id === elegido));
    if (origen !== gi) mover(elegido, gi); else setElegido(null);
  };

  const subir = (i: number) => {
    if (i < 1) return;
    setCriterios((c) => { const n = c.slice(); const t = n[i - 1]; n[i - 1] = n[i]; n[i] = t; return n; });
  };
  const bajar = (i: number) => {
    setCriterios((c) => {
      if (i >= c.length - 1) return c;
      const n = c.slice(); const t = n[i + 1]; n[i + 1] = n[i]; n[i] = t; return n;
    });
  };
  const cambiarModo = (i: number) => {
    setCriterios((c) => c.map((x, j) => (j === i ? { ...x, modo: x.modo === 'juntar' ? 'repartir' : 'juntar' } : x)));
  };
  const prender = (i: number) => {
    setCriterios((c) => c.map((x, j) => (j === i ? { ...x, activo: !x.activo } : x)));
  };

  const aplicar = async () => {
    if (!id || !grupos.length) return;
    const resumen = grupos.map((g, i) => `${nombreDe(i)}: ${g.length}`).join('\n');
    const ok = typeof window !== 'undefined' && window.confirm(
      `Se van a crear ${k} grupos:\n\n${resumen}\n\n` +
      `El evento original pasa a borrador como «BORRAR | ${base}». No se borra nada y se puede deshacer.\n\n¿Aplicar?`,
    );
    if (!ok) return;

    setAplicando(true); setError('');
    try {
      const payload = grupos.map((g, i) => ({ nombre: nombreDe(i), user_ids: g.map((p) => p.user_id) }));
      const { data, error: e } = await supabase.rpc('admin_dividir_evento', {
        p_event_id: id, p_grupos: payload,
      });
      if (e) throw e;
      setCreados(((data as any)?.creados || []) as GrupoCreado[]);
    } catch (e: any) {
      setError(e?.message || 'No se pudo dividir el evento');
    } finally {
      setAplicando(false);
    }
  };

  const deshacer = async () => {
    if (!id) return;
    const ok = typeof window !== 'undefined' && window.confirm(
      'Se devuelve a todos al evento original y se borran los grupos creados. ¿Seguro?',
    );
    if (!ok) return;
    setDeshaciendo(true); setError('');
    try {
      const { error: e } = await supabase.rpc('admin_deshacer_division', { p_event_id: id });
      if (e) throw e;
      setCreados(null); setFijados({}); setElegido(null);
      await cargar();
    } catch (e: any) {
      setError(e?.message || 'No se pudo deshacer');
    } finally {
      setDeshaciendo(false);
    }
  };

  // ── render ────────────────────────────────────────────────────────────────

  if (cargando) {
    return (
      <View style={st.centro}><ActivityIndicator size="large" color={nospiColors.purpleDark} /></View>
    );
  }

  const esVirtual = evento?.type === 'virtual';
  const yaDividido = !!evento?.dividido_at;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={st.pantalla} contentContainerStyle={st.contenido}>

        <TouchableOpacity onPress={() => router.back()} style={st.volver}>
          <Text style={st.volverTxt}>‹ Volver a Eventos</Text>
        </TouchableOpacity>

        <Text style={st.titulo}>{base}</Text>
        <Text style={st.sub}>
          {gente.length} inscritos
          {evento?.date ? ` · ${new Date(evento.date).toLocaleDateString('es-CO', { day: '2-digit', month: 'long' })}` : ''}
          {evento?.city ? ` · ${evento.city}` : ''}
        </Text>

        {!!error && <View style={[st.aviso, st.avisoMalo]}><Text style={st.avisoTxt}>{error}</Text></View>}

        {yaDividido && !creados && (
          <View style={[st.aviso, st.avisoAlerta]}>
            <Text style={st.avisoTxt}>Este evento ya está dividido. Si quieres rehacerlo, primero deshaz la división.</Text>
            <TouchableOpacity style={[st.btn, st.btnGris, { marginTop: 10 }]} onPress={deshacer} disabled={deshaciendo}>
              <Text style={st.btnTxtOscuro}>{deshaciendo ? 'Deshaciendo…' : '↩ Deshacer división'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── ya aplicado ── */}
        {creados && (
          <View style={{ gap: 10, marginTop: 14 }}>
            <View style={[st.aviso, st.avisoBien]}>
              <Text style={st.avisoTxt}>Listo. Se crearon {creados.length} grupos y el original quedó en borrador como «BORRAR | {base}».</Text>
            </View>
            {creados.map((g) => (
              <View key={g.id} style={st.tarjeta}>
                <Text style={st.gNombre}>{g.nombre}</Text>
                <Text style={st.gMeta}>{g.personas} personas · preguntas copiadas</Text>
                {esVirtual && (
                  <Text style={st.faltaLink}>⚠ Falta pegarle el link de Meet, desde Eventos → Configurar</Text>
                )}
              </View>
            ))}
            <View style={st.fila}>
              <TouchableOpacity style={[st.btn, st.btnGris]} onPress={deshacer} disabled={deshaciendo}>
                <Text style={st.btnTxtOscuro}>{deshaciendo ? 'Deshaciendo…' : '↩ Deshacer división'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.btn, st.btnPrincipal]} onPress={() => router.back()}>
                <Text style={st.btnTxt}>Ir a Eventos</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── el divisor ── */}
        {!creados && !yaDividido && gente.length >= 2 && (
          <View style={[st.cols, angosto && { flexDirection: 'column' }]}>

            <View style={[st.panelIzq, angosto && { width: '100%' }]}>
              <View style={st.caja}>
                <Text style={st.etiqueta}>¿En cuántos grupos?</Text>
                <View style={st.chips}>
                  {[2, 3, 4, 5, 6].filter((n) => n <= Math.floor(gente.length / 2)).map((n) => (
                    <TouchableOpacity
                      key={n}
                      style={[st.chip, k === n && st.chipOn]}
                      onPress={() => { setK(n); setFijados({}); setElegido(null); }}
                    >
                      <Text style={[st.chipTxt, k === n && st.chipTxtOn]}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={st.pista}>Quedan grupos de {tamanosDeGrupo(gente.length, k).join(', ')} personas.</Text>
              </View>

              <View style={st.caja}>
                <Text style={st.etiqueta}>Prioridades</Text>
                {criterios.map((cr, i) => (
                  <View key={cr.key} style={[st.pri, !cr.activo && { opacity: 0.45 }]}>
                    <View style={st.priNum}><Text style={st.priNumTxt}>{i + 1}</Text></View>
                    <Text style={st.priNombre}>{cr.etiqueta}</Text>
                    <TouchableOpacity
                      style={[st.mini, cr.modo === 'juntar' ? st.miniJuntar : st.miniRepartir]}
                      onPress={() => cambiarModo(i)}
                    >
                      <Text style={[st.miniTxt, { color: cr.modo === 'juntar' ? '#17633F' : nospiColors.purpleDark }]}>
                        {cr.modo === 'juntar' ? 'Juntar' : 'Repartir'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => subir(i)} disabled={i === 0} style={st.flecha}>
                      <Text style={[st.flechaTxt, i === 0 && { opacity: 0.25 }]}>▲</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => bajar(i)} disabled={i === criterios.length - 1} style={st.flecha}>
                      <Text style={[st.flechaTxt, i === criterios.length - 1 && { opacity: 0.25 }]}>▼</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={st.mini} onPress={() => prender(i)}>
                      <Text style={st.miniTxt}>{cr.activo ? 'On' : 'Off'}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <Text style={st.pista}>«Juntar» pone parecidos juntos. «Repartir» los mezcla parejo. La de arriba manda.</Text>
              </View>

              <View style={st.caja}>
                <Text style={st.etiqueta}>Nombres</Text>
                <View style={st.chips}>
                  {PATRONES.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[st.chip, patron === p.id && st.chipOn]}
                      onPress={() => setPatron(p.id)}
                    >
                      <Text style={[st.chipTxt, patron === p.id && st.chipTxtOn]}>{p.etiqueta}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={st.pista}>Quedarían: {nombreDe(0)} · {nombreDe(1)}…</Text>
              </View>

              <TouchableOpacity
                style={[st.btn, st.btnPrincipal, { marginTop: 4 }]}
                onPress={aplicar}
                disabled={aplicando}
              >
                <Text style={st.btnTxt}>{aplicando ? 'Aplicando…' : 'Aplicar división'}</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1, gap: 10, minWidth: 0 }}>
              {avisos.map((a, i) => (
                <View
                  key={i}
                  style={[st.aviso, a.tono === 'malo' ? st.avisoMalo : a.tono === 'bien' ? st.avisoBien : st.avisoAlerta]}
                >
                  <Text style={st.avisoTxt}>{a.texto}</Text>
                </View>
              ))}

              <View style={st.grilla}>
                {grupos.map((g, gi) => {
                  const hombres = g.filter((p) => p.genero === 'hombre').length;
                  const mujeres = g.length - hombres;
                  const ciudades: Record<string, number> = {};
                  g.forEach((p) => { ciudades[p.ciudad] = (ciudades[p.ciudad] || 0) + 1; });
                  const edades = g.map((p) => p.edad).filter((e): e is number => typeof e === 'number');
                  const destino = !!elegido && !g.some((x) => x.user_id === elegido);
                  return (
                    <TouchableOpacity
                      key={gi}
                      activeOpacity={1}
                      onPress={() => tocarGrupo(gi)}
                      style={[st.grupo, destino && st.grupoDestino, angosto && { width: '100%' }]}
                    >
                      <View style={st.gHead}>
                        <Text style={st.gNombre} numberOfLines={2}>{nombreDe(gi)}</Text>
                        <Text style={st.gMeta}>{g.length}</Text>
                      </View>
                      <Text style={st.gMeta}>
                        {Object.keys(ciudades).sort((a, b) => ciudades[b] - ciudades[a])
                          .map((c) => `${c} (${ciudades[c]})`).join(' · ')}
                      </Text>
                      <Text style={st.gMeta}>
                        {edades.length ? `${Math.min(...edades)}–${Math.max(...edades)} años · ` : ''}
                        {hombres}H {mujeres}M
                      </Text>
                      <View style={{ gap: 4, marginTop: 6 }}>
                        {g.map((p) => (
                          <TouchableOpacity
                            key={p.user_id}
                            style={[st.persona, elegido === p.user_id && st.personaSel]}
                            onPress={() => tocarPersona(p, gi)}
                          >
                            <Text style={st.pNombre} numberOfLines={1}>{p.nombre}</Text>
                            <Text style={st.pDato}>{p.ciudad}{typeof p.edad === 'number' ? ` · ${p.edad}` : ''}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {esVirtual && <Text style={st.faltaLink}>⚠ Falta el link de Meet</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={st.pista}>
                {elegido
                  ? `Moviendo a ${gente.find((p) => p.user_id === elegido)?.nombre || ''} — toca el grupo a donde la quieres.`
                  : 'Toca a una persona y luego otro grupo para moverla a mano.'}
              </Text>
            </View>
          </View>
        )}

        {!creados && !yaDividido && gente.length < 2 && (
          <View style={[st.aviso, st.avisoAlerta]}>
            <Text style={st.avisoTxt}>Este evento tiene {gente.length} inscritos. Hacen falta al menos 2 para dividirlo.</Text>
          </View>
        )}
      </ScrollView>
    </>
  );
}

// ── estilos ─────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  pantalla: { flex: 1, backgroundColor: '#F7F3F5' },
  contenido: { padding: 18, paddingBottom: 60, maxWidth: 1180, width: '100%', alignSelf: 'center' },
  volver: { alignSelf: 'flex-start', paddingVertical: 6 },
  volverTxt: { color: nospiColors.purpleDark, fontWeight: '700', fontSize: 13 },
  titulo: { fontSize: 23, fontWeight: '800', color: '#1D1317', marginTop: 4 },
  sub: { fontSize: 13, color: '#6B5A61', marginTop: 2, marginBottom: 12 },

  cols: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  panelIzq: { width: 290, gap: 11 },

  caja: { backgroundColor: '#FFF', borderRadius: 12, padding: 13, gap: 9, borderWidth: 1, borderColor: '#E3D7DD' },
  etiqueta: { fontSize: 11, fontWeight: '800', letterSpacing: 0.7, color: '#9A8A91', textTransform: 'uppercase' },
  pista: { fontSize: 11.5, color: '#9A8A91', lineHeight: 16 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: '#F1EAEE', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 11, borderWidth: 1.5, borderColor: 'transparent' },
  chipOn: { borderColor: nospiColors.purpleDark, backgroundColor: '#FBE7F0' },
  chipTxt: { fontSize: 13, fontWeight: '700', color: '#1D1317' },
  chipTxtOn: { color: nospiColors.purpleDark },

  pri: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F1EAEE', borderRadius: 9, padding: 7 },
  priNum: { width: 19, height: 19, borderRadius: 10, backgroundColor: nospiColors.purpleDark, alignItems: 'center', justifyContent: 'center' },
  priNumTxt: { color: '#FFF', fontSize: 10.5, fontWeight: '800' },
  priNombre: { flex: 1, fontSize: 13, fontWeight: '700', color: '#1D1317' },
  mini: { backgroundColor: '#FFF', borderRadius: 6, borderWidth: 1, borderColor: '#E3D7DD', paddingVertical: 3, paddingHorizontal: 7 },
  miniJuntar: { borderColor: '#17633F' },
  miniRepartir: { borderColor: nospiColors.purpleDark },
  miniTxt: { fontSize: 10.5, fontWeight: '700', color: '#1D1317' },
  flecha: { paddingHorizontal: 2 },
  flechaTxt: { fontSize: 12, color: '#6B5A61' },

  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  grupo: { backgroundColor: '#FFF', borderRadius: 12, padding: 11, borderWidth: 1, borderColor: '#E3D7DD', flexGrow: 1, flexBasis: 215, minWidth: 0 },
  grupoDestino: { borderColor: nospiColors.purpleDark, borderStyle: 'dashed', backgroundColor: '#FFF8FB' },
  gHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' },
  gNombre: { fontSize: 14, fontWeight: '800', color: '#1D1317', flex: 1 },
  gMeta: { fontSize: 11.5, color: '#6B5A61', lineHeight: 16 },

  persona: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#F1EAEE', borderRadius: 7, paddingVertical: 5, paddingHorizontal: 8, borderWidth: 1.5, borderColor: 'transparent' },
  personaSel: { borderColor: nospiColors.purpleDark, backgroundColor: '#FBE7F0' },
  pNombre: { fontSize: 12, fontWeight: '700', color: '#1D1317', flex: 1 },
  pDato: { fontSize: 11, color: '#6B5A61' },

  faltaLink: { fontSize: 11, color: '#8C3122', fontWeight: '700', marginTop: 7 },

  aviso: { borderRadius: 9, padding: 11, borderLeftWidth: 3 },
  avisoAlerta: { backgroundColor: '#FBEEDA', borderLeftColor: '#8A5200' },
  avisoMalo: { backgroundColor: '#F8E6E2', borderLeftColor: '#8C3122' },
  avisoBien: { backgroundColor: '#E1F0E8', borderLeftColor: '#17633F' },
  avisoTxt: { fontSize: 13, color: '#1D1317', lineHeight: 18 },

  tarjeta: { backgroundColor: '#FFF', borderRadius: 12, padding: 13, borderWidth: 1, borderColor: '#E3D7DD' },
  fila: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  btn: { borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', flexGrow: 1 },
  btnPrincipal: { backgroundColor: nospiColors.purpleDark },
  btnGris: { backgroundColor: '#F1EAEE' },
  btnTxt: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  btnTxtOscuro: { color: '#1D1317', fontWeight: '800', fontSize: 14 },
});
