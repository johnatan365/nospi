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

## Orden de la lista de chats

`get_my_conversations()` ordenaba poniendo primero las conversaciones **con** mensajes y las
vacías de últimas. El efecto perverso: un grupo recién creado —que por definición no tiene
mensajes— quedaba enterrado debajo de todos los viejos, justo cuando más falta hace que se vea.
El chat de la "Mesa Nospi Azul" quedó en la posición **15 de 15** y parecía no existir.

Ahora el orden es `coalesce(último_mensaje, fecha_del_evento) desc`: la última señal de vida de
cada conversación. Un grupo nuevo de un evento reciente o próximo queda arriba.

Los chats directos y los canales no se ven afectados: solo aparecen en la lista cuando ya tienen
mensajes, así que para ellos el criterio sigue siendo el último mensaje.

## El chat privado: tres puertas (esta sección reemplaza a la de abajo)

Actualizado el 30 de septiembre de 2026. Lo que dice la sección siguiente
("El chat privado ya estaba bien") describe la regla **vieja**, cuando escribirle
a alguien que no se había cruzado contigo estaba bloqueado de plano. Ya no es así.

Hoy un chat 1-1 se abre por **tres** caminos, y no hay un cuarto:

1. **Match.** `open_direct_conversation(p_other)` exige una fila en
   `event_matches`. Nace `aceptada`.
2. **Mismo evento.** `get_or_create_direct_chat(p_other_user_id)` con las dos
   personas en un mismo evento, ambas con `location_confirmed = true` y ninguna
   `cancelada`. Nace `aceptada`.
3. **Solicitud aceptada.** Mismo `get_or_create_direct_chat`, pero sin evento
   compartido: nace `pendiente` con `solicitada_por = quien escribe`. Quien la
   recibe llama a `aceptar_solicitud_chat` (pasa a `aceptada`) o a
   `ignorar_solicitud_chat` (pasa a `ignorada`).

Quién puede **escribir** lo decide `puede_escribir_en_directo(conversation_id)`:

- `aceptada` → los dos, siempre.
- `pendiente` → **solo** quien la envió y **solo mientras no haya ningún mensaje**.
  O sea: un mensaje, uno, y se queda esperando.
- `ignorada` → nadie. Para siempre. Quien la envió no vuelve a poder escribir.

### El límite de solicitudes: era una condena, ahora es un límite diario

`tope_solicitudes_pendientes()` no se puede quitar: es lo único que impide que
una sola persona le escriba a los 203 miembros de la comunidad de un tiro.

Pero como estaba escrito, contaba **todas** las solicitudes en `pendiente` de
toda la vida. Y una solicitud ignorada se queda en `pendiente` para siempre. Así
que quien mandaba 5 y no le contestaba nadie quedaba bloqueado **de por vida**,
sin haber hecho nada mal, leyendo un "espera a que te contesten" que nunca iba a
ocurrir. El tope castigaba la mala suerte, no el abuso.

Desde el 30 de septiembre de 2026 (migración
`20260930180000_limite_diario_solicitudes_chat.sql`):

- el conteo lleva `and c.created_at > now() - interval '24 hours'`, así el límite
  se libera solo con el paso de las horas;
- el tope sube de **5 a 10**, porque con la ventana de 24 h el 5 quedaba corto
  para alguien que sí está conociendo gente de buena fe;
- el mensaje de error se reescribió: el viejo ("espera a que te contesten") había
  dejado de ser cierto.

**Ojo con el `errcode`.** El límite se lanza con `42501`. En la app,
`startDirectChat` traducía cualquier `42501` como "solo puedes escribirle a
personas que asistieron contigo a un evento" —la regla vieja—, así que la persona
leía una explicación que no tenía nada que ver con lo que le pasó. Si alguna vez
se agrega otro `raise` con `42501` en esa función, hay que volver a mirar ese
bloque en `app/chat/[conversationId].tsx`.

### Dónde se explica la regla dentro de la app

La regla existía solo en la base de datos, y la gente la descubría chocándose con
ella. Ahora se dice en tres momentos:

- **Antes de enviar**, en la ficha de la persona (`app/chat/[conversationId].tsx`,
  junto a "Escribir por privado").
- **Al recibir**, en la `solicitudBar` de la conversación: un solo mensaje, y qué
  pasa si se acepta o se ignora.
- **En la pantalla de Chats** (`app/(tabs)/chats.tsx`, pestaña de directos): un
  "¿Cómo se abren los chats 1-1?" con las tres puertas.

Si alguna de las tres reglas cambia en la base, hay que cambiar esos tres textos.
Un texto que promete algo que la base no cumple es peor que no tener texto.

## El chat privado ya estaba bien

`get_or_create_direct_chat` exige, para un chat **nuevo**, que las dos personas hayan estado en
el mismo evento con `location_confirmed = true` y que **ninguna** haya cancelado. O sea que quien
cancela no puede abrir conversaciones privadas con los que sí fueron.

Ojo con la excepción, que es deliberada: si la conversación **ya existía**, la función la
devuelve sin volver a validar. Es para que los chats abiertos antes de esa regla no se rompan.

## La comunidad: se entra al cerrar el evento, no al llegar

Aplicado el 19 de septiembre de 2026.

La llave de la Comunidad Nospi no cambió: sigue siendo **haber confirmado
asistencia** (`checked_in_at`), no haber pagado. Lo que cambió es **cuándo** se
abre la puerta.

Antes entraba en el mismo instante del check-in. Eso quiere decir **durante** el
evento: la gente estaba sentada en la mesa, en la dinámica, y ya tenía encima el
grupo de 160 personas. Ahora entra cuando el admin **cierra** el evento.

Dos caminos, un solo lugar que decide:

- `trg_comunidad_al_cerrar_evento` (en `events`, `AFTER UPDATE OF event_status`):
  cuando el evento pasa a `closed`, mete a todos los que tengan `checked_in_at`
  y no estén `cancelada`.
- `trg_entrar_a_comunidad` (en `appointments`) ya **no** mete a nadie por su
  cuenta: solo actúa si el evento **ya está cerrado**. Queda para el check-in
  tardío, cuando el admin marca una llegada después de haber cerrado.

Los dos llaman a `meter_en_comunidad(user_id)`, que es donde vive la regla de
`comunidad_salidas`: quien se salió a propósito, o a quien sacó el admin, no
vuelve a entrar solo. Ahí tampoco se filtra por `is_internal`.

`volver_a_comunidad()` pide lo mismo: una asistencia confirmada en un evento
**ya cerrado**. Si no, quien se salió podría reentrar a mitad de un evento y
saltarse la regla por la puerta de atrás.

### Cuidado al cerrar un evento viejo

Cerrar un evento ahora mete gente a la comunidad. Si alguna vez hay que cerrar
un evento antiguo que quedó colgado en `published`, revisa primero quién tiene
`checked_in_at` ahí: van a entrar todos de una.
