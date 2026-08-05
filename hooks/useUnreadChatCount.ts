import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useSupabase } from '@/contexts/SupabaseContext';

/**
 * Devuelve el TOTAL de mensajes sin leer del usuario (suma de unread_count de
 * todas sus conversaciones), pensado para mostrar un contador en la pestaña de
 * Chat de la barra de navegación.
 *
 * Se mantiene al día de tres formas:
 *  - Al montar y cada vez que cambia el usuario.
 *  - En tiempo real: cuando entra un mensaje nuevo en cualquiera de mis
 *    conversaciones (INSERT en chat_messages, filtrado por RLS), refresca.
 *  - Al navegar (cambia el pathname): así, al salir de un chat que se acaba de
 *    leer, el contador se limpia de inmediato.
 */
export function useUnreadChatCount(): number {
  const { user } = useSupabase();
  const pathname = usePathname();
  const [total, setTotal] = useState(0);

  const fetchTotal = useCallback(async () => {
    if (!user?.id) {
      setTotal(0);
      return;
    }
    const { data, error } = await supabase.rpc('get_my_conversations');
    if (error) {
      console.error('useUnreadChatCount: error cargando conversaciones', error);
      return;
    }
    const sum = ((data as any[]) || []).reduce(
      (acc, c) => acc + (c.unread_count || 0),
      0
    );
    setTotal(sum);
  }, [user]);

  // Refrescar al montar, al cambiar de usuario y en cada navegación.
  useEffect(() => {
    fetchTotal();
  }, [fetchTotal, pathname]);

  // Tiempo real: mensajes nuevos → refrescar el contador.
  useEffect(() => {
    if (!user?.id) return;

    const channelName = `unread_badge_${user.id}`;
    const stale = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);
    if (stale) supabase.removeChannel(stale);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        () => fetchTotal()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchTotal]);

  return total;
}
