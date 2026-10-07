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