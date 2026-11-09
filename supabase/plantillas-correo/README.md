# Plantillas de los correos de cuenta

Estos tres archivos son el **respaldo versionado** de las plantillas de correo
de Supabase Auth: recuperar contrasena, confirmar correo y enlace magico.

## Importante: estos archivos NO se despliegan solos

Las plantillas de Auth **no viven en la base de datos** ni en el codigo. Viven
en la configuracion del proyecto de Supabase, fuera de Postgres. Por eso no hay
migracion ni comando que las suba: se pegan a mano.

Para cambiarlas:

1. Supabase -> Authentication -> Emails
2. Elegir la plantilla (Reset password / Confirm signup / Magic Link)
3. En **Body**, interruptor **Source** (no Preview), borrar y pegar el HTML
4. Ajustar el **Subject** si hace falta
5. Save

**Si cambias algo en el panel, actualiza tambien el archivo de aqui.** Si no,
este respaldo queda viejo y la proxima persona restaura una version vieja.

Al pegar, verifica con **Preview**: debe verse la barra vinotinto y el boton
rosado. Si sale gris y sin formato, se pego el texto en vez del HTML — pasa al
abrir el archivo con un visor que ya lo interpreto en vez de un editor de
texto.

## Asuntos que acompanan a cada plantilla

| Archivo | Plantilla en Supabase | Subject |
|---|---|---|
| 1-recuperar-contrasena.html | Reset password | Restablece tu contrasena |
| 2-confirmar-correo.html | Confirm signup | Confirma tu correo en Nospi |
| 3-magic-link.html | Magic Link | Tu enlace para entrar a Nospi |

## Por que existen

Hasta el 9 de noviembre de 2026 salian las plantillas de fabrica de Supabase:
en ingles, sin marca, dos renglones y un enlace sin formato. Gmail las marcaba
como posible phishing ("This message might be dangerous") y hubo gente que no
pudo recuperar su cuenta. Iban 34 recuperaciones en 30 dias con esa
advertencia.

Las tres plantillas llevan, a proposito:

- **Un boton de verdad**, no un enlace suelto que el cliente de correo pinta
  como texto negro indistinguible.
- **La URL completa en texto plano debajo**, para que si el boton falla la
  persona igual pueda entrar.
- **Una linea diciendo por que le llega ese correo** y que Nospi nunca pide
  contrasenas ni datos de tarjeta. Eso es justo lo que los filtros buscan para
  decidir que un correo es legitimo.

Las variables `{{ .ConfirmationURL }}` y `{{ .Email }}` las reemplaza Supabase
al enviar. No las toques.
