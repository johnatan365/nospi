# Nospi — reglas del repositorio

## ESTE REPOSITORIO ES PUBLICO

`github.com/johnatan365/nospi` es publico. Cualquier persona en internet lee
todo lo que se comitea aqui, y git guarda el historial para siempre: borrar un
secreto despues NO lo borra del historial, solo lo esconde del archivo actual.

### Prohibido: ningun secreto en texto plano, nunca

No escribas un valor de secreto dentro de ningun archivo de este repositorio.
Ni en codigo, ni en migraciones SQL, ni en comentarios, ni en documentacion, ni
en un archivo de ejemplo, ni "temporalmente para probar". Tampoco lo pegues en
el mensaje de un commit.

Esto cubre, entre otros:

- Llaves de Wompi: `prv_prod_...`, `prv_test_...` (las privadas son las graves)
- Llave de Resend: `re_...`
- JWT de Supabase con `"role":"service_role"`
- Cualquier secreto de webhook propio: `nospi_*_wh_*`
- Tokens de GitHub, Expo, Google Play, App Store, OpenAI, etc.

Ya paso una vez: el 8 de octubre de 2026 el commit `cce8027` subio las 55 Edge
Functions con la llave privada de produccion de Wompi escrita en nueve
archivos. Quedo publica. No se repite.

### Como se hace en su lugar

En una Edge Function:

```ts
const WOMPI_PRIVATE_KEY = Deno.env.get('WOMPI_PRIVATE_KEY') || '';
```

Sin valor por defecto. Un `|| 'prv_prod_...'` de respaldo es exactamente el
error que se esta evitando: vuelve a dejar el secreto en el codigo.

El valor se guarda en Supabase: Project Settings > Edge Functions > Secrets.
Si un secreto nuevo hace falta, PIDESELO al dueno y que lo cargue el ahi. No lo
inventes ni lo copies de otro archivo al codigo.

En una migracion SQL que llama a una funcion con `net.http_post`, el secreto se
lee de la base, no se escribe en el `.sql`:

```sql
headers := jsonb_build_object('x-webhook-secret', public.secreto('cancel_wh'))
```

### Antes de comitear

Hay un hook en `.githooks/pre-commit` que bloquea el commit si detecta un
patron de secreto, y un chequeo en CI (`.github/workflows/no-secretos.yml`) que
falla el push. Si uno de los dos te frena, NO uses `--no-verify` ni desactives
el chequeo: saca el secreto del archivo.

Para que el hook quede activo en una copia nueva del repositorio:

```sh
git config core.hooksPath .githooks
```

## Otras reglas que ya costaron caro

- **Antes de escribir SQL a mano, busca si la app ya tiene una funcion para
  eso.** Dividir un evento es `admin_dividir_evento`, no un `INSERT` manual.
  Un `INSERT` a mano en `events` el 17 de octubre dejo dos mesas en
  `game_phase='questions'` desde que nacieron: la dinamica nunca arranco y
  diecisiete personas se quedaron mirando "Syncing the game...".
- **Nunca hagas DDL sobre `events` mientras hay un evento en curso.**
  `CREATE TRIGGER` pide bloqueo exclusivo y puede congelar la dinamica.
- **Los mensajes de WhatsApp van sin emojis y sin tildes** (se rompen al pasar
  por `wa.me`), y nunca dicen "gratis": se dice "por cuenta de la casa".
