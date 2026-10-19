-- Borrar un evento desde el admin fallaba con:
--
--   update or delete on table "events" violates foreign key constraint
--   "payment_attempts_event_id_fkey" on table "payment_attempts"
--
-- Causa: la llave foranea de payment_attempts.event_id no tenia regla de
-- borrado, asi que CUALQUIER intento de pago apuntando al evento lo dejaba
-- imposible de eliminar. Y el caso mas comun es el peor: un pago DECLINADO
-- de alguien que nunca se inscribio. Un evento vacio, sin un solo
-- participante, quedaba bloqueado por un pago que nunca se completo.
--
-- Paso el 18 de octubre con la videollamada del 27: cero inscritos, y un
-- intento declinado del 9 de octubre no dejaba borrarla.
--
-- ON DELETE SET NULL es la semantica correcta aqui: el pago es un hecho
-- historico que sobrevive al evento. Al borrar el evento, el registro del
-- pago se conserva entero -monto, fecha, estado, transaccion de Wompi- y
-- solo pierde el vinculo. No se borra plata de la historia.
--
-- Se mantiene a proposito el comportamiento por defecto en appointments y
-- event_participants: ahi NO queremos que un borrado deje filas huerfanas en
-- silencio. Una cita es una persona que reservo; si algo apunta a un evento
-- que se va a borrar, el admin tiene que enterarse.

ALTER TABLE public.payment_attempts
  DROP CONSTRAINT payment_attempts_event_id_fkey;

ALTER TABLE public.payment_attempts
  ADD CONSTRAINT payment_attempts_event_id_fkey
  FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;
