-- Resumen para pintar los checks sin traerse la lista entera de participantes.
--
-- En un grupo de 150 personas, preguntar "quien leyo" cada pocos segundos seria
-- traer 149 filas cada vez para dibujar dos palitos. Basta con el MINIMO: si la
-- persona que va mas atrasada leyo hasta las 8:03, entonces todo lo enviado
-- antes de las 8:03 lo leyeron todos. Igual con lo entregado.
--
-- El null es a proposito: si aunque sea uno nunca ha leido (o nunca ha abierto
-- la app), min() con nulls tiene que dar null, no la fecha de los demas. Por eso
-- se cuenta aparte cuantos tienen la marca y se anula si falta alguno.
create or replace function public.estado_conversacion_resumen(p_conversation_id uuid)
 returns table(
   leido_hasta timestamptz,
   entregado_hasta timestamptz,
   otros integer
 )
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_otros integer;
  v_con_lectura integer;
  v_con_entrega integer;
  v_min_lectura timestamptz;
  v_min_entrega timestamptz;
begin
  if not public.is_chat_participant(p_conversation_id) then
    raise exception 'no autorizado' using errcode = '42501';
  end if;

  select count(*),
         count(cp.last_read_at),
         count(cp.last_delivered_at),
         min(cp.last_read_at),
         min(cp.last_delivered_at)
    into v_otros, v_con_lectura, v_con_entrega, v_min_lectura, v_min_entrega
    from public.chat_participants cp
   where cp.conversation_id = p_conversation_id
     and cp.user_id <> auth.uid();

  return query select
    case when v_otros > 0 and v_con_lectura = v_otros then v_min_lectura else null end,
    case when v_otros > 0 and v_con_entrega = v_otros then v_min_entrega else null end,
    v_otros;
end;
$function$;

grant execute on function public.estado_conversacion_resumen(uuid) to authenticated;