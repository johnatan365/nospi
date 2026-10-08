alter table public.events
  add column if not exists aviso_consumo    text,
  add column if not exists aviso_consumo_en text;

comment on column public.events.aviso_consumo is
  'Condicion del lugar que la persona tiene que aceptar ANTES de reservar: consumo minimo, cover, lo que sea. Si tiene texto, en la pantalla del evento sale una casilla de confirmacion con este aviso y no se puede reservar sin marcarla. Vacio = no sale nada.';

comment on column public.events.aviso_consumo_en is
  'El mismo aviso en ingles. Hoy se escribe a mano: traducir-contenido todavia no cubre este campo. Si falta, la app muestra el de espanol antes que dejar el hueco.';
