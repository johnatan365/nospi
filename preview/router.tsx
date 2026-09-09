import React, { createContext, useContext, useEffect } from 'react';
export const RouteContext = createContext({ push: (_path: string) => {}, replace: (_path: string) => {} });
export function useRouter() { return useContext(RouteContext); }
export function useFocusEffect(callback: () => void | (() => void)) { useEffect(callback, [callback]); }
