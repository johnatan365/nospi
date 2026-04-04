
# Despliegue Web - Configuración de Rutas SPA

## Problema
La ruta `/admin` devuelve "Not Found" cuando se accede directamente desde el navegador en producción.

## Causa
Las aplicaciones SPA (Single Page Application) como Expo Router necesitan que el servidor web redirija todas las rutas a `index.html` para que el enrutador del lado del cliente pueda manejarlas.

## Solución

### 1. Construir la aplicación web
```bash
npx expo export -p web
```

Esto generará los archivos estáticos en la carpeta `dist/`.

### 2. Configuración según el hosting

#### **Netlify**
El archivo `netlify.toml` ya está configurado. Solo necesitas:
1. Conectar tu repositorio a Netlify
2. Configurar el comando de build: `npx expo export -p web`
3. Configurar el directorio de publicación: `dist`

#### **Vercel**
El archivo `vercel.json` ya está configurado. Solo necesitas:
1. Conectar tu repositorio a Vercel
2. Configurar el comando de build: `npx expo export -p web`
3. Configurar el directorio de salida: `dist`

#### **Apache (cPanel, hosting compartido)**
1. Sube el contenido de la carpeta `dist/` a tu servidor
2. Asegúrate de que el archivo `.htaccess` esté en la raíz
3. Verifica que `mod_rewrite` esté habilitado en Apache

#### **Nginx**
Agrega esta configuración a tu archivo de configuración de Nginx:

```nginx
server {
    listen 80;
    server_name nospi.natively.dev;
    root /path/to/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

#### **IIS (Windows Server)**
El archivo `web.config` ya está configurado. Solo necesitas:
1. Copiar el contenido de `dist/` a tu directorio web
2. Asegúrate de que el módulo URL Rewrite esté instalado en IIS

#### **Firebase Hosting**
Crea un archivo `firebase.json`:

```json
{
  "hosting": {
    "public": "dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

Luego despliega:
```bash
firebase deploy
```

#### **GitHub Pages**
GitHub Pages no soporta rewrites nativamente. Necesitas usar una solución alternativa:

1. Copia `dist/index.html` a `dist/404.html`
2. Configura el repositorio para usar GitHub Pages desde la carpeta `dist`

### 3. Verificación

Después del despliegue, verifica que las siguientes rutas funcionen:

- `https://nospi.natively.dev/` ✅
- `https://nospi.natively.dev/admin` ✅
- `https://nospi.natively.dev/login` ✅
- `https://nospi.natively.dev/event-details/123` ✅

## Archivos de Configuración Incluidos

- `public/_redirects` - Para Netlify
- `vercel.json` - Para Vercel
- `public/.htaccess` - Para Apache
- `web.config` - Para IIS
- `netlify.toml` - Para Netlify (alternativo)

## Notas Importantes

1. **Siempre reconstruye después de cambios**: Cada vez que modifiques rutas o componentes, debes ejecutar `npx expo export -p web` nuevamente.

2. **Limpia la caché**: Si los cambios no se reflejan, limpia la caché del navegador o usa modo incógnito.

3. **Verifica el archivo de configuración**: Asegúrate de que el archivo de configuración correcto esté en la raíz del directorio de publicación.

4. **Rutas dinámicas**: Las rutas como `/event-details/[id]` también funcionarán con esta configuración.

## Solución de Problemas

### La ruta `/admin` sigue mostrando 404
1. Verifica que el archivo de configuración correcto esté en el servidor
2. Verifica que el servidor web tenga habilitado el módulo de reescritura de URLs
3. Revisa los logs del servidor web para ver si hay errores
4. Asegúrate de que el directorio de publicación sea correcto (`dist`)

### Las rutas funcionan en desarrollo pero no en producción
1. Asegúrate de haber ejecutado `npx expo export -p web`
2. Verifica que hayas subido TODO el contenido de la carpeta `dist/`
3. Confirma que el archivo de configuración de rewrites esté presente

### Los assets (imágenes, fuentes) no cargan
1. Verifica que la ruta base sea correcta en `app.json`
2. Asegúrate de que todos los archivos de `dist/` se hayan subido
3. Revisa la configuración de CORS si los assets están en un CDN

## Comando Rápido de Despliegue

```bash
# 1. Construir
npx expo export -p web

# 2. Verificar que dist/ contiene index.html y assets
ls -la dist/

# 3. Subir a tu servidor (ejemplo con rsync)
rsync -avz dist/ usuario@servidor:/ruta/al/sitio/

# 4. Verificar que el archivo de configuración esté presente
# Para Netlify: netlify.toml o _redirects
# Para Vercel: vercel.json
# Para Apache: .htaccess
# Para Nginx: configuración en el archivo de sitio
```

## Contacto

Si sigues teniendo problemas después de seguir estos pasos, verifica:
1. Los logs del servidor web
2. La consola del navegador (F12) para errores de JavaScript
3. La pestaña Network para ver qué archivos no se están cargando
