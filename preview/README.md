# Pruebas aisladas de preferencias

Rama de trabajo: `preview/preferencias-edad`, basada en `7e05ef0`.

## Alcance

El servidor importa las pantallas reales `age-range`, `age-fallback` y `location`, con React Native Web y el Slider instalado de la app. Sustituye únicamente el router y la analítica para aislar el recorrido. El resto del registro, catálogo y pago son fixtures explícitos, no una prueba integral de esos servicios.

La migración se verifica sobre PostgreSQL embebido (PGlite). Guarda únicamente datos ficticios en `.preview-data`. No importa Supabase, Sentry, la raíz de Expo ni los píxeles del sitio. El servidor solo escucha en `127.0.0.1`; una política CSP restringe las conexiones al mismo origen.

## Ejecución

Con las dependencias del repositorio instaladas:

```sh
npm install --prefix preview
node preview/serve.cjs
```

Abrir http://127.0.0.1:4173 en este computador. El servidor debe seguir ejecutándose. Para este entorno de Codex las herramientas ya están instaladas en `../preview-tools/node_modules`.

Pruebas:

```sh
node preview/test.cjs
npx --prefix preview playwright install chromium
node preview/browser-test.cjs
```

Puede indicarse `NOSPI_PREVIEW_TOOLS` para otra carpeta de herramientas y `NOSPI_PLAYWRIGHT` para otra instalación de Playwright. `PLAYWRIGHT_BROWSERS_PATH` permite elegir la carpeta del navegador.

## Verificado

- Extremos de las barras, mínimo de 10 años y rango permitido de 18 a 60.
- Confirmación inicialmente desmarcada y reiniciada al mover una barra.
- Aviso al quedar la edad propia fuera del rango.
- Elección explícita de asistir o aplazar; paso directo a ubicación.
- Persistencia de ambas respuestas en PostgreSQL local; usuarios antiguos quedan con respuesta nula.
- Pruebas de navegador de 360 y 736 px, sin solicitudes externas ni errores JavaScript.
- Compilación web de Expo exitosa. TypeScript conserva los diagnósticos preexistentes de main, sin diagnósticos nuevos.

## Antes de publicar

NO publicar la exportación `.preview-build`: usa la configuración existente de la app. No se modificaron pagos ni conexiones de producción.

La creación de rama Supabase fue rechazada por el plan actual (requiere Pro). No se creó una rama ni se cambió el plan. Falta un entorno Supabase separado para probar Auth, RLS, registro real de correo/Google/Apple y edición de perfil de punta a punta; también falta comprobar iOS/Android nativos. No ejecutar la migración contra producción antes de aprobar y completar esas pruebas.

El cambio almacena la preferencia. NO mueve reservas ni envía avisos automáticamente. La operación de aplazar y avisar al menos un día antes debe resolverse antes de habilitar esta promesa a usuarios reales.
