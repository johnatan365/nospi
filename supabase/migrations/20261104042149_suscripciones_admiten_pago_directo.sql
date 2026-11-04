-- subscriptions.payment_method solo admitia card, pse, google_pay y apple_pay.
-- Pero hay gente que paga por fuera de la app -- Nequi, transferencia -- cuando
-- el pago en linea le falla, y a esa suscripcion habia que registrarla con un
-- metodo falso (normalmente 'pse') para que la restriccion la dejara pasar.
-- Eso ensucia el reporte de ingresos por metodo.
--
-- Se agregan 'nequi' y 'directo'. Es la misma idea del boton "Pago directo" que
-- ya existe en el admin para los eventos.
--
-- Ojo: una suscripcion pagada por fuera NO puede renovarse sola, porque no hay
-- payment_source guardado en Wompi. Va siempre con auto_renew en false, y el
-- ingreso hay que registrarlo a mano en subscription_charges, que es de donde
-- lee el reporte del admin.

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_payment_method_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_payment_method_check
  CHECK (payment_method = ANY (ARRAY[
    'google_pay'::text, 'apple_pay'::text, 'card'::text, 'pse'::text,
    'nequi'::text, 'directo'::text
  ]));
