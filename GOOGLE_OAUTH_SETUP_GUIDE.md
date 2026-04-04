
# 🔐 Guía Completa: Configurar Google OAuth en tu App Nospi

Esta guía te explica **paso a paso** cómo configurar el inicio de sesión con Google en tu aplicación.

---

## 📋 **PARTE 1: LO QUE TÚ DEBES HACER (Configuración Externa)**

### **Paso 1: Configurar Google Cloud Console** ☁️

1. **Ir a Google Cloud Console**
   - Abre tu navegador y ve a: https://console.cloud.google.com/
   - Inicia sesión con tu cuenta de Google

2. **Crear o Seleccionar un Proyecto**
   - En la parte superior, haz clic en el selector de proyectos
   - Si no tienes un proyecto, haz clic en "Nuevo Proyecto"
   - Dale un nombre (ejemplo: "Nospi App")
   - Haz clic en "Crear"

3. **Configurar la Pantalla de Consentimiento OAuth**
   - En el menú lateral, ve a: **"APIs y servicios"** → **"Pantalla de consentimiento de OAuth"**
   - Selecciona **"Externo"** como tipo de usuario
   - Haz clic en "Crear"
   - Completa el formulario:
     - **Nombre de la aplicación**: Nospi
     - **Correo electrónico de asistencia**: Tu correo
     - **Logotipo de la aplicación**: (Opcional) Sube tu logo
     - **Dominios autorizados**: Deja en blanco por ahora
     - **Correo electrónico del desarrollador**: Tu correo
   - Haz clic en "Guardar y continuar"

4. **Agregar Scopes (Permisos)**
   - En la sección "Scopes", haz clic en "Agregar o quitar scopes"
   - Busca y selecciona:
     - ✅ `userinfo.email`
     - ✅ `userinfo.profile`
   - Haz clic en "Actualizar"
   - Haz clic en "Guardar y continuar"

5. **Usuarios de prueba** (Opcional durante desarrollo)
   - Si tu app está en modo "Testing", agrega correos de prueba
   - Haz clic en "Guardar y continuar"

6. **Crear Credenciales OAuth**
   - En el menú lateral, ve a: **"APIs y servicios"** → **"Credenciales"**
   - Haz clic en **"+ Crear credenciales"** → **"ID de cliente de OAuth"**
   - Selecciona **"Aplicación web"** como tipo de aplicación
   - Dale un nombre (ejemplo: "Nospi Web Client")
   - **IMPORTANTE**: En "URIs de redireccionamiento autorizados", agrega la URL de Supabase (la obtendrás en el Paso 2)
   - Por ahora, deja este paso abierto y continúa al Paso 2

---

### **Paso 2: Configurar Supabase** 🗄️

1. **Ir al Dashboard de Supabase**
   - Abre tu navegador y ve a: https://supabase.com/dashboard
   - Inicia sesión con tu cuenta

2. **Seleccionar tu Proyecto**
   - Haz clic en tu proyecto "Nospi" (ID: `wjdiraurfbawotlcndmk`)

3. **Ir a la Configuración de Autenticación**
   - En el menú lateral, ve a: **"Authentication"** → **"Providers"**
   - Busca **"Google"** en la lista de proveedores

4. **Copiar la Redirect URL de Supabase**
   - Verás un campo llamado **"Redirect URL"** o **"Callback URL"**
   - Copia esta URL completa (se verá algo así):
     ```
     https://wjdiraurfbawotlcndmk.supabase.co/auth/v1/callback
     ```
   - **GUARDA ESTA URL** - la necesitarás en el siguiente paso

5. **Volver a Google Cloud Console**
   - Regresa a la pestaña de Google Cloud Console (Paso 1, punto 6)
   - En "URIs de redireccionamiento autorizados", haz clic en **"+ Agregar URI"**
   - **Pega la URL de Supabase** que copiaste
   - Haz clic en "Crear"

6. **Copiar las Credenciales de Google**
   - Después de crear el cliente OAuth, verás una ventana con:
     - **Client ID** (ID de cliente)
     - **Client Secret** (Secreto de cliente)
   - **COPIA AMBOS** - los necesitarás ahora

7. **Configurar Google en Supabase**
   - Vuelve a Supabase (pestaña del Paso 2, punto 3)
   - En la configuración del proveedor de Google:
     - **Habilita** el toggle de Google (actívalo)
     - **Pega el Client ID** de Google
     - **Pega el Client Secret** de Google
   - Haz clic en **"Save"** o **"Guardar"**

