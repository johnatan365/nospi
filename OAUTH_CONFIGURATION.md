
# Configuración OAuth para Google y Apple en Supabase

Has habilitado Google y Apple OAuth en Supabase. Ahora necesitas completar la configuración con las URLs de redirección correctas.

## URLs de Redirección Requeridas

Debes agregar las siguientes URLs de redirección en la configuración de OAuth de Supabase:

### Para Desarrollo (Expo Go)
```
exp://192.168.x.x:8081/--/auth/callback
```
(Reemplaza `192.168.x.x` con tu dirección IP local que aparece cuando ejecutas `npm run dev`)

### Para Producción (App Compilada)
```
nospi://auth/callback
```

### Para Web
```
http://localhost:8081/auth/callback
https://tu-dominio.com/auth/callback
```

## Pasos de Configuración en Supabase

### 1. Google OAuth

1. Ve a tu proyecto en Supabase Dashboard
2. Navega a **Authentication** → **Providers** → **Google**
3. Asegúrate de que esté **Enabled** (habilitado)
4. En **Authorized redirect URIs**, agrega:
   - `https://wjdiraurfbawotlcndmk.supabase.co/auth/v1/callback`
   - `nospi://auth/callback`
   - `exp://192.168.x.x:8081/--/auth/callback` (para desarrollo)
5. Guarda los cambios

### 2. Apple OAuth

1. Ve a tu proyecto en Supabase Dashboard
2. Navega a **Authentication** → **Providers** → **Apple**
3. Asegúrate de que esté **Enabled** (habilitado)
4. En **Authorized redirect URIs**, agrega:
   - `https://wjdiraurfbawotlcndmk.supabase.co/auth/v1/callback`
   - `nospi://auth/callback`
   - `exp://192.168.x.x:8081/--/auth/callback` (para desarrollo)
5. Guarda los cambios

## Configuración de Google Cloud Console

Para que Google OAuth funcione, también necesitas configurar tu proyecto en Google Cloud Console:

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Selecciona tu proyecto o crea uno nuevo
3. Navega a **APIs & Services** → **Credentials**
4. Crea o edita tu **OAuth 2.0 Client ID**
5. En **Authorized redirect URIs**, agrega:
   - `https://wjdiraurfbawotlcndmk.supabase.co/auth/v1/callback`
   - `nospi://auth/callback`
6. Copia el **Client ID** y **Client Secret**
7. Pega estos valores en la configuración de Google OAuth en Supabase

## Configuración de Apple Developer

Para que Apple OAuth funcione, necesitas configurar tu app en Apple Developer:

1. Ve a [Apple Developer](https://developer.apple.com/)
2. Navega a **Certificates, Identifiers & Profiles**
3. Crea o edita tu **App ID**
4. Habilita **Sign in with Apple**
5. Crea un **Service ID** para tu app web
6. En **Return URLs**, agrega:
   - `https://wjdiraurfbawotlcndmk.supabase.co/auth/v1/callback`
7. Copia el **Service ID**, **Team ID**, y **Key ID**
8. Pega estos valores en la configuración de Apple OAuth en Supabase

## Verificación

Para verificar que todo está configurado correctamente:

1. Ejecuta la app: `npm run dev`
2. Navega a la pantalla de registro o login
3. Toca el botón "Regístrate con Google" o "Regístrate con Apple"
4. Deberías ver una ventana del navegador que te pide autorización
5. Después de autorizar, deberías ser redirigido de vuelta a la app
6. La app debería crear tu perfil automáticamente y llevarte a la pantalla de eventos

## Solución de Problemas

### Error: "Unsupported provider: provider is not enabled"
- Verifica que el proveedor esté habilitado en Supabase Dashboard
- Asegúrate de haber guardado los cambios en la configuración

### Error: "redirect_uri_mismatch"
- Verifica que las URLs de redirección coincidan exactamente en:
  - Supabase Dashboard
  - Google Cloud Console (para Google)
  - Apple Developer (para Apple)
  - El código de la app (`nospi://auth/callback`)

### El navegador se abre pero no redirige de vuelta
- Verifica que el `scheme` en `app.json` sea `"nospi"` (sin espacios)
- Asegúrate de que `expo-web-browser` esté instalado
- Verifica que `WebBrowser.maybeCompleteAuthSession()` esté llamado al inicio del componente

### La app no detecta la sesión después de OAuth
- Verifica que el listener de URL esté configurado correctamente
- Revisa los logs de la consola para ver si hay errores
- Asegúrate de que `SupabaseContext` esté escuchando cambios de autenticación

## Logs Útiles

La app ahora incluye logs detallados para ayudarte a depurar:

- `RegisterScreen: Setting up OAuth callback listener` - Listener configurado
- `RegisterScreen: Google/Apple OAuth redirect URL: ...` - URL de redirección generada
- `RegisterScreen: Opening Google/Apple OAuth URL` - Navegador abierto
- `RegisterScreen: Received URL callback: ...` - Callback recibido
- `RegisterScreen: OAuth session established, user: ...` - Sesión creada exitosamente

Revisa estos logs en la consola de Expo para diagnosticar problemas.

## Notas Importantes

1. **Desarrollo vs Producción**: Las URLs de redirección son diferentes en desarrollo (Expo Go) y producción (app compilada). Asegúrate de configurar ambas.

2. **Deep Linking**: El esquema `nospi://` está configurado en `app.json` y debe coincidir con las URLs de redirección.

3. **Perfiles Automáticos**: La app ahora crea automáticamente un perfil básico para usuarios OAuth si no existe uno. Los datos del onboarding se usan si están disponibles.

4. **Sesión Persistente**: Supabase guarda la sesión en `AsyncStorage`, por lo que los usuarios permanecen autenticados entre sesiones.

## Próximos Pasos

1. Completa la configuración en Supabase Dashboard
2. Configura Google Cloud Console (para Google OAuth)
3. Configura Apple Developer (para Apple OAuth)
4. Prueba el flujo completo de registro/login con ambos proveedores
5. Verifica que los perfiles se creen correctamente en la tabla `users`
