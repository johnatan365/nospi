-- Esconder la ciudad de un evento, sin cambiar a quien le aparece.
--
-- Los eventos de todo el pais traen la palabra "Todo el pais" metida dentro de
-- la columna `city`, que es un apaño: esa columna deberia tener una ciudad.
-- Con esto el admin puede dejar la ciudad real guardada y simplemente no
-- mostrarla, en vez de reemplazarla por una etiqueta.
--
-- OJO: esto es SOLO cosmetico. Quien ve el evento lo sigue decidiendo
-- `nacional` + `cities` (ver eventoSeVeEn en constants/Ciudades.ts). Ocultar la
-- ciudad no se lo oculta a nadie ni se lo muestra a nadie nuevo.
alter table public.events
  add column if not exists ocultar_ciudad boolean not null default false;

comment on column public.events.ocultar_ciudad is
  'true = no mostrar la ciudad del evento en la app (ni en la tarjeta de la lista ni en el detalle). Solo cosmetico: no cambia a quien le aparece el evento, eso lo deciden nacional y cities.';
