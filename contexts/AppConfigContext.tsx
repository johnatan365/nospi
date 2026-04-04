import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getAppConfig, invalidateAppConfigCache, AppConfig } from '@/utils/appConfig';

interface AppConfigContextValue {
  appConfig: AppConfig;
  loading: boolean;
  refreshConfig: () => Promise<void>;
}

const DEFAULT_CONFIG: AppConfig = {
  event_price: '30000',
  support_email: 'soporte@nospi.app',
  support_whatsapp: '573192099123',
};

const AppConfigContext = createContext<AppConfigContextValue>({
  appConfig: DEFAULT_CONFIG,
  loading: true,
  refreshConfig: async () => {},
});

export function AppConfigProvider({ children }: { children: React.ReactNode }) {
  const [appConfig, setAppConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  const loadConfig = useCallback(async (force = false) => {
    if (force) {
      invalidateAppConfigCache();
    }
    console.log('[AppConfigContext] Loading app config, force:', force);
    setLoading(true);
    try {
      const config = await getAppConfig();
      setAppConfig(config);
      console.log('[AppConfigContext] Config set:', config);
    } catch (err) {
      console.error('[AppConfigContext] Failed to load config:', err);
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
