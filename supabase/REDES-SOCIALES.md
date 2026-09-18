# Responder Facebook e Instagram sin el computador

Nota para el proximo chat que toque comentarios o DMs organicos.
Funcion `redes-sociales` desplegada en Supabase (`wjdiraurfbawotlcndmk`) el 18
de septiembre de 2026.

## El problema que resuelve

Responder comentarios y DMs organicos se venia haciendo a mano por Meta
Business Suite con Claude in Chrome. Eso amarra todo al computador: tiene que
estar prendido, con la sesion de Meta abierta y la extension corriendo. Desde
un chat remoto no se podia hacer nada.

La Graph API si expone comentarios y DMs organicos. Lo que faltaba era un lugar
desde donde llamarla. Esta funcion es ese lugar: corre en Supabase, que si
alcanza a `graph.facebook.com`, y se puede disparar desde cualquier parte —
incluido un chat sin navegador, via `pg_net`.

**TikTok no entra aca.** No tiene API publica de comentarios ni DMs organicos.
Eso sigue siendo manual por TikTok Studio, como hasta ahora.

## Lo que hay que configurar una sola vez

Son dos secretos en el panel de Supabase
(Project Settings -> Edge Functions -> Secrets). Se puede hacer desde el
navegador del celular; no hace falta computador.

### 1. `REDES_SECRET`

Cualquier cadena larga al azar. Es lo que deja llamar la funcion desde
`pg_net`/cron sin tener la service role key a mano — el mismo patron de
`x-cron-secret` en `wompi-charge-subscriptions-cron`.

### 2. `META_PAGE_TOKEN`

El token del **usuario del sistema** de Meta, porque no se vence; el del
Explorador de la Graph API caduca y deja todo tirado sin aviso.

**Ojo con el nombre**: aunque la variable se llame `META_PAGE_TOKEN`, lo que va
ahi es el token del usuario del sistema, NO uno de Pagina. El de Pagina lo
deriva la funcion sola por `/me/accounts`. Esto no es un detalle cosmetico:
con el token del usuario del sistema, `/me` devuelve al usuario del sistema y
no a la Pagina (pedirle `instagram_business_account` falla con *nonexisting
field*), y los bordes de Pagina de Facebook rechazan ese token con *"A Page
access token is required for this call for the new Pages experience"*.
Instagram si funciona con cualquiera de los dos.

En `business.facebook.com` -> Configuracion del negocio:

1. **Usuarios -> Usuarios del sistema** -> Agregar. Rol: Administrador.
2. **Agregar activos** -> asigna la Pagina de Nospi y la cuenta de Instagram,
   las dos con control total.
3. **Generar nuevo token** -> elige la app -> caducidad **Nunca** -> marca
   estos permisos:

   | Permiso | Para que |
   |---|---|
   | `pages_show_list` | ver la Pagina |
   | `pages_read_engagement` | leer publicaciones y comentarios |
   | `pages_read_user_content` | leer los comentarios de la gente |
   | `pages_manage_engagement` | responder, ocultar, eliminar, dar like |
   | `pages_messaging` | DMs y respuestas privadas |

   Si `pages_messaging` no aparece en la lista, es que la app no tiene el caso
   de uso de mensajeria configurado. Se puede seguir sin el: los comentarios
   funcionan igual y solo quedan fuera los DMs.
   | `instagram_basic` | ver la cuenta de IG |
   | `instagram_manage_comments` | comentarios de IG |
   | `instagram_manage_messages` | DMs de IG |

4. Copia el token y pegalo como `META_PAGE_TOKEN`.

La cuenta de Instagram tiene que ser profesional y estar vinculada a la Pagina.
Si no, todo lo de IG falla y el diagnostico lo dice.

### 3. Comprobar

Antes de responderle a nadie, corre la accion `diagnostico`. Prueba cada
permiso por separado contra la API real y dice cual falta y donde, en vez de
fallar a mitad de una tanda de respuestas. Tambien avisa si el token se vence.

## Como se llama

`POST https://wjdiraurfbawotlcndmk.supabase.co/functions/v1/redes-sociales`
con el header `x-redes-secret` (o la service role key en `Authorization`).

Desde un chat sin salida a internet, via `pg_net`:

```sql
select net.http_post(
  url := 'https://wjdiraurfbawotlcndmk.supabase.co/functions/v1/redes-sociales',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-redes-secret', '<REDES_SECRET>'
  ),
  body := '{"accion":"bandeja"}'::jsonb
);
-- la respuesta llega a net._http_response, buscando por el id que devuelve
```

### Acciones

| Accion | Que hace |
|---|---|
| `diagnostico` | prueba token, permisos y cada capacidad |
| `bandeja` | comentarios sin responder + conversaciones, de las dos redes |
| `conversaciones` | solo los DMs de una red (`red`) |
| `responder` | respuesta publica a un comentario |
| `dm` | mensaje privado |
| `ocultar` | oculta un comentario (reversible) |
| `eliminar` | borra un comentario (irreversible) |
| `like` | da like a un comentario (solo Facebook) |

### Nada se publica por accidente

Las cinco acciones que escriben **no hacen nada sin `"aplicar": true`**. Sin
eso devuelven lo que harian. Es la misma idea del `--aplicar` de
`scripts/comprimir-fotos-perfil.sh`, pero aca importa mas porque lo que se
publica es publico y con el nombre de la marca.

```json
{"accion":"responder","red":"instagram","comentario_id":"178...","texto":"¡Hola! ...","aplicar":true}
```

Para el DM hay dos formas:

- `comentario_id` -> **respuesta privada** a quien comento. Abre el DM sin que
  la persona escriba primero, que es justo lo que pide la regla de no invitar
  en publico a escribir por interno. Meta lo permite una sola vez por
  comentario y dentro de los 7 dias.
- `destinatario_id` -> mensaje en un hilo ya abierto (el id sale de
  `conversaciones`).

## Dos cosas que mejoran respecto a Business Suite

- **Ocultar en Instagram si funciona.** Por Business Suite solo aparece
  "Eliminar", y ocultar de verdad solo existe en la app del celular. La Graph
  API si expone `hide`, asi que ya no toca borrar un comentario solo para
  sacarlo de la vista.
- **Los Reels de Facebook ya no son un punto ciego.** No salen en `/posts`, por
  eso Business Suite no los lista y se pasaron comentarios reales. La funcion
  pide `/posts` y `/video_reels` a proposito.

## Que se contesto y a quien

Cada accion queda en `redes_interacciones` (quien, que se dijo, resultado).
Antes la unica memoria era ocultar o borrar el comentario en Meta — habia que
destruir informacion solo para acordarse, y no quedaba registro de QUE se
respondio ni si el envio fallo. Los fallos tambien se guardan.

```sql
select creada_en, red, accion, autor, texto_enviado, resultado
from redes_interacciones order by creada_en desc limit 20;
```

## Lo que NO cambia

Las reglas de negocio siguen siendo las de la skill `responderredessociales`:
el precio nunca va en publico, no se invita en publico a escribir por interno,
los grupos se arman por intereses **y** rango de edad sin dar numero de
personas, y no se inventan fechas ni politicas. Esta funcion es solo el
transporte; el criterio sigue en la skill.
