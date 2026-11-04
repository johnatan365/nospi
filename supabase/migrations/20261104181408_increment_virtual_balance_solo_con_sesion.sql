-- increment_virtual_balance(usuario, monto) suma saldo a cualquier cuenta y
-- estaba abierta a la llave publica: sin iniciar sesion se podia regalar saldo.
-- La app solo la llama con sesion (al cancelar una cita con reembolso), asi que
-- cerrarla a anon no cambia nada para nadie. La version con sesion se reemplaza
-- despues por cancelar_mi_cita(), que calcula el reembolso en el servidor.
revoke execute on function public.increment_virtual_balance(uuid, numeric) from public, anon;
grant execute on function public.increment_virtual_balance(uuid, numeric) to authenticated, service_role;
