# Evento de videollamada (`type = 'virtual'`)

Nota para el próximo chat que toque este tipo de evento. Implementado el 19 de
septiembre de 2026.

## La regla que lo sostiene todo

**El enlace del Meet no sale de la app. Nunca.**

No se manda por correo, no se manda por WhatsApp, y no se muestra como texto en
ninguna pantalla. Solo existe detrás de un botón dentro de la app.

No es una preferencia de diseño: es el mecanismo de asistencia. En un evento
presencial el GPS prueba que la persona está en el lugar. En uno virtual la app
no puede leer nada del Meet — Google no expone eso — así que lo único que queda
es **controlar el acceso**. Si el único camino al Meet pasa por la app, tocar el
botón deja de ser un gesto de buena fe y pasa a ser cómo se entra.

Si el enlace se filtra, la confirmación de asistencia se cae entera: cualquiera
entra sin pasar por la app, y el `checked_in_at` deja de significar nada.

### De ahí sale la columna propia

El enlace vive en **`events.meet_link`**, no en `maps_link`. `maps_link` lo
imprimen COMO TEXTO cuatro plantillas: el correo de la víspera, el del mismo
día, y los dos WhatsApp equivalentes. Si el Meet viviera ahí, saldría escrito en
un correo el día antes del evento.

Con una columna nueva ninguna plantilla existente puede filtrarlo por accidente,
porque ninguna la conoce. Es seguro por construcción, no por disciplina.

## El flujo de confirmación

1. El admin pega el link en el campo único del formulario (los cuatro de
   ubicación y la casilla de GPS no aparecen cuando el tipo es `virtual`).
2. El admin le da a **activar el acceso** — es el mismo `is_location_revealed`
   de siempre, solo cambia el texto del diálogo.
3. Salen el correo y el WhatsApp avisando. **Sin el enlace.**
4. Desde 15 minutos antes (`MINUTOS_ANTES_ENTRAR` en
   `app/event-details/[id].tsx`) aparece el botón *Entrar a la videollamada*.
5. Al tocarlo: **primero** escribe `checked_in_at`, `arrival_status = 'on_time'`
   y `location_confirmed`, y **después** abre el Meet. En ese orden — si se
   abriera primero, el navegador se lleva el foco y la escritura puede no
   alcanzar a salir.

A partir de ahí todo lo de siempre funciona igual, porque todo cuelga de
`checked_in_at`: la Comunidad Nospi, el chat privado entre asistentes, y
`flag_event_no_shows` al cerrar el evento.

### Lo que esto NO prueba

Que la persona se haya quedado en la llamada. Prueba que pasó por la puerta, no
que se sentó. Es el mismo margen que tiene el GPS presencial, que tampoco prueba
que alguien se sentó en la mesa.

Se evaluaron y descartaron dos alternativas:

- **Un código que diga el moderador dentro del Meet.** No hay moderador en este
  formato, y Google no deja inyectar texto que solo vean los que entraron (el
  nombre de la reunión se ve en la pantalla previa, antes de entrar).
- **La API de Meet** (`conferenceRecords.participants.list`). Sí devuelve quién
  entró, pero los invitados sin sesión de Google solo dan un `displayName`.
  Cruzar "Juan" o "iPhone de Ana" contra la base de usuarios no aguanta poner
  una amonestación.

Lo único que daría minutos exactos es sacar el video de Meet y meterlo en la app
con un SDK (LiveKit, Daily): ahí el token de acceso lleva el `user_id` y la
asistencia es un subproducto. Cabe en el plan gratis para un evento semanal,
pero es desarrollo de verdad y no se hizo todavía.

## `require_gps_verification` queda en false

Se fuerza al guardar. Sin coordenadas no hay contra qué comparar, y
`confirmArrival` en `app/(tabs)/dinamica.tsx` ya sabía saltarse la validación
cuando esa bandera está apagada — no hubo que tocar esa parte.

## Dos cosas que habrían bloqueado el evento

Las dos ya están arregladas, pero vale saber que existían:

1. **`events_type_check`** solo permitía los cinco tipos presenciales. Sin
   ampliarlo no se podía ni crear el evento.
2. **`handleRevealLocation`** exigía nombre del lugar, dirección, link del GPS y
   link para mostrar. Un evento virtual no tiene ninguno de los cuatro, así que
   el botón habría quedado bloqueado para siempre y los correos y WhatsApps
   automáticos nunca habrían salido.

## Textos que asumían un lugar físico

Están corregidos, pero si aparece uno nuevo el patrón es `esVirtual`:

- La invitación a **pedir algo de tomar** en la sala de espera. Ya se saltaba en
  caminata ("no hay dónde ordenar"); ahora también en virtual.
- "Ya en el lugar…", "confirma tu llegada", "moderador de la mesa", "la
  ubicación se revelará un día antes", "al llegar di que vienes de Nospi".
- En la política de asistencia, "si no llegas" pasa a "si no entras".

## La calificación del final

`components/CatchUpRatingScreen.tsx` cambia los items según el tipo. En virtual,
"El lugar / ambiente" y "La comida y bebida" se reemplazan por **"La
videollamada"** (señal, audio, cámaras apagadas, duración). No es solo que
sobren: esas respuestas entraban al ranking de lugares del admin y ensuciaban el
promedio de los restaurantes reales.

El reporte del admin (`admin_event_feedback_report`) devuelve `videollamada`,
`motivos_videollamada` y `event_type`. Sin esas columnas el dato se guardaba en
`event_feedback` pero nadie lo leía nunca.
