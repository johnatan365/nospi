-- Traducir al ingles la frase que cada persona escribe sobre si misma.
--
-- Es la ultima pieza de contenido que quedaba sin traducir y que SI la ve
-- alguien mas: el nombre y la descripcion de los eventos, las preguntas de la
-- dinamica y los mensajes de canales y comunidad ya pasan por
-- traducir-contenido. La bio se veia siempre en español, aunque la app
-- estuviera en ingles.
--
-- Lo que NO se traduce: la bio en la pantalla de perfil de uno mismo. Ahi se
-- muestra lo que la persona escribio, tal cual, porque es el texto que esta
-- editando. Traducirselo seria cambiarle lo que acaba de escribir.

alter table public.users
  add column if not exists bio_en text;

comment on column public.users.bio_en is
  'La bio traducida al ingles por traducir-contenido. Se muestra en la ficha que ven los demas cuando tienen la app en ingles; el perfil propio siempre muestra bio.';

-- ── el disparador ───────────────────────────────────────────────────────────
--
-- Mismo patron que pedir_traduccion_evento y pedir_traduccion_encuesta: se pide
-- al guardar y la funcion decide si el interruptor esta prendido. Solo cuando
-- la bio CAMBIO, para no gastar una llamada cada vez que alguien toca cualquier
-- otro campo del perfil.

create or replace function public.pedir_traduccion_bio()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'net'
as $function$
begin
  if TG_OP = 'UPDATE' and NEW.bio is not distinct from OLD.bio then
    return NEW;
  end if;
  -- Si la borro, se borra tambien la traduccion: dejarla seria mostrarle a
  -- quien tenga la app en ingles una frase que su autor ya quito.
  if coalesce(btrim(NEW.bio), '') = '' then
    NEW.bio_en := null;
    return NEW;
  end if;

  perform net.http_post(
    url := 'https://wjdiraurfbawotlcndmk.supabase.co/functions/v1/traducir-contenido',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-token', '7bb46a6e95dfdc543cab8eaf1e072e81ec9cbb7e11e7ac6d'
    ),
    body := jsonb_build_object('tipo', 'bio', 'id', NEW.id)
  );
  return NEW;
end;
$function$;

-- BEFORE y no AFTER porque el caso de la bio vacia modifica NEW (pone bio_en en
-- null) y asi se resuelve sin un segundo UPDATE que volveria a entrar aqui.
drop trigger if exists trg_traducir_bio on public.users;
create trigger trg_traducir_bio
  before insert or update of bio on public.users
  for each row execute function public.pedir_traduccion_bio();

-- ── la ficha publica devuelve la traduccion ────────────────────────────────
--
-- Hay que DROP antes de crear: añadir una columna cambia el tipo de retorno y
-- create or replace no lo permite. Va dentro de la transaccion de la migracion,
-- asi que no hay un momento en que la funcion no exista.

drop function if exists public.get_perfil_publico(uuid);

create function public.get_perfil_publico(p_user_id uuid)
returns table(user_id uuid, name text, bio text, bio_en text, city text, gender text,
              edad integer, interests jsonb, personality_traits jsonb, fotos jsonb)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_yo uuid := auth.uid();
begin
  if v_yo is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_user_id <> v_yo and not public.is_admin() and not exists (
    select 1
    from public.chat_participants a
    join public.chat_participants b on b.conversation_id = a.conversation_id
    where a.user_id = v_yo and b.user_id = p_user_id
  ) and not exists (
    select 1
    from public.appointments a
    join public.appointments b on b.event_id = a.event_id
    where a.user_id = v_yo and b.user_id = p_user_id
      and coalesce(a.status,'') <> 'cancelada'
      and coalesce(b.status,'') <> 'cancelada'
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select u.id, u.name, u.bio, u.bio_en, u.city, u.gender,
         case when u.birthdate is null then null
              else date_part('year', age(u.birthdate))::integer end,
         u.interests,
         u.personality_traits,
         coalesce(
           (select jsonb_agg(p.url order by p.orden)
              from public.user_photos p where p.user_id = u.id),
           case when u.profile_photo_url is null then '[]'::jsonb
                else jsonb_build_array(u.profile_photo_url) end
         )
  from public.users u
  where u.id = p_user_id;
end;
$function$;

-- ── el interruptor ─────────────────────────────────────────────────────────
--
-- Arranca PRENDIDO, al reves que la comunidad: hoy son 5 bios y 590 caracteres
-- en total, asi que no hay un saldo que cuidar. Se apaga desde el admin si
-- algun dia crece.

insert into public.app_config (key, value)
values ('traducir_bios', 'true')
on conflict (key) do nothing;
