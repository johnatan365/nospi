// Version nativa de la corona premium. El admin de verdad es el de web
// (CoronaPremium.web.tsx, con tooltip); esta existe para que el mismo import
// no rompa si algun dia se usa desde una pantalla nativa.

import React from 'react';
import { Text } from 'react-native';
import { useSuscriptoresActivos, describirSuscripcion } from '@/lib/suscriptoresActivos';

export default function CoronaPremium({ userId, size = 14 }: { userId?: string | null; size?: number }) {
  const subs = useSuscriptoresActivos();
  const info = userId ? subs.get(userId) : undefined;
  if (!info) return null;
  return (
    <Text accessibilityLabel={describirSuscripcion(info)} style={{ fontSize: size, marginLeft: 5 }}>
      👑
    </Text>
  );
}