8. **Habilitar la API de People** (Importante)
   - Vuelve a Google Cloud Console
   - En el menú lateral, ve a: **"APIs y servicios"** → **"Biblioteca"**
   - Busca **"Google People API"**
   - Haz clic en ella y luego en **"Habilitar"**

---

### **Paso 3: Verificar app.json** 📱

1. **Abrir tu proyecto en el editor**
   - Ya está configurado, pero verifica que `app.json` tenga:
   ```json
   {
     "expo": {
       "scheme": "nospi"
     }
   }
   ```
   - Este `scheme` es necesario para que el OAuth funcione en la app móvil

---

## ✅ **PARTE 2: LO QUE YA ESTÁ IMPLEMENTADO (Código)**

Ya he implementado todo el código necesario en tu app:

### **Archivos Actualizados:**

1. **`app/login.tsx`**
   - ✅ Botón de "Iniciar sesión con Google"
   - ✅ Manejo del flujo OAuth con `expo-web-browser`
   - ✅ Redirección automática después del login
   - ✅ Creación automática de perfil si no existe

2. **`app/onboarding/register.tsx`**
   - ✅ Botón de "Registrarse con Google"
   - ✅ Manejo del flujo OAuth con `expo-web-browser`
   - ✅ Creación de perfil con datos de Google (nombre, foto, email)
   - ✅ Integración con datos de onboarding guardados

3. **`lib/supabase.ts`**
   - ✅ Cliente de Supabase configurado correctamente
   - ✅ Persistencia de sesión con AsyncStorage

---

## 🧪 **PARTE 3: CÓMO PROBAR QUE FUNCIONA**

### **Prueba 1: Registro con Google**
1. Abre tu app
2. Ve a la pantalla de registro
3. Toca el botón **"Regístrate con Google"**
4. Se abrirá un navegador con la pantalla de Google
5. Selecciona tu cuenta de Google
6. Acepta los permisos
7. Deberías ser redirigido a la app y ver la pantalla de eventos

### **Prueba 2: Login con Google**
1. Cierra sesión en tu app
2. Ve a la pantalla de login
3. Toca el botón **"Iniciar sesión con Google"**
4. Se abrirá un navegador con la pantalla de Google
5. Selecciona tu cuenta de Google
6. Deberías ser redirigido a la app y ver la pantalla de eventos

---

## 🐛 **SOLUCIÓN DE PROBLEMAS COMUNES**

### **Error: "Error al conectar con Google"**
- ✅ Verifica que habilitaste el proveedor de Google en Supabase
- ✅ Verifica que copiaste correctamente el Client ID y Client Secret
- ✅ Verifica que agregaste la Redirect URL de Supabase en Google Cloud Console

### **Error: "redirect_uri_mismatch"**
- ✅ La Redirect URL en Google Cloud Console debe ser EXACTAMENTE igual a la de Supabase
- ✅ No debe tener espacios ni caracteres extra
- ✅ Debe incluir `https://` al inicio

### **El navegador se abre pero no regresa a la app**
- ✅ Verifica que `app.json` tenga el `scheme: "nospi"` configurado
- ✅ Reinicia la app después de cambiar `app.json`

### **Error: "Access blocked: This app's request is invalid"**
- ✅ Verifica que habilitaste la "Google People API" en Google Cloud Console
- ✅ Verifica que agregaste los scopes `userinfo.email` y `userinfo.profile`

---

## 📝 **RESUMEN DE LO QUE DEBES HACER**

1. ✅ Configurar Google Cloud Console (Paso 1)
2. ✅ Configurar Supabase con las credenciales de Google (Paso 2)
3. ✅ Habilitar Google People API (Paso 2, punto 8)
4. ✅ Verificar que `app.json` tenga el scheme configurado (Paso 3)
5. ✅ Probar el login/registro con Google (Parte 3)

---

## 🎉 **¡Listo!**

Una vez que completes los pasos 1-4, el login con Google debería funcionar perfectamente en tu app. El código ya está implementado y listo para usar.

Si tienes algún problema, revisa la sección de "Solución de Problemas" o avísame y te ayudo a resolverlo.

---

**Nota**: Este proceso es el mismo para iOS, Android y Web. El código que implementé funciona en todas las plataformas automáticamente.
