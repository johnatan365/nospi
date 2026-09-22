-- Panel de hombres dormidos.
--
-- Por que existe: la cuenta de Meta lleva meses comprando registros de hombres
-- y el desbalance de los eventos no cede. Al mirar el embudo real se ve que el
-- problema no es traer hombres sino que los hombres que YA estan registrados no
-- llegan nunca a la pasarela: mas de mil hombres se registraron y ninguno
-- reservo. De ellos casi todos dejaron telefono. Comprar un hombre nuevo en
-- Meta cuesta decenas de miles de pesos; escribirle a uno que ya se registro
-- cuesta cero. Este panel convierte ese inventario muerto en la primera fuente
-- de hombres, antes de subirle un peso a la pauta.
--
-- El orden de la lista no es arbitrario: sale de la tasa real de conversion por
-- edad medida sobre los registros desde julio de 2026. Los hombres de 50+
-- reservan 3 o 4 veces mas que los de 30-39, justo al reves de donde ha estado
-- el presupuesto.

CREATE OR REPLACE FUNCTION public.admin_hombres_dormidos(
  p_limit integer DEFAULT 300,
  p_dias_silencio integer DEFAULT 21
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hombres jsonb;
  v_eventos jsonb;
  v_kpis jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'no autorizado';
  END IF;

  WITH candidatos AS (
    SELECT
      u.id,
      u.name,
      u.phone,
      u.email,
      u.age,
      u.created_at,
      u.onboarding_completed,
      EXISTS (SELECT 1 FROM public.push_tokens t WHERE t.user_id = u.id) AS tiene_app,
      -- Intento fallido de pago = intencion demostrada. Es la senal mas fuerte
      -- que tenemos de un hombre que quiso venir y algo se le atraveso.
      EXISTS (
        SELECT 1 FROM public.payment_attempts p
        WHERE p.user_id = u.id AND p.status <> 'APPROVED'
      ) AS intento_fallido,
      inv.fecha_invitacion AS ultima_invitacion,
      inv.resultado AS ultimo_resultado
    FROM public.users u
    LEFT JOIN LATERAL (
      SELECT i.fecha_invitacion, i.resultado
      FROM public.invitaciones_cortesia i
      WHERE i.user_id = u.id
      ORDER BY i.fecha_invitacion DESC NULLS LAST, i.created_at DESC
      LIMIT 1
    ) inv ON true
    WHERE u.gender = 'hombre'
      AND COALESCE(u.is_internal, false) = false
      AND u.phone IS NOT NULL
      AND length(regexp_replace(u.phone, '\D', '', 'g')) >= 10
      -- Nunca ha pagado: es el inventario que ya compramos y no hemos usado.
      AND NOT EXISTS (
        SELECT 1 FROM public.payment_attempts p
        WHERE p.user_id = u.id AND p.status = 'APPROVED'
      )
      AND (u.reservas_suspendidas_hasta IS NULL OR u.reservas_suspendidas_hasta <= now())
      -- Respetar a quien ya dijo que no y a quien pidio que lo buscaran despues.
      AND NOT EXISTS (
        SELECT 1 FROM public.invitaciones_cortesia i
        WHERE i.user_id = u.id
          AND (
            i.no_invitar_mas = true
            OR (i.volver_a_intentar_despues_de IS NOT NULL AND i.volver_a_intentar_despues_de > current_date)
            OR (i.fecha_invitacion IS NOT NULL AND i.fecha_invitacion > current_date - p_dias_silencio)
          )
      )
  ), puntuados AS (
    SELECT
      c.*,
      -- Tasa de reserva observada por rango de edad (hombres registrados desde
      -- julio 2026). Se guarda explicita para que el panel pueda mostrar por que
      -- una persona esta arriba en la lista.
      CASE
        WHEN c.age IS NULL THEN 8.0
        WHEN c.age >= 60 THEN 27.8
        WHEN c.age >= 50 THEN 20.9
        WHEN c.age >= 45 THEN 13.0
        WHEN c.age >= 40 THEN 9.7
        WHEN c.age >= 35 THEN 8.8
        WHEN c.age >= 30 THEN 6.9
        WHEN c.age >= 25 THEN 6.4
        ELSE 2.9
      END AS tasa_edad
    FROM candidatos c
  )
  SELECT COALESCE(jsonb_agg(x ORDER BY x.prioridad DESC, x.created_at DESC), '[]'::jsonb)
  INTO v_hombres
  FROM (
    SELECT
      p.id AS user_id,
      p.name,
      p.phone,
      p.email,
      p.age,
      p.created_at,
      p.tiene_app,
      p.intento_fallido,
      p.onboarding_completed,
      p.ultima_invitacion,
      p.ultimo_resultado,
      p.tasa_edad,
      round((
        p.tasa_edad
        * CASE WHEN p.intento_fallido THEN 2.0 ELSE 1.0 END
        * CASE WHEN p.onboarding_completed THEN 1.3 ELSE 1.0 END
        * CASE WHEN p.tiene_app THEN 1.2 ELSE 1.0 END
        * CASE WHEN p.created_at > now() - interval '30 days' THEN 1.15 ELSE 1.0 END
      )::numeric, 1) AS prioridad
    FROM puntuados p
    ORDER BY prioridad DESC, p.created_at DESC
    LIMIT p_limit
  ) x;

  -- Eventos proximos con su brecha de genero, para que el mensaje se pueda
  -- dirigir al evento que de verdad necesita hombres.
  SELECT COALESCE(jsonb_agg(y ORDER BY y.fecha), '[]'::jsonb)
  INTO v_eventos
  FROM (
    SELECT
      e.id AS event_id,
      e.name,
      e.date AS fecha,
      e.type,
      e.max_participants,
      count(*) FILTER (WHERE u.gender = 'hombre') AS hombres,
      count(*) FILTER (WHERE u.gender = 'mujer') AS mujeres
    FROM public.events e
    LEFT JOIN public.appointments a ON a.event_id = e.id AND a.status = 'confirmada'
    LEFT JOIN public.users u ON u.id = a.user_id
    WHERE e.date >= current_date
      AND e.event_status = 'published'
    GROUP BY e.id, e.name, e.date, e.type, e.max_participants
  ) y;

  SELECT jsonb_build_object(
    'hombres_sin_reserva', (
      SELECT count(*) FROM public.users u
      WHERE u.gender = 'hombre' AND COALESCE(u.is_internal, false) = false
        AND NOT EXISTS (SELECT 1 FROM public.payment_attempts p WHERE p.user_id = u.id AND p.status = 'APPROVED')
    ),
    'contactables', jsonb_array_length(v_hombres),
    'ya_contactados_30d', (
      SELECT count(*) FROM public.invitaciones_cortesia i
      WHERE i.fecha_invitacion > current_date - 30
    ),
    'brecha_proximos_eventos', (
      SELECT COALESCE(sum(GREATEST(0, mujeres - hombres)), 0)
      FROM jsonb_to_recordset(v_eventos) AS t(hombres int, mujeres int)
    )
  ) INTO v_kpis;

  RETURN jsonb_build_object('kpis', v_kpis, 'hombres', v_hombres, 'eventos', v_eventos);
END;
$function$;

-- Memoria de a quien ya le escribimos. Reutiliza invitaciones_cortesia a
-- proposito: si un hombre ya dijo que no por aca, la skill de llenar cupos
-- tampoco lo debe volver a llamar, y al reves.
CREATE OR REPLACE FUNCTION public.admin_registrar_invitacion_hombre(
  p_user_id uuid,
  p_resultado text DEFAULT 'sin_respuesta',
  p_evento text DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_reintentar_despues date DEFAULT NULL,
  p_no_invitar_mas boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user public.users%ROWTYPE;
  v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'no autorizado';
  END IF;

  SELECT * INTO v_user FROM public.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'usuario no encontrado';
  END IF;

  INSERT INTO public.invitaciones_cortesia (
    user_id, telefono, nombre, fecha_invitacion, evento,
    resultado, no_invitar_mas, volver_a_intentar_despues_de, notas
  ) VALUES (
    p_user_id,
    COALESCE(v_user.phone, ''),
    v_user.name,
    current_date,
    p_evento,
    p_resultado,
    p_no_invitar_mas,
    p_reintentar_despues,
    p_notas
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_hombres_dormidos(integer, integer) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_registrar_invitacion_hombre(uuid, text, text, text, date, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_hombres_dormidos(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_registrar_invitacion_hombre(uuid, text, text, text, date, boolean) TO authenticated;
