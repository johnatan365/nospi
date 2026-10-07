-- Segundo renglon del nombre del evento. Opcional: sirve para decidir a mano
-- donde parte un nombre largo, en vez de dejar que se corte solo en cualquier
-- parte. En la tarjeta de la app el espacio siempre esta reservado, asi que
-- todas las tarjetas miden lo mismo tenga o no tenga texto.
alter table public.events add column if not exists subtitulo text;