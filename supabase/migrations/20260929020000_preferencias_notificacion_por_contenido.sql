-- Preferencias de notificacion POR CONTENIDO, no por canal.
--
-- Lo que habia: {whatsapp, email, sms, push}. De esas cuatro, solo `push` la
-- leia alguien (send-push). Las otras tres no las consultaba ninguna funcion de
-- envio, asi que la gente elegia y le llegaba igual el WhatsApp y el correo.
--
-- Lo nuevo:
--   privados     bool                             mensajes directos
--   mesa         'todos'|'menciones'|'ninguno'    el grupo de su evento
--   comunidad    'todos'|'menciones'|'ninguno'    Comunidad Nospi (105 mensajes,
--                                                 la conversacion mas activa)
--   novedades    bool                             canal global + envios marcados
--   promociones  bool                             envios marcados como promo
--
-- Los avisos de SU RESERVA (empieza hoy, ubicacion revelada, chat abierto,
-- arranco la dinamica, pago confirmado) y los del canal "Avisos · <evento>" NO
-- tienen interruptor: son el servicio que contrataron, y perderselos significa
-- un no-show que ademas le daña la mesa a los demas.
--
-- MIGRACION de los 3.354 usuarios que habia:
--   push = false  (339 personas) -> los cinco interruptores APAGADOS. Dijeron
--                                   que no querian notificaciones y se respeta.
--                                   Solo les llegan los avisos de su reserva.
--   resto  (3.015)               -> todo encendido y los chats en 'todos', que
--                                   es exactamente lo que reciben hoy: nadie
--                                   nota un cambio.
update public.users
set notification_preferences = case
  when (notification_preferences->>'push')::boolean is false then
    jsonb_build_object(
      'privados', false, 'mesa', 'ninguno', 'comunidad', 'ninguno',
      'novedades', false, 'promociones', false)
  else
    jsonb_build_object(
      'privados', true, 'mesa', 'todos', 'comunidad', 'todos',
      'novedades', true, 'promociones', true)
end
where notification_preferences is null
   or not (notification_preferences ? 'privados');

comment on column public.users.notification_preferences is
  'Preferencias por CONTENIDO: privados (bool), mesa y comunidad (todos|menciones|ninguno), novedades (bool), promociones (bool). Los avisos de la propia reserva no tienen interruptor. Antes eran por canal (whatsapp/email/sms/push) y solo push hacia algo.';
