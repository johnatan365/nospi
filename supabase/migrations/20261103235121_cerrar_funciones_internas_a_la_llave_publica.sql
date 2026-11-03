-- Funciones SECURITY DEFINER que cualquiera podia ejecutar con la llave
-- publica, sin chequeo de admin ni de usuario. Se revisaron una por una:
-- quien las llama, si estan en alguna politica y si la app las usa.

-- Devuelve true cuando la llamada NO viene de un usuario de la app (cron,
-- trigger, service_role) o cuando quien llama es admin.
create or replace function public.es_servidor_o_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.role(), '') not in ('anon', 'authenticated') or public.is_admin();
$$;
revoke all on function public.es_servidor_o_admin() from public, anon, authenticated;

-- 1) Solo las usan crons, triggers, otras funciones SECURITY DEFINER (que corren
--    como dueno) o Edge Functions con service_role. La app no las llama.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        '_ensure_direct_conversation',      -- open_direct_conversation, trg_event_affinity_match
        'admin_add_user_to_event',          -- Edge Function admin-add-user-to-event (service_role)
        'admin_sacar_del_evento',           -- envoltura vieja; el panel usa admin_sacar_del_evento_modo
        'asistio_al_evento',                -- funciones del chat
        'auto_close_past_events',           -- cron
        'auto_expire_past_subscriptions',   -- cron
        'create_recurring_drafts_for_event',-- auto_close_past_events
        'enviar_aviso_comunidad_post_evento',-- cron
        'get_expired_chat_media',           -- Edge Function cleanup-expired-chat-media
        'mark_chat_media_expired',          -- Edge Function cleanup-expired-chat-media
        'limpia_fotos_vacias',              -- nadie la llama
        'meter_en_comunidad',               -- triggers de comunidad
        'recalcular_current_participants'   -- trigger de appointments
      ])
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.f);
    execute format('grant execute on function %s to service_role', r.f);
  end loop;
end $$;

-- 2) Las llama el panel admin (con sesion de admin) y no tenian chequeo.
--    Son lecturas de estadisticas de preguntas, sin datos personales: se
--    cierran a quien no inicio sesion.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        'admin_get_event_dynamic_detail', 'admin_get_events_with_dynamic',
        'admin_get_question_by_event', 'admin_get_question_ranking'
      ])
  loop
    execute format('revoke execute on function %s from public, anon', r.f);
    execute format('grant execute on function %s to authenticated, service_role', r.f);
  end loop;
end $$;

-- 3) Chequeo dentro de la funcion, insertado al inicio del cuerpo a partir de
--    la definicion actual (no se reescribe nada mas).
do $$
declare
  v_def text;
  v_nueva text;
begin
  -- flag_event_no_shows: la llaman el panel admin y auto_close_past_events.
  -- Antes cualquiera podia marcar "no llego" a toda una mesa.
  select pg_get_functiondef('public.flag_event_no_shows(uuid)'::regprocedure) into v_def;
  v_nueva := regexp_replace(v_def, '\nBEGIN\n',
    E'\nBEGIN\n  IF NOT public.es_servidor_o_admin() THEN\n    RAISE EXCEPTION ''not authorized'' USING ERRCODE = ''42501'';\n  END IF;\n\n');
  if v_nueva = v_def then raise exception 'flag_event_no_shows no cambio'; end if;
  execute v_nueva;

  -- redeem_promo_code: la app la llama con el id del propio usuario. Antes se
  -- podia gastar un codigo a nombre de otra persona.
  select pg_get_functiondef('public.redeem_promo_code(text, uuid, uuid)'::regprocedure) into v_def;
  v_nueva := regexp_replace(v_def, '\nbegin\n',
    E'\nbegin\n  if p_user_id is distinct from auth.uid() and not public.es_servidor_o_admin() then\n    return jsonb_build_object(''success'', false, ''error'', ''not_found'');\n  end if;\n\n');
  if v_nueva = v_def then raise exception 'redeem_promo_code no cambio'; end if;
  execute v_nueva;
end $$;
