import { Stack } from 'expo-router';
import React from 'react';

export default function AdminLayout() {
    return React.createElement(
          Stack,
      { screenOptions: { headerShown: false } },
          React.createElement(Stack.Screen, { name: 'index', options: { headerShown: false } }),
                      React.createElement(Stack.Screen, { name: 'promo-codes', options: { headerShown: true, title: 'Códigos promocionales' } }),
                    React.createElement(Stack.Screen, { name: 'stats', options: { headerShown: true, title: 'Estadísticas' } })
                );
}
