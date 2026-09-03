import { supabase } from '@/lib/supabase';

export interface AppConfig {
  event_price: string;
  subscription_price: string;        // plan de 1 mes
  subscription_price_3m: string;     // plan de 3 meses
  subscription_price_6m: string;     // plan de 6 meses
  prueba_solo_suscripcion: string;   // 'true' | 'false' — interruptor de la prueba de solo-suscripcion
  support_email: string;
  support_whatsapp: string;
  test_payment_enabled: string; // 'true' | 'false'
  min_app_version: string; // ej '1.0.16' — versión mínima obligatoria (fail-open si '0.0.0')
}

// Valores de respaldo mientras carga app_config o si la consulta falla.
// event_price decia 30000 y el precio real es 15000 desde hace tiempo: durante
// el instante de carga la app mostraba el doble del precio.
const DEFAULTS: AppConfig = {
  event_price: '15000',
  subscription_price: '29900',
  subscription_price_3m: '74900',
  subscription_price_6m: '125900',
  prueba_solo_suscripcion: 'false',
  support_email: 'soporte@nospi.app',
  support_whatsapp: '573192099123',
  test_payment_enabled: 'false',
  min_app_version: '0.0.0',
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
      if (row.key === 'subscription_price') config.subscription_price = row.value;
      if (row.key === 'subscription_price_3m') config.subscription_price_3m = row.value;
      if (row.key === 'subscription_price_6m') config.subscription_price_6m = row.value;
      if (row.key === 'prueba_solo_suscripcion') config.prueba_solo_suscripcion = row.value;
      if (row.key === 'support_email') config.support_email = row.value;
      if (row.key === 'support_whatsapp') config.support_whatsapp = row.value;
      if (row.key === 'test_payment_enabled') config.test_payment_enabled = row.value;
      if (row.key === 'min_app_version') config.min_app_version = row.value;
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