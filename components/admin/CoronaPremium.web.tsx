// Corona al lado del nombre de quien tiene suscripcion activa. Solo admin.
//
// Va como <span> con title porque asi sale el tooltip nativo del navegador al
// pasar el mouse (plan, vencimiento y si se renueva), igual que los iconos de
// plataforma de la tabla de Usuarios. Si la persona no es premium no pinta
// nada, ni un espacio: se puede poner al lado de cualquier nombre sin miedo.

import React from 'react';
import { useSuscriptoresActivos, describirSuscripcion } from '@/lib/suscriptoresActivos';

export default function CoronaPremium({ userId, size = 14 }: { userId?: string | null; size?: number }) {
  const subs = useSuscriptoresActivos();
  const info = userId ? subs.get(userId) : undefined;
  if (!info) return null;
  const texto = describirSuscripcion(info);
  return (
    <span
      title={texto}
      aria-label={texto}
      role="img"
      style={{ fontSize: size, marginLeft: 5, marginRight: 2, cursor: 'help', lineHeight: 1, flexShrink: 0 }}
    >
      👑
    </span>
  );
}
