-- Videollamada: el acceso se activa solo cuando el evento tiene link de Meet.
--
-- Antes el admin tenia que tocar "Revelar ubicacion" (que en virtual era
-- "activar acceso"). No tenia sentido: el boton de entrar ya aparece solo 15
-- minutos antes y es el que registra la asistencia. Lo unico que hacia falta
-- era que el link estuviera puesto, y eso ya lo sabe la base.
--
-- is_location_revealed sigue siendo la bandera que usan la app y los
-- recordatorios; aqui solo se calcula sola para type = 'virtual'. Al pasar a
-- true, el trigger trg_send_email_reminders_on_reveal (AFTER UPDATE) manda el
-- correo y el push de "tu videollamada ya esta lista", igual que antes lo
-- hacia el boton. En presencial no cambia nada.
create or replace function public.virtual_acceso_automatico()
returns trigger
language plpgsql
as $$
begin
  if NEW.type = 'virtual' then
    if NEW.meet_link is not null and btrim(NEW.meet_link) <> '' then
      NEW.is_location_revealed := true;
      NEW.location := 'Videollamada';
    else
      NEW.is_location_revealed := false;
    end if;
    NEW.require_gps_verification := false;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_virtual_acceso_automatico on public.events;
create trigger trg_virtual_acceso_automatico
  before insert or update on public.events
  for each row execute function public.virtual_acceso_automatico();
