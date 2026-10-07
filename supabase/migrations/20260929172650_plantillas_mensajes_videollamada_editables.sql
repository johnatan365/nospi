-- Los textos de los mensajes de videollamada salen del codigo y pasan a la
-- base, para poder cambiarlos desde el admin sin desplegar nada.
--
-- Una sola plantilla por momento alimenta TRES salidas: el WhatsApp que envia
-- el admin, el correo en texto plano y el correo en HTML. Por eso el formato
-- es el de WhatsApp, que es el que la gente ya sabe escribir:
--   *negrita*   _cursiva_   y una linea en blanco separa parrafos.
-- Comodines disponibles: {nombre} {evento} {fecha} {hora} {horaBoton}
--
-- Si una clave queda vacia o se borra, el codigo cae al texto que trae por
-- defecto: nunca se manda un correo en blanco.

insert into public.app_config (key, value) values
('msg_virtual_hoy',
'¡Hola {nombre}! 👋

🎥 *Hoy a las {hora}* es tu videollamada.

*Entras desde la app, en 3 toques:*
1️⃣ Abre Nospi → pestaña *Dinámica* (desde las {horaBoton})
2️⃣ *Confirmar asistencia*
3️⃣ Ahí mismo sale el botón *Ir a Meet*: lo tocas y te abre la llamada

🎤 Uno de ustedes modera: si te animas, toca *"Quiero ser el moderador"*
📹 Te recomendamos entrar con la cámara prendida: nos conocemos mejor viéndonos las caras
✏️ Ten a mano papel y lápiz

Al final eliges con quién hiciste clic — si es mutuo, se abre un *chat privado* 🔒

📲 ¿Aún sin las apps?
Nospi 👉 nospi.co/app
Google Meet 👉 nospi.co/meet

¡Hoy Nospi! 🎉'),
('msg_virtual_vispera',
'¡Hola {nombre}! 👋

🎥 *Mañana a las {hora}* es tu videollamada — desde donde estés.

📲 *Instálalas hoy:*
Nospi 👉 nospi.co/app
Google Meet 👉 nospi.co/meet
En Nospi está el enlace, la dinámica y el chat con tus matches. Y te avisa cuando arranca 🔔

Mañana desde las {horaBoton} confirmas en la pestaña *Dinámica*, uno del grupo se anima a moderar y entran a la llamada.

📹 Te recomendamos entrar con la cámara prendida: nos conocemos mejor viéndonos las caras. Ten a mano papel y lápiz 😉

¿No puedes ir? Cancela hoy y conservas tu saldo. Mañana ya no alcanzamos a devolverlo y te queda una falta.

¡Nos pillamos! 😄
_Equipo Nospi_')
on conflict (key) do nothing;