# Puerta 2 — prueba de solo suscripción

Experimento para medir si la gente se suscribe cuando **no** ve la opción de
pagar el evento suelto. Quien llega por un link especial no ve la compra por
evento; todos los demás siguen viendo la app exactamente igual que siempre.

Este archivo existe para poder **desmontarlo sin adivinar** cuando la prueba
termine.

---

## Cómo se enciende y se apaga

| Quiero | Qué hago |
|---|---|
| Apagarlo ya | Apagar la campaña de Meta que apunta a `/suscribete`. Deja de entrar gente nueva. |
| Apagarlo para todos, incluso quien tenga el link | Poner `app_config.prueba_solo_suscripcion` en `'false'`. Sin publicar código. |
| Encenderlo | Poner esa misma llave en `'true'`. |

```sql
UPDATE app_config SET value = 'false' WHERE key = 'prueba_solo_suscripcion';
```

**Nace apagado.** Aunque el código esté publicado, mientras esa llave esté en
`'false'` nadie ve nada distinto.

---

## Cómo funciona

1. La persona llega a `app.nospi.co/suscribete`. `vercel.json` la redirige a
   `/?plan=sub`.
2. El script de atribución de `public/index.html` ve `plan=sub` en la URL y
   guarda `solo_suscripcion: true` dentro del blob `nospi_attr` de
   `localStorage`, en su **primera** visita. Se guarda ahí porque el registro
   puede pasar días después.
3. Al crear el perfil, `leerAtribucion()` en `app/index.tsx` copia esa marca a
   la columna `users.solo_suscripcion`.
4. `app/subscription-plans.tsx` lee esa columna. Si está en `true` **y** el
   interruptor está encendido, no muestra la tarjeta de "Por evento".

La marca se guarda en la base y no solo en el navegador a propósito: si la
persona limpia el historial, se pierde de qué rama era y el experimento queda
sin poder medirse.

---

## Qué se agregó exactamente

### Base de datos
- Columna `users.solo_suscripcion` (boolean, default `false`).
- Llave `app_config.prueba_solo_suscripcion` (`'false'`).

Migración: `planes_3_6_meses_y_puerta_solo_suscripcion`.

### Código

| Archivo | Qué se agregó |
|---|---|
| `vercel.json` | Redirect de `/suscribete` a `/?plan=sub` |
| `public/index.html` | Variable `soloSub` y el campo `solo_suscripcion` dentro del `localStorage.setItem` de atribución |
| `app/index.tsx` | Campo `solo_suscripcion` en las dos ramas de `leerAtribucion()` y en `atribucionVacia()` |
| `utils/appConfig.ts` | Campo `prueba_solo_suscripcion` en la interfaz `AppConfig`, en `DEFAULTS` y en el bucle que lee las filas |
| `contexts/AppConfigContext.tsx` | Campo `prueba_solo_suscripcion` en `DEFAULT_CONFIG` |
| `app/subscription-plans.tsx` | Estado `soloSuscripcionUsuario`, constantes `pruebaEncendida` y `ocultarPagoPorEvento`, el campo `solo_suscripcion` en el `select` de `users`, y el condicional que envuelve la tarjeta "Por evento" |

---

## Cómo quitarlo del todo

No hace falta para que la app funcione: con el interruptor en `'false'` el
código queda inerte. Pero si se quiere limpiar, es exactamente lo de la tabla
de arriba, en ese orden inverso.

**Lo único que conviene NO borrar es la columna `users.solo_suscripcion`.** Es
el registro de quién entró por esa puerta; sin ella no se puede volver a mirar
el resultado del experimento dentro de tres meses. Una columna booleana sin usar
no cuesta nada.

---

## Cómo se mide

La métrica que decide **no** es cuántos se suscribieron, sino **cuánto ingreso
dejó cada 100 registros** en cada rama. En la puerta 2, quien quería pagar los
$15.000 y no encontró la opción se va sin comprar nada, y esa pérdida tiene que
contarse.

```sql
SELECT u.solo_suscripcion AS puerta_2,
       count(*) AS registros,
       count(*) FILTER (WHERE p.user_id IS NOT NULL) AS compraron,
       COALESCE(sum(p.total), 0) AS ingreso,
       round(COALESCE(sum(p.total), 0) / count(*)) AS ingreso_por_registro
FROM users u
LEFT JOIN (
  SELECT user_id, sum(amount) AS total
  FROM payment_attempts WHERE status = 'APPROVED' GROUP BY user_id
) p ON p.user_id = u.id
WHERE u.created_at > '2026-09-03'
  AND u.email NOT IN ('nospisocial@gmail.com','johnatan365@hotmail.com','equipo@nospi.co')
  -- Solo web. Ver "La fuga por la app" abajo: sin esta linea el resultado sale
  -- diluido y no se nota por que.
  AND u.registered_from = 'web'
GROUP BY 1;
```

### La fuga por la app

La marca de la puerta 2 vive en el `localStorage` del **navegador**. La app nativa
es otro contenedor y no lo comparte. Si la persona entra por el anuncio y en vez de
seguir en web **instala la app**, llega sin la marca, `leerAtribucion()` devuelve
`solo_suscripcion: false`, y **ve el pago por evento**. Es decir: se pasa sola al
grupo de control.

Medido el 3 de septiembre de 2026, sobre 14 días:

| Origen | Registros | % | Sin atribución |
|---|---|---|---|
| Web | 450 | 75,8% | 137 |
| Android | 75 | 12,6% | 75 (todos) |
| iOS | 69 | 11,6% | 69 (todos) |

Uno de cada cuatro registros entra por app, y **ninguno** trae atribución, porque
los builds publicados en las tiendas son anteriores a `utils/atribucion.ts`.

Lo que importa entender: la fuga **solo va en una dirección**. Manda gente de la
puerta 2 al control, nunca al revés. Así que sesga *en contra* de encontrar un
efecto. Si la puerta 2 gana midiendo solo web, el resultado es más sólido de lo que
aparenta, no más frágil.

Mitigación puesta el 3 de septiembre: en `nospi-landing/tiktok-pixel.js`, a quien
entra con `?plan=sub` no se le muestran las insignias de App Store y Google Play.
No cierra el hueco (puede buscar la app por su cuenta), pero le quita el empujón.

El arreglo de verdad sería *deep linking* diferido, para que el parámetro sobreviva
a la instalación. En Android sale gratis con el Install Referrer de Play; en iOS
prácticamente exige un SDK pago (Branch, AppsFlyer). **No vale la pena para la
prueba** — solo si la puerta 2 gana y se quiere escalar.

Umbral de rentabilidad: la suscripción cuesta 1,99 veces el tiquete, así que la
puerta 2 gana si convierte a **más del 50%** de la tasa de la puerta normal.

Hace falta alrededor de **300 registros por rama** para que la diferencia
signifique algo — unas tres semanas al ritmo actual.
