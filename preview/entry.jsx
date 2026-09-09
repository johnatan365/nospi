import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AgeRangeScreen from '../app/onboarding/age-range';
import AgeFallbackScreen from '../app/onboarding/age-fallback';
import LocationScreen from '../app/onboarding/location';
import { agePreferenceFields } from '../utils/agePreferences';
import { RouteContext } from './router';

function Preview() {
  const [path, setPath] = useState('/start');
  const [age, setAge] = useState(45);
  const [saved, setSaved] = useState(null);
  const [message, setMessage] = useState('');
  const [event, setEvent] = useState('Cena del viernes');
  const router = useMemo(() => ({ push: setPath, replace: setPath }), []);
  async function start() {
    await AsyncStorage.multiRemove(['onboarding_age_range', 'onboarding_age_fallback', 'onboarding_age_confirmed_at']);
    await AsyncStorage.setItem('onboarding_age', String(age));
    setSaved(null); setMessage(''); setPath('/onboarding/age-range');
  }
  async function saveFixture() {
    try {
      const range = JSON.parse((await AsyncStorage.getItem('onboarding_age_range')) || 'null');
      const fields = agePreferenceFields(await AsyncStorage.getItem('onboarding_age_fallback'), await AsyncStorage.getItem('onboarding_age_confirmed_at'));
      const response = await fetch('/api/fixture', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ age, age_range_min: range.min, age_range_max: range.max, ...fields }) });
      if (!response.ok) throw new Error('No se pudo guardar la prueba');
      setSaved(await response.json()); setPath('/catalog');
    } catch (error) { setMessage(String(error)); }
  }
  return <>
    <header><strong>Nospi · Pruebas locales</strong><label>Edad ficticia<input aria-label="Edad ficticia" type="number" min="18" max="90" value={age} onChange={e => setAge(Number(e.target.value))} /></label><button onClick={start} disabled={!Number.isInteger(age) || age < 18 || age > 90}>Iniciar prueba</button></header>
    <aside>Las pantallas de rango, decisión y ubicación son las de la app. El registro final, catálogo y pago de esta prueba son simulados. Solo se conecta a PostgreSQL local; no usa Supabase, Wompi, analítica ni mensajes de producción.</aside>
    <main><RouteContext.Provider value={router}>
      {path === '/onboarding/age-range' ? <AgeRangeScreen />
        : path === '/onboarding/age-fallback' ? <AgeFallbackScreen />
        : path === '/onboarding/location' ? <LocationScreen />
        : <div className="fixture">
          {path === '/start' && <><h1>Prueba tus preferencias</h1><p>Elige arriba una edad ficticia e inicia el recorrido.</p><button onClick={start}>Comenzar</button></>}
          {path === '/onboarding/compatibility' && <><h2>Continuación del registro</h2><p>Los demás pasos no cambian. Este botón prueba el guardado de un perfil ficticio en PostgreSQL local, sin crear una cuenta real.</p><button onClick={saveFixture}>Completar registro de prueba</button></>}
          {path === '/catalog' && <><h2>Eventos disponibles</h2>{['Cena del viernes', 'Café del sábado', 'Bolos del domingo'].map(name => <button key={name} onClick={() => { setEvent(name); setPath('/event'); }}>{name} →</button>)}</>}
          {path === '/event' && <><h2>{event}</h2><p>Medellín · Encuentro de ejemplo</p><p>Los consumos se pagan aparte.</p><button onClick={() => setPath('/payment')}>Confirmar asistencia</button><button onClick={() => setPath('/catalog')}>Volver a eventos</button></>}
          {path === '/payment' && <><h2>Pago de prueba</h2><p>{event} · $15.000 COP</p><button onClick={() => setPath('/paid')}>Simular pago</button></>}
          {path === '/paid' && <><h2>Compra simulada</h2><p>No se realizó ningún cobro ni reserva real.</p><button onClick={() => setPath('/catalog')}>Volver a eventos</button></>}
          {!!message && <p role="alert">{message}</p>}
        </div>}
    </RouteContext.Provider></main>
    {saved && <aside><details><summary>Ver datos guardados en PostgreSQL local</summary><pre>{JSON.stringify(saved, null, 2)}</pre></details></aside>}
  </>;
}
createRoot(document.getElementById('root')).render(<Preview />);
