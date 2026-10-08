// Diccionario de textos de Nospi en español e ingles.
//
// Reglas al agregar textos:
//   - La clave se nombra pantalla.loQueEs  (ej: 'login.entrar')
//   - Si falta la traduccion en ingles, la app muestra el español. No se rompe.
//   - Las variables van como {{nombre}} y se pasan en el segundo argumento:
//       t('detalle.disponibleALas', { hora: '7:00 PM' })
//   - El ingles NO es traduccion literal: esta escrito como lo diria un gringo.

import type { Idioma } from '@/lib/i18n';

export const TEXTOS: Record<Idioma, Record<string, string>> = {
  es: {
    // ---------- Comunes ----------
    'comun.atras': 'Atrás',
    'comun.cancelar': 'Cancelar',
    'comun.aceptar': 'Aceptar',
    'comun.continuar': 'Continuar',
    'comun.cerrar': 'Cerrar',
    'comun.error': 'Error',
    'comun.errorInesperado': 'Ocurrió un error inesperado. Por favor, intenta de nuevo.',
    'comun.cargando': 'Cargando...',
    'comun.reintentar': 'Reintentar',
    'comun.faltaUnPaso': 'Falta un paso',

    // ---------- Tipos de evento ----------
    'evento.tipo.bar': 'Bar',
    'evento.tipo.caminata': 'Caminata',
    'evento.tipo.cafe': 'Café',
    'evento.tipo.bolos': 'Bolos',
    'evento.tipo.virtual': 'Videollamada',
    'evento.tipo.restaurante': 'Restaurante',

    // ---------- Login ----------
    'login.subtituloEntrar': 'Inicia sesión para continuar',
    'login.subtituloCrear': 'Únete a Nospi',
    'login.botonEntrar': 'Iniciar sesión',
    'login.botonCrear': 'Crear cuenta',
    'login.cambiarAEntrar': '¿Ya tienes cuenta? Inicia sesión',
    'login.cambiarACrear': '¿No tienes cuenta? Regístrate',
    'login.contrasena': 'Contraseña',
    'login.olvidasteContrasena': '¿Olvidaste tu contraseña?',
    'login.faltaEmailOContrasena': 'Por favor ingresa tu email y contraseña',
    'login.credencialesMalas': 'Email o contraseña incorrectos',
    'login.errorEntrar': 'Error al iniciar sesión',
    'login.errorEntrarReintenta': 'Error al iniciar sesión. Intenta de nuevo.',
    'login.errorCrearReintenta': 'Error al crear cuenta. Intenta de nuevo.',
    'login.cuentaNoExiste': 'No encontramos una cuenta registrada con este método. Por favor regístrate primero.',
    'login.cuentaYaExiste': 'Esta cuenta ya está registrada. Inicia sesión directamente.',
    'login.contrasenaInvalida': 'Esa contraseña no es válida. Usa al menos 8 caracteres.',
    'login.contrasenaCorta': 'Tu contraseña es muy corta. Usa al menos 8 caracteres.',
    'login.canceladoApple': 'Inicio de sesión cancelado',
    'login.errorApple': 'Error al iniciar sesión con Apple',
    'login.errorGoogle': 'Error al iniciar sesión con Google',

    // ---------- Recuperar contraseña ----------
    'recuperar.titulo': '¿Olvidaste tu contraseña?',
    'recuperar.volverAEntrar': 'Volver a iniciar sesión',

    // ---------- Lista de eventos ----------
    'eventos.estaSemana': 'Esta semana',
    'eventos.proximaSemana': 'La próxima semana',
    'eventos.enDosSemanas': 'En 2 semanas',
    'eventos.masAdelante': 'Más adelante',
    'eventos.sinFecha': 'Fecha sin definir',
    'eventos.cambiarCiudad': '¿No es tu ciudad? Cámbiala en tu perfil',
    'eventos.elegirCiudad': 'Elige tu ciudad en tu perfil',
    'eventos.ubicacionUnDiaAntes': 'Ubicación se revelará un día antes',

    // ---------- Detalle del evento ----------
    'detalle.titulo': 'Detalles del Evento',
    'detalle.deseasAsistir': '¿Deseas asistir?',
    'detalle.videollamada': '🎥 Videollamada',
    'detalle.ubicacion': '📍 Ubicación',
    'detalle.irALaDinamica': 'Ir a la Dinámica',
    'detalle.yaEstasInscrito': '✓ Ya estás inscrito',
    'detalle.reservado': '✦ ¡RESERVADO! ✦',
    'detalle.cupoAsegurado': 'Tu cupo está asegurado 🎉',
    'detalle.ubicacionLaEnviamos': 'Te enviaremos la ubicación un día antes',
    'detalle.disponibleALas': 'Disponible a las {{hora}}',
    'detalle.disponibleElDia': 'Disponible el día del evento',
    'detalle.verPoliticaCompleta': 'Ver política completa',
    'detalle.aceptoBolos': 'Leí que la pista y los zapatos se pagan aparte, directamente en la bolera.',
    'detalle.aceptoGeneral': 'Leí la información anterior y acepto participar bajo mi propia responsabilidad.',

    // ---------- Mis citas ----------
    'citas.elegirConQuienConecte': '💘 Elegir con quién conecté',
    'citas.ubicacionUnDiaAntes': 'Ubicación se revelará un día antes del evento',
    'citas.cancelarCita': '¿Cancelar Cita?',
    'citas.siCancelar': 'Sí, cancelar',

    // ---------- Pago ----------
    'pago.verificandoSuscripcion': 'Verificando tu suscripción...',
    'pago.suscripcionActivada': '¡Suscripción activada!',
    'pago.enVerificacion': 'Tu pago sigue en verificación. Te confirmaremos apenas se complete.',
    'pago.errorVerificando': 'Error verificando tu suscripción.',
    'pago.transaccionNoEncontrada': 'No se encontró la transacción.',
    'pago.expiro': 'El pago expiró.',
    'pago.aprobado': '¡Pago aprobado! Confirmando asistencia...',
    'pago.seProcesaAutomaticamente': 'Tu pago se procesará automáticamente',

    // ---------- Títulos del onboarding ----------
    'onboarding.gustos': 'Tus Gustos',
    'onboarding.nombre': 'Tu Nombre',
    'onboarding.fechaNacimiento': 'Fecha de Nacimiento',
    'onboarding.genero': 'Tu Género',
    'onboarding.intereses': 'Intereses',
    'onboarding.edades': 'Edades',
    'onboarding.ubicacion': 'Ubicación',
    'onboarding.compatibilidad': 'Compatibilidad',
    'onboarding.telefono': 'Teléfono',
    'onboarding.foto': 'Foto de Perfil',
    'onboarding.registro': 'Registro',

    // ---------- Idioma de la mesa ----------
    'mesaIdioma.pregunta': '¿En qué idiomas estás dispuesto a hablar en la mesa?',
    'mesaIdioma.explicacion': 'Te sentamos con gente que escogió lo mismo. Puedes marcar los dos.',
    'mesaIdioma.espanol': 'Español',
    'mesaIdioma.ingles': 'Inglés',
    'mesaIdioma.inglesSub': 'Mesa con gente de afuera',
    'mesaIdioma.tuCupo': 'Tu cupo',
    'mesaIdioma.escogeUno': 'Escoge al menos un idioma para continuar.',

    // ---------- Zona preferida ----------
    'zona.pregunta': '¿En qué zona te gustaría?',
    'zona.explicacion': 'Marca todas las que te sirvan.',
    'zona.aviso': 'Esto no define dónde será el evento. Nos sirve para saber a qué zonas abrir más adelante.',
    'zona.poblado': 'El Poblado',
    'zona.pobladoSub': 'La mayoría de las cenas',
    'zona.laureles': 'Laureles',
    'zona.laurelesSub': 'Cafés y bolos',
    'zona.envigado': 'Envigado',
    'zona.otra': 'Otra',
    'zona.otraSub': 'Dinos cuál',
    'zona.otraPlaceholder': '¿Cuál? Escríbela',

    // ---------- Selector de idioma ----------
    'idioma.titulo': 'Idioma',
    'idioma.espanol': 'Español',
    'idioma.ingles': 'English',
  },

  en: {
    // ---------- Comunes ----------
    'comun.atras': 'Back',
    'comun.cancelar': 'Cancel',
    'comun.aceptar': 'OK',
    'comun.continuar': 'Continue',
    'comun.cerrar': 'Close',
    'comun.error': 'Error',
    'comun.errorInesperado': 'Something went wrong. Please try again.',
    'comun.cargando': 'Loading...',
    'comun.reintentar': 'Try again',
    'comun.faltaUnPaso': 'One more step',

    // ---------- Tipos de evento ----------
    'evento.tipo.bar': 'Bar',
    'evento.tipo.caminata': 'Hike',
    'evento.tipo.cafe': 'Coffee',
    'evento.tipo.bolos': 'Bowling',
    'evento.tipo.virtual': 'Video call',
    'evento.tipo.restaurante': 'Dinner',

    // ---------- Login ----------
    'login.subtituloEntrar': 'Sign in to continue',
    'login.subtituloCrear': 'Join Nospi',
    'login.botonEntrar': 'Sign in',
    'login.botonCrear': 'Create account',
    'login.cambiarAEntrar': 'Already have an account? Sign in',
    'login.cambiarACrear': "Don't have an account? Sign up",
    'login.contrasena': 'Password',
    'login.olvidasteContrasena': 'Forgot your password?',
    'login.faltaEmailOContrasena': 'Please enter your email and password',
    'login.credencialesMalas': 'Wrong email or password',
    'login.errorEntrar': 'Could not sign you in',
    'login.errorEntrarReintenta': "Couldn't sign you in. Please try again.",
    'login.errorCrearReintenta': "Couldn't create your account. Please try again.",
    'login.cuentaNoExiste': "We couldn't find an account using this method. Please sign up first.",
    'login.cuentaYaExiste': 'This account already exists. Just sign in.',
    'login.contrasenaInvalida': "That password won't work. Use at least 8 characters.",
    'login.contrasenaCorta': 'Your password is too short. Use at least 8 characters.',
    'login.canceladoApple': 'Sign-in cancelled',
    'login.errorApple': 'Could not sign in with Apple',
    'login.errorGoogle': 'Could not sign in with Google',

    // ---------- Recuperar contraseña ----------
    'recuperar.titulo': 'Forgot your password?',
    'recuperar.volverAEntrar': 'Back to sign in',

    // ---------- Lista de eventos ----------
    'eventos.estaSemana': 'This week',
    'eventos.proximaSemana': 'Next week',
    'eventos.enDosSemanas': 'In 2 weeks',
    'eventos.masAdelante': 'Later on',
    'eventos.sinFecha': 'Date to be confirmed',
    'eventos.cambiarCiudad': 'Not your city? Change it in your profile',
    'eventos.elegirCiudad': 'Pick your city in your profile',
    'eventos.ubicacionUnDiaAntes': 'Location revealed the day before',

    // ---------- Detalle del evento ----------
    'detalle.titulo': 'Event details',
    'detalle.deseasAsistir': 'Want to join?',
    'detalle.videollamada': '🎥 Video call',
    'detalle.ubicacion': '📍 Location',
    'detalle.irALaDinamica': 'Go to the icebreaker',
    'detalle.yaEstasInscrito': "✓ You're in",
    'detalle.reservado': '✦ BOOKED! ✦',
    'detalle.cupoAsegurado': 'Your spot is saved 🎉',
    'detalle.ubicacionLaEnviamos': "We'll send you the location the day before",
    'detalle.disponibleALas': 'Available at {{hora}}',
    'detalle.disponibleElDia': 'Available on the day of the event',
    'detalle.verPoliticaCompleta': 'Read the full policy',
    'detalle.aceptoBolos': 'I read that the lane and the shoes are paid separately, directly at the bowling alley.',
    'detalle.aceptoGeneral': 'I read the information above and I take part at my own responsibility.',

    // ---------- Mis citas ----------
    'citas.elegirConQuienConecte': '💘 Pick who you clicked with',
    'citas.ubicacionUnDiaAntes': 'Location revealed the day before the event',
    'citas.cancelarCita': 'Cancel this booking?',
    'citas.siCancelar': 'Yes, cancel',

    // ---------- Pago ----------
    'pago.verificandoSuscripcion': 'Checking your subscription...',
    'pago.suscripcionActivada': 'Subscription active!',
    'pago.enVerificacion': "Your payment is still being checked. We'll confirm as soon as it goes through.",
    'pago.errorVerificando': 'Something went wrong checking your subscription.',
    'pago.transaccionNoEncontrada': 'Transaction not found.',
    'pago.expiro': 'The payment expired.',
    'pago.aprobado': 'Payment approved! Confirming your spot...',
    'pago.seProcesaAutomaticamente': 'Your payment will go through automatically',

    // ---------- Títulos del onboarding ----------
    'onboarding.gustos': 'Your interests',
    'onboarding.nombre': 'Your name',
    'onboarding.fechaNacimiento': 'Date of birth',
    'onboarding.genero': 'Your gender',
    'onboarding.intereses': 'Looking for',
    'onboarding.edades': 'Ages',
    'onboarding.ubicacion': 'Location',
    'onboarding.compatibilidad': 'Compatibility',
    'onboarding.telefono': 'Phone',
    'onboarding.foto': 'Profile photo',
    'onboarding.registro': 'Sign up',

    // ---------- Idioma de la mesa ----------
    'mesaIdioma.pregunta': 'Which languages are you up for at the table?',
    'mesaIdioma.explicacion': 'We seat you with people who picked the same. You can pick both.',
    'mesaIdioma.espanol': 'Spanish',
    'mesaIdioma.ingles': 'English',
    'mesaIdioma.inglesSub': 'Table with locals who speak it',
    'mesaIdioma.tuCupo': 'Your seat',
    'mesaIdioma.escogeUno': 'Pick at least one language to continue.',

    // ---------- Zona preferida ----------
    'zona.pregunta': 'Which area would you like?',
    'zona.explicacion': 'Tick every one that works for you.',
    'zona.aviso': "This doesn't decide where the event will be. It tells us which areas to open next.",
    'zona.poblado': 'El Poblado',
    'zona.pobladoSub': 'Most dinners happen here',
    'zona.laureles': 'Laureles',
    'zona.laurelesSub': 'Coffee and bowling',
    'zona.envigado': 'Envigado',
    'zona.otra': 'Somewhere else',
    'zona.otraSub': 'Tell us where',
    'zona.otraPlaceholder': 'Which one? Type it',

    // ---------- Selector de idioma ----------
    'idioma.titulo': 'Language',
    'idioma.espanol': 'Español',
    'idioma.ingles': 'English',
  },
};
