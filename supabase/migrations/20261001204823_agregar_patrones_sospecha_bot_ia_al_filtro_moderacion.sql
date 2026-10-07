create or replace function public.detectar_mensaje_retenible(t text)
returns text
language plpgsql
immutable
as $fn$
declare
  n text := public.nospi_normalizar(t);
  patron text;
  patrones text[] := array[
    -- Calidad / organizacion
    'mala organizacion', 'mal organizad', 'desorganizad', 'poca organizacion',
    'sin organizacion', 'falta de organizacion',
    '\mpesim[oa]', '\mhorrible', '\mterrible', '\mnefast[oa]', 'un desastre',
    '\mdesastre', 'muy mal\M', '\mque mal\M', '\mmal servicio', 'pesimo servicio',
    'mala experiencia', 'mal rato', '\mmediocre',
    -- Decepcion / expectativas
    'decepcion', 'decepcionad', 'decepcionante', 'esperaba mas', 'esperaba otra cosa',
    'no era lo que esperaba', 'no es lo que esperaba', 'no cumplio', 'no cumplieron',
    'no valio la pena', 'no vale la pena', 'perdida de tiempo', 'perdi mi tiempo',
    'perdimos el tiempo', '\mno me gusto', 'no nos gusto', '\maburrid[oa]',
    -- Plata / reclamo formal
    '\mreclamo', '\mqueja', '\mquejar', 'devolucion', 'devuelvan', 'me devuelven',
    'reembolso', 'quiero mi dinero', 'no deberian cobrar', 'no vale lo que cuesta',
    'muy caro', 'esta caro', '\mestafa', '\mestafad', '\mrobo\M', '\mladrones',
    '\mfraude', '\mengan[oa]\M', '\menganan\M',
    -- Sugerencias y criticas constructivas
    '\msugerencia', '\msugier[oe]', '\msugeriria', '\mdeberian', '\mdeberia\M',
    'tendrian que', 'tienen que mejorar', 'podrian mejorar', 'hay que mejorar',
    'para mejorar', '\mmejorar\M', '\mcritica', '\mrecomendaria', 'mi recomendacion',
    'seria bueno que', 'estaria bueno que', 'les falta', 'le falta', '\mfalto\M',
    'hace falta', 'no tuvieron en cuenta', 'no tienen en cuenta',
    -- Operativo del dia del evento
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
    -- Composicion del grupo
    'solo (hay |habia |habian |eramos )?(mujeres|hombres)',
    'pur[oa]s (mujeres|hombres)', 'puro hombre', 'pura mujer',
    'no habia (hombres|mujeres)', 'no hay (hombres|mujeres)',
    'faltaron (hombres|mujeres)', 'mas (mujeres|hombres) que',
    'desbalance', 'desequilibrad', 'mal repartid', 'mal distribuid',
    'la(s)? edad(es)?', 'diferencia de edad', 'muy mayor', 'muy joven',
    'no tuvieron en cuenta la edad', 'rango de edad',
    -- Abandono
    'no vuelvo', 'no voy a volver', 'no regreso', 'ultima vez que',
    '\mme retiro', '\mme salgo', 'cancelar mi suscripcion', 'cancelo mi suscripcion',
    'eliminar mi cuenta', 'borrar mi cuenta', 'darme de baja',
    'no lo recomiendo', 'no se los recomiendo', 'no recomiendo',
    -- Ofensas
    '\mmentira', '\mmentiros', '\mbasura', '\mporqueria', '\masco\M', '\masqueros',
    '\mestupid', '\midiota', '\mimbecil', '\mgonorrea', '\mmalparid', '\mhpta\M',
    '\mhijueput', '\mmarica\M', '\mverga\M', '\mmierda',
    -- Sospecha de bot / IA (quien escribe en el chat no es una persona real)
    '\mbot\M', '\mbots\M', '\mchatbot', '\mrobot',
    'inteligencia artificial', '\martificial',
    '\mia\M', '\mchat ?gpt', '\mgpt\M', '\mclaude\M', '\mgemini\M',
    'respuesta automatica', 'respuestas automaticas',
    'mensaje automatico', 'mensajes automaticos', '\mautomatizad',
    'no es (una )?persona', 'no eres (una )?persona', 'no sos (una )?persona',
    'es una maquina', 'parece una maquina', 'habla como una maquina',
    'copi(o|a|e|aste|ado) y peg(o|a|ue|aste|ado)', 'copy paste', '\mcopypaste',
    'se lo escribieron', 'le escribieron el mensaje', 'te lo escribieron',
    'no lo escribio', 'no lo escribiste', 'le dictaron'
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
$fn$;