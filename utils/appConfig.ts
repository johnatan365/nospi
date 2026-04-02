import { supabase } from '@/lib/supabase';

export interface AppConfig {
  event_price: string;
  support_email: string;
  support_whatsapp: string;
}

const DEFAULTS: AppConfig = {
  event_price: '30000',
  support_email: 'soporte@nospi.app',
  support_whatsapp: '573192099123',
};

let cachedConfig: AppConfig | null = null;

export async function getAppConfig(): Promise<AppConfig> {
  if (cachedConfig) {
    console.log('[AppConfig] Returning cached config');
    return cachedConfig;
  }

  console.log('[AppConfig] Fetching config from Supabase app_config table');
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('key, value');

    if (error) {
      console.error('[AppConfig] Error fetching config:', error.message);
      return DEFAULTS;
    }

    if (!data || data.length === 0) {
      console.warn('[AppConfig] No config rows found, using defaults');
      return DEFAULTS;
    }

    const config: AppConfig = { ...DEFAULTS };
    for (const row of data) {
      if (row.key === 'event_price') config.event_price = row.value;
      if (row.key === 'support_email') config.support_email = row.value;
      if (row.key === 'support_whatsapp') config.support_whatsapp = row.value;
    }

    console.log('[AppConfig] Config loaded:', config);
    cachedConfig = config;
    return config;
  } catch (err) {
    console.error('[AppConfig] Unexpected error, using defaults:', err);
    return DEFAULTS;
  }
}

export function invalidateAppConfigCache() {
  console.log('[AppConfig] Cache invalidated');
  cachedConfig = null;
}
