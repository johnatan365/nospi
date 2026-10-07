-- Una frase que cada persona escribe sobre si misma.
--
-- Va corta a proposito (160 caracteres): la ficha tiene que seguir leyendose
-- de un vistazo, y un parrafo largo empuja los intereses fuera de la pantalla.
-- Es opcional, como la foto.
alter table public.users
  add column if not exists bio text;

alter table public.users
  drop constraint if exists users_bio_largo;

alter table public.users
  add constraint users_bio_largo check (bio is null or char_length(bio) <= 160);

comment on column public.users.bio is
  'Frase libre que la persona escribe en su perfil. Maximo 160 caracteres. Opcional.';