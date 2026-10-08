// Mi propio ajuste de privacidad, para las pantallas que lo necesitan.
//
// POR QUE ES UN HOOK Y NO UNA COPIA EN CADA PANTALLA
// Estaba escrito cuatro veces --el chat, la lista de chats, la dinamica y el
// perfil-- y eso fue justo lo que dejo pasar la fuga: cada copia miraba el
// ajuste una vez al montarse y ninguna volvia a preguntar. Mismo motivo por el
// que constants/Privacidad.ts vive aparte (ver el comentario de ese archivo).
//
// DOS DECISIONES QUE PARECEN DETALLES Y NO LO SON
//
//   · Se vuelve a preguntar AL ENFOCAR la pantalla. Sin esto, apagar el
//     interruptor en el perfil no llegaba a la pestaña de chats: las pestañas
//     no se desmontan, asi que se quedaba con el valor viejo --encendido-- y
//     seguia anunciando hasta cerrar la app. Es una fila, no duele.
//   · Si la consulta falla, `cargada` se queda en false y no se anuncia nada.
//     Al contrario que para PINTAR la pantalla --donde ante la duda se deja
//     encendido, que es el valor de las columnas--, para ANUNCIARSE ante la
//     duda hay que callar: equivocarse hacia "visible" es la fuga.

import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from './supabase';
import { normalizarPrivacidad, type Privacidad } from '@/constants/Privacidad';

export interface MiPrivacidad {
  /** Para pintar. Ante la duda, encendido. */
  privacidad: Privacidad;
  /** Si ya se sabe de verdad lo que dice la base. */
  cargada: boolean;
  /**
   * El valor que se le pasa a la presencia: `null` mientras no se sepa.
   * Pasar `false` por no saber tampoco serviria -- se veria "nadie en linea".
   */
  enLineaParaAnunciar: boolean | null;
}

export function useMiPrivacidad(userId: string | null | undefined): MiPrivacidad {
  const [privacidad, setPrivacidad] = useState(normalizarPrivacidad(null));
  const [cargada, setCargada] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!userId) { setCargada(false); return; }
      let vivo = true;
      supabase
        .from('users')
        .select('mostrar_en_linea, mostrar_ultima_vez')
        .eq('id', userId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!vivo || error || !data) return;   // sin dato no se anuncia
          setPrivacidad(normalizarPrivacidad(data));
          setCargada(true);
        });
      return () => { vivo = false; };
    }, [userId]),
  );

  return {
    privacidad,
    cargada,
    enLineaParaAnunciar: cargada ? privacidad.enLinea : null,
  };
}
