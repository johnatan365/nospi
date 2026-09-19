# App Review de Meta para responder comentarios y DMs

Lo que falta para que la funcion `redes-sociales` pueda **escribir** (hoy solo
lee). Preparado el 18 de septiembre de 2026.

## El muro con el que chocamos

Al intentar el primer DM real, Meta respondio:

> Cannot message users who are not admins, developers or testers of the app
> until pages_messaging permission is reviewed and the app is live. (code 10)

Son dos cosas distintas y hacen falta las dos:

1. La app **Nospi** (`2062462107811580`) esta en modo desarrollo. En ese modo
   solo puede actuar sobre gente que tenga un rol en la app.
2. Los permisos de escritura estan en **acceso estandar**. Para usarlos con
   gente de afuera necesitan **acceso avanzado**, y eso pasa por App Review.

Leer no choca con esto: ya funciona con publicaciones, Reels y DMs de las dos
redes.

## Permisos a solicitar

| Permiso | Para que lo necesita Nospi |
|---|---|
| `pages_manage_engagement` | responder y moderar comentarios en Facebook |
| `instagram_manage_comments` | responder y moderar comentarios en Instagram |
| `pages_messaging` | responder DMs de Facebook y la respuesta privada a un comentario |
| `instagram_manage_messages` | responder DMs de Instagram |

Los de lectura (`pages_read_engagement`, `pages_read_user_content`,
`pages_show_list`, `instagram_basic`) ya funcionan. Puede que tambien pidan
acceso avanzado al publicar la app; si el diagnostico empieza a fallar despues
de pasar a Live, hay que agregarlos a la misma solicitud.

## Antes de enviar

- [ ] **Verificacion del negocio** completada en el portfolio Cricken
- [ ] **Politica de privacidad** publica y accesible (la de nospi.co)
- [ ] **Icono y categoria** de la app configurados
- [ ] **URL de eliminacion de datos** configurada
- [ ] App en modo **Live** (boton "Publicar" en el panel de la app)

## Justificaciones (texto para pegar)

Meta pide explicar, por permiso, que hace la app y por que lo necesita. Estas
estan escritas sobre lo que Nospi realmente hace, no sobre un caso generico:
inventar un uso distinto al real es la causa mas comun de rechazo.

### pages_manage_engagement

> Nospi organiza eventos presenciales en Medellin para que personas que no se
> conocen entre si coman o hagan planes juntas. Publicamos en nuestra pagina de
> Facebook y la gente comenta preguntando por fechas, precios, ubicacion y como
> funciona. Usamos pages_manage_engagement para responder publicamente esos
> comentarios desde nuestra propia herramienta de atencion, y para ocultar
> comentarios de spam. Solo actuamos sobre comentarios en publicaciones de
> nuestra propia pagina. No accedemos a contenido de otras paginas.

### instagram_manage_comments

> Igual que el anterior, pero en nuestra cuenta de Instagram (@nospi.social).
> La mayoria de las preguntas sobre nuestros eventos llegan como comentarios en
> Reels. Usamos instagram_manage_comments para responderlos y para ocultar
> spam. Solo actuamos sobre comentarios en publicaciones de nuestra propia
> cuenta.

### pages_messaging

> Cuando alguien comenta pidiendo informacion de un evento, le respondemos en
> publico lo general y le enviamos por mensaje privado la informacion completa
> (precio, fecha y el enlace de registro), porque no publicamos precios en los
> comentarios. Tambien respondemos los mensajes que la gente nos escribe
> directamente a la pagina. Todos los mensajes son respuestas a una
> interaccion que inicio la persona. No enviamos mensajes masivos ni
> promocionales no solicitados.

### instagram_manage_messages

> Lo mismo para los mensajes directos de Instagram: respondemos preguntas sobre
> nuestros eventos que la gente nos envia por DM, y enviamos la informacion
> completa a quien la pide en un comentario. Siempre en respuesta a una
> interaccion que inicio la persona.

## El screencast

Es la parte que mas rechazos genera. Meta exige un video mostrando el permiso
**en uso real**, no una explicacion.

El problema: la funcion `redes-sociales` no tiene interfaz, se llama por API.
Un video de llamadas a la API suele no convencer al revisor.

**La salida mas limpia es darle una pantalla al admin de Nospi**: una vista que
liste los comentarios y DMs pendientes (la accion `bandeja`, que ya funciona) y
un boton para responder (`responder` y `dm`). Con eso el video se graba solo:

1. Entrar al admin de Nospi
2. Abrir la pantalla de redes: se ve la lista de comentarios pendientes
3. Escribir una respuesta y enviarla
4. Mostrar la respuesta ya publicada en Facebook/Instagram
5. Repetir para un DM

Un video por permiso, o uno solo que los recorra todos, en ingles o con
subtitulos en ingles.

## Donde se envia

https://developers.facebook.com/apps/2062462107811580/app-review/permissions/

## Cuanto tarda

Dias, a veces semanas. Meta puede pedir aclaraciones y reiniciar el conteo.
Mientras tanto, la funcion sigue leyendo todo sin problema: se puede revisar la
bandeja y redactar las respuestas, y publicarlas a mano hasta que aprueben.
