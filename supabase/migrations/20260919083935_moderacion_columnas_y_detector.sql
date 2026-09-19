-- Moderacion de mensajes de grupo: retencion automatica, borrado y edicion.

alter table public.chat_messages
  add column if not exists retenido_at     timestamptz,
  add column if not exists retenido_motivo text,
  add column if not exists aprobado_at     timestamptz,
  add column if not exists aprobado_por    uuid references public.users(id),
  add column if not exists deleted_at      timestamptz,
  add column if not exists deleted_by      uuid references public.users(id),
  add column if not exists edited_at       timestamptz,
  add column if not exists contenido_original text;

comment on column public.chat_messages.retenido_at is
  'Si no es null, el mensaje esta retenido esperando aprobacion del admin: solo lo ve su autor.';
comment on column public.chat_messages.contenido_original is
  'Texto con el que se envio el mensaje antes de la primera edicion. Sirve para ver que cambio.';

create index if not exists chat_messages_retenidos_idx
  on public.chat_messages (retenido_at)
  where retenido_at is not null and aprobado_at is null and deleted_at is null;

-- Quita tildes y pasa a minusculas, para que "pésimo" y "PESIMO" den igual.
create or replace function public.nospi_normalizar(t text)
returns text
language sql
immutable
as $$
  select translate(lower(coalesce(t, '')),
                   'áàäâãéèëêíìïîóòöôõúùüûñç',
                   'aaaaaeeeeiiiiooooouuuunc');
$$;

-- Devuelve la frase que hizo saltar la alarma, o null si el mensaje pasa.
--
-- Son expresiones regulares sobre el texto ya normalizado. Las palabras
-- sueltas van con \m..\M (bordes de palabra) para que "falta" no se dispare
-- dentro de "faltaba" cuando no toca, y para que "mal" no salte dentro de
-- "mall" ni de "Malambo".
create or replace function public.detectar_mensaje_retenible(t text)
returns text
language plpgsql
immutable
as $$
declare
  n text := public.nospi_normalizar(t);
  patron text;
  patrones text[] := array[
    'mala organizacion', 'mal organizad', 'desorganizad', 'poca organizacion',
    'sin organizacion', 'falta de organizacion',
    '\mpesim[oa]', '\mhorrible', '\mterrible', '\mnefast[oa]', 'un desastre',
    '\mdesastre', 'muy mal\M', '\mque mal\M', '\mmal servicio', 'pesimo servicio',
    'mala experiencia', 'mal rato', '\mmediocre',
    'decepcion', 'decepcionad', 'decepcionante', 'esperaba mas', 'esperaba otra cosa',
    'no era lo que esperaba', 'no es lo que esperaba', 'no cumplio', 'no cumplieron',
    'no valio la pena', 'no vale la pena', 'perdida de tiempo', 'perdi mi tiempo',
    'perdimos el tiempo', '\mno me gusto', 'no nos gusto', '\maburrid[oa]',
    '\mreclamo', '\mqueja', '\mquejar', 'devolucion', 'devuelvan', 'me devuelven',
    'reembolso', 'quiero mi dinero', 'no deberian cobrar', 'no vale lo que cuesta',
    'muy caro', 'esta caro', '\mestafa', '\mestafad', '\mrobo\M', '\mladrones',
    '\mfraude', '\mengan[oa]\M', '\menganan\M',
    '\msugerencia', '\msugier[oe]', '\msugeriria', '\mdeberian', '\mdeberia\M',
    'tendrian que', 'tienen que mejorar', 'podrian mejorar', 'hay que mejorar',
    'para mejorar', '\mmejorar\M', '\mcritica', '\mrecomendaria', 'mi recomendacion',
    'seria bueno que', 'estaria bueno que', 'les falta', 'le falta', '\mfalto\M',
    'hace falta', 'no tuvieron en cuenta', 'no tienen en cuenta',
    'no hemos podido iniciar', 'no podemos iniciar', 'no ha empezado', 'no empieza',
    'llevamos \d+ (min|minutos|hora|horas)', 'llevo \d+ (min|minutos|hora|horas)',
    'llevamos esperando', 'llevo esperando', 'estamos esperando', 'seguimos esperando',
    'no ha llegado nadie', 'no llego nadie', 'nadie ha llegado', 'no hay nadie',
    'estoy sol[oa]\M', 'estamos sol[oa]s', 'nadie responde', 'nadie contesta',
    'sin respuesta', 'no responden', 'no contestan',
    'no puedo ingresar', 'no me deja ingresar', 'no puedo entrar', 'no me deja entrar',
    'no puedo acceder', 'no funciona la app', 'no abre la app', 'la app no',
    'no me carga', 'no me funciona', 'no sirve la app', '\mno sirve\M',
    'deberia haber alguien', 'alguien presente', 'nadie de la organizacion',
    'solo (hay |habia |habian |eramos )?(mujeres|hombres)',
    'pur[oa]s (mujeres|hombres)', 'puro hombre', 'pura mujer',
    'no habia (hombres|mujeres)', 'no hay (hombres|mujeres)',
    'faltaron (hombres|mujeres)', 'mas (mujeres|hombres) que',
    'desbalance', 'desequilibrad', 'mal repartid', 'mal distribuid',
    'la(s)? edad(es)?', 'diferencia de edad', 'muy mayor', 'muy joven',
    'no tuvieron en cuenta la edad', 'rango de edad',
    'no vuelvo', 'no voy a volver', 'no regreso', 'ultima vez que',
    '\mme retiro', '\mme salgo', 'cancelar mi suscripcion', 'cancelo mi suscripcion',
    'eliminar mi cuenta', 'borrar mi cuenta', 'darme de baja',
    'no lo recomiendo', 'no se los recomiendo', 'no recomiendo',
    '\mmentira', '\mmentiros', '\mbasura', '\mporqueria', '\masco\M', '\masqueros',
    '\mestupid', '\midiota', '\mimbecil', '\mgonorrea', '\mmalparid', '\mhpta\M',
    '\mhijueput', '\mmarica\M', '\mverga\M', '\mmierda'
  ];
begin
  if n is null or btrim(n) = '' then
    return null;
  end if;
  foreach patron in array patrones loop
    if n ~ patron then
      return patron;
    end if;
  end loop;
  return null;
end;
$$;
