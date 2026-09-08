// Preferencias del perfil: qué se le pregunta a la persona y cómo se le explica.
//
// Existe este archivo porque profile.tsx y profile.ios.tsx son gemelos casi
// idénticos. Si la bandera y los textos viven en cada pantalla, tarde o
// temprano una se cambia y la otra no, y Android y iPhone terminan
// preguntando cosas distintas.

/**
 * ¿Se le muestra a la persona el campo "Interesado en" (hombres/mujeres/ambos)?
 *
 * HOY VA EN false, A PROPÓSITO. Es una prueba, no un borrado.
 *
 * El porqué, medido el 7 de septiembre de 2026: el perfil mostraba "Interesado
 * en" con un ícono de corazón y justo debajo "Rango de edad". Esa combinación
 * se lee como la ficha de una app de citas, y la gente llenaba el rango de edad
 * pensando que definía con quién la iban a emparejar. La prueba de que lo leían
 * así: de 2.508 personas con rango, 459 (18%) se excluían a sí mismas del rango
 * que pedían — alguien de 45 pedía "28 a 35". Nadie que describa su propia mesa
 * se deja por fuera de ella.
 *
 * Después llegaban a una cena de grupo, la mesa no era lo que el formulario
 * había insinuado, y la queja salía como "las edades no coinciden". La causa no
 * era la mesa: era el formulario.
 *
 * Y el campo NO SE USABA PARA NADA. Se preguntaba en el onboarding, se guardaba
 * en users.interested_in, se pintaba en el perfil, y no alimentaba el armado de
 * mesas ni ningún filtro. Se prometía un emparejamiento que nunca ocurría.
 *
 * QUÉ SE HIZO: ocultarlo, no borrarlo. La columna `users.interested_in` sigue
 * viva y los datos de las 2.500 personas siguen ahí. Solo dejó de preguntarse y
 * de mostrarse.
 *
 * CÓMO VOLVER A ACTIVARLO: poner esto en true. Vuelve a aparecer en el perfil y
 * en la edición, sin migración ni nada más. Si algún día Nospi sí empareja por
 * ese criterio, el campo está listo.
 *
 * ANTES DE ACTIVARLO, dos advertencias:
 *  1. Si se muestra, hay que usarlo de verdad para armar las mesas. Volver a
 *     preguntarlo sin cumplirlo reproduce exactamente el problema que esto
 *     buscaba arreglar.
 *  2. Si vuelve, que no quede pegado al rango de edad ni con el corazón. Esa
 *     vecindad visual es la que hacía leer el rango como filtro de citas.
 */
export const MOSTRAR_INTERESADO_EN = false;

/**
 * Ancho mínimo, en años, del rango de edad que alguien puede guardar.
 *
 * Un rango de 2 o 3 años no es una preferencia, es un accidente: en una mesa de
 * 6 personas es combinatoriamente imposible de cumplir. Al 7 de septiembre de
 * 2026 había 226 personas pidiendo 7 años o menos y 617 pidiendo 10 o menos.
 *
 * Esto solo aplica de aquí en adelante: los rangos angostos ya guardados NO se
 * tocaron. Ampliarle el rango a alguien por detrás sería decidir por esa
 * persona algo que ella eligió. Se le va a ir corrigiendo sola a medida que
 * cada quien vuelva a editar su perfil.
 */
export const ANCHO_MINIMO_RANGO_EDAD = 10;

/**
 * Cómo se le presenta el rango de edad.
 *
 * El nombre viejo era "Rango de edad", a secas, sin explicación. Nadie podía
 * adivinar para qué servía, y al lado del corazón la conclusión natural era la
 * equivocada. Ahora dice qué hace con él Nospi.
 *
 * Ojo con el texto de ayuda: describe el PROCESO ("armamos tu mesa buscando"),
 * nunca el resultado. Nospi no puede prometer que la mesa quede afín — depende
 * de quién más se inscriba esa semana — y prometerlo convertiría un problema de
 * suerte en una promesa rota, que es peor.
 */
export const ETIQUETA_RANGO_EDAD = 'Edades con las que te sientes cómodo';
export const AYUDA_RANGO_EDAD =
  'Lo usamos para armar tu mesa: entre más amplio, más probable que quedes con gente afín.';
