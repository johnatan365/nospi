-- El grupo del evento se abria 30 minutos antes y se CERRABA justo a la hora
-- de inicio. Quien llegaba un minuto tarde se encontraba el chat con candado,
-- que es exactamente el peor momento: es cuando mas necesita al grupo.
--
-- Paso el 18 de octubre. Una persona que iba por primera vez perdio media hora
-- peleando con la contrasena, entro a las 8:03 a una videollamada de las 8:00,
-- y lo que vio fue el grupo bloqueado con "Entras cuando vengas a tu primer
-- evento". Ya estaba inscrita y ya habia pagado.
--
-- La ventana previa existe para algo concreto: que la gente se salude y se
-- ponga de acuerdo en quien va a moderar. Eso no se acaba cuando el reloj
-- marca la hora de inicio; si acaso ahi es cuando empieza.
--
-- Regla nueva para el grupo del evento:
--   antes de T-30min ............ cerrado
--   desde T-30min y DURANTE ..... abierto para todos los inscritos
--   cuando el evento termino .... solo para quienes asistieron
--
-- Lo que NO cambia: la regla de fondo de que pagar y no aparecer no da entrada
-- al chat. Solo se corre el momento en que esa restriccion empieza a aplicar,
-- del inicio del evento a su final.
--
-- "Termino" = event_status 'closed', o game_phase 'finished', o 4 horas
-- despues de la hora de inicio (red de seguridad por si el evento nunca se
-- cierra a mano ni se corre la dinamica).
--
-- Los chats privados (type 'direct') quedan igual que estaban.

CREATE OR REPLACE FUNCTION public.chat_evento_etapa(p_conversation_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_tipo text;
  v_event_id uuid;
  v_fecha timestamptz;
  v_status text;
  v_fase text;
  v_termino boolean;
begin
  select type, event_id into v_tipo, v_event_id
  from public.chat_conversations where id = p_conversation_id;

  if v_tipo is null then return 'cerrado'; end if;
  if v_event_id is null then return 'sin_restriccion'; end if;
  if v_tipo not in ('event_group', 'direct') then return 'sin_restriccion'; end if;

  select date, event_status, game_phase into v_fecha, v_status, v_fase
  from public.events where id = v_event_id;
  if v_fecha is null then return 'sin_restriccion'; end if;

  -- Los eventos anteriores al 19 de septiembre de 2026 siguen como estaban.
  if v_fecha < timestamptz '2026-09-19 00:00:00-05' then return 'sin_restriccion'; end if;
  if public.is_admin() then return 'sin_restriccion'; end if;

  -- Los chats privados que salieron de un evento no tienen ventana previa:
  -- o asististe, o no hay conversacion.
  if v_tipo = 'direct' then
    if now() < v_fecha then return 'cerrado'; end if;
    return 'solo_asistentes';
  end if;

  -- GRUPO DEL EVENTO
  if now() < v_fecha - interval '30 minutes' then return 'cerrado'; end if;

  v_termino := coalesce(v_status, '') = 'closed'
            or coalesce(v_fase, '') = 'finished'
            or now() >= v_fecha + interval '4 hours';

  if not v_termino then return 'sin_lista'; end if;
  return 'solo_asistentes';
end;
$function$;
