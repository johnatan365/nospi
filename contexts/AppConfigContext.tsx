import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getAppConfig, invalidateAppConfigCache, AppConfig } from '@/utils/appConfig';

interface AppConfigContextValue {
  appConfig: AppConfig;
  loading: boolean;
  refreshConfig: () => Promise<void>;
}

const DEFAULT_CONFIG: AppConfig = {
  event_price: '30000',
  subscription_price: '29900',
  support_email: 'soporte@nospi.app',
  support_whatsapp: '573192099123',
  test_payment_enabled: 'false',
};

const AppConfigContext = createContext<AppConfigContextValue>({
  appConfig: DEFAULT_CONFIG,
  loading: true,
  refreshConfig: async () => {},
});

// Guard a nivel de módulo: en algunas cargas en frío se observó que el árbol
// raíz de la app se monta dos veces, lo que duplicaba la petición inicial a
// app_config (dos SELECT idénticos a Supabase en cada carga). Este guard
// hace que, sin importar cuántas veces se monte el provider, la carga
// inicial real solo se dispare una vez — todas las instancias comparten la
// misma promesa en vuelo y actualizan su propio estado cuando resuelve.
let inFlightInitialLoad: Promise<AppConfig> | null = null;

export function AppConfigProvider({ children }: { children: React.ReactNode }) {
  const [appConfig, setAppConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  const loadConfig = useCallback(async (force = false) => {
    console.log('[AppConfigContext] Loading app config, force:', force);
    setLoading(true);
    try {
      if (force) {
        invalidateAppConfigCache();
        inFlightInitialLoad = null;
      }
      if (!inFlightInitialLoad) {
        inFlightInitialLoad = getAppConfig();
      }
      const config = await inFlightInitialLoad;
      setAppConfig(config);
      console.log('[AppConfigContext] Config set:', config);
    } catch (err) {
      console.error('[AppConfigContext] Failed to load config:', err);
      inFlightInitialLoad = null;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshConfig = useCallback(async () => {
    console.log('[AppConfigContext] refreshConfig called');
    await loadConfig(true);
  }, [loadConfig]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  return (
    <AppConfigContext.Provider value={{ appConfig, loading, refreshConfig }}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig() {
  return useContext(AppConfigContext);
}
