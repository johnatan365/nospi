# Quién puede entrar a cada chat

Nota para el próximo chat que toque mensajería. Aplicado en Supabase
(`wjdiraurfbawotlcndmk`) el 7 de septiembre de 2026.

## La regla

**El acceso a cualquier chat se decide por una sola cosa: tener fila en `chat_participants`.**
Las políticas RLS de `chat_messages` (leer y escribir) y de `chat_participants` cuelgan todas de
`is_chat_participant(conversation_id)`. Si la fila no está, no se lee ni se escribe.

## El bug que se arregló

`trg_add_to_event_chat` solo tenía la rama de `'confirmada'`: metía a la gente al grupo del
evento y **no la sacaba nunca**. Quien cancelaba su cita seguía leyendo y escribiéndole al grupo
de un evento al que no iba a ir.

Al 7 de septiembre había **61 personas** en esa situación, 3 de ellas ya habían escrito.

Ahora el trigger también borra la fila cuando el estado pasa a `'cancelada'`, y si la persona se
vuelve a inscribir la rama de `'confirmada'` la reingresa. Probado el ciclo completo: entra, sale
al cancelar, vuelve a entrar al reinscribirse.

### Dos cosas que se decidieron a propósito

- **Los mensajes que alcanzó a escribir NO se borran.** Dejarían huecos en conversaciones que
  otros ya leyeron. Lo que se corta es el acceso, no el historial.
- **Solo se saca si no le queda otra cita viva a ese evento.** Hoy nadie tiene citas repetidas
  (se verificó), pero si algún día alguien se reinscribe sin que se borre la fila anterior,
  cancelar una no puede sacarlo del chat al que sí tiene derecho por la otra.

## Dividir un evento en mesas: el bug que costó la cena del 4

Dividir un evento significa **cambiarle el `event_id` a cada cita**. Los dos triggers de chat
estaban declarados como `AFTER UPDATE OF status`, y cambiar de evento no es cambiar de estado:
**ninguno se disparó**. La "Mesa Nospi Roja" se quedó sin chat y la "Azul" con una sola persona.

Del mismo tipo, en `trg_sync_event_channel`: sincronizaba solo
`COALESCE(NEW.event_id, OLD.event_id)` —el evento nuevo— así que al mover a alguien el canal del
evento **viejo** se quedaba con esa persona adentro.

Ahora:

- Los dos triggers escuchan `AFTER INSERT OR UPDATE OF status, event_id`.
- `trg_add_to_event_chat` saca del grupo del evento viejo antes de meter al nuevo.
- `trg_sync_event_channel` reconcilia los **dos** eventos cuando la cita se mueve.

Probado: se inscribe → está en el chat A; se le cambia el `event_id` → sale de A y entra a B.

**Al reparar un evento pasado, entra solo quien tenga `checked_in_at`.** Después del evento las
citas quedan en estado `anterior`, no `confirmada`, así que la rama normal del trigger no aplica
y hay que insertar a mano; y quien canceló o no apareció no tiene por qué quedar en el grupo de
una mesa donde no estuvo.

## El chat privado ya estaba bien

`get_or_create_direct_chat` exige, para un chat **nuevo**, que las dos personas hayan estado en
el mismo evento con `location_confirmed = true` y que **ninguna** haya cancelado. O sea que quien
cancela no puede abrir conversaciones privadas con los que sí fueron.

Ojo con la excepción, que es deliberada: si la conversación **ya existía**, la función la
devuelve sin volver a validar. Es para que los chats abiertos antes de esa regla no se rompan.
