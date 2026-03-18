
// Nospi Light Theme
export const nospiColors = {
  // Brand dark-to-pink gradient palette
  purpleDark: '#1a0010',
  purpleMid: '#880E4F',
  purpleLight: '#AD1457',
  purplePale: '#F8BBD0',

  // Accent colors
  accent: '#880E4F',
  accentAlt: '#AD1457',
  accentLight: '#F8BBD0',

  // Background & surface
  background: '#FFFFFF',
  surface: '#F9FAFB',
  border: '#E5E7EB',

  // Text
  heading: '#1a0010',
  body: '#333333',
  muted: '#555555',
  placeholder: '#999999',
  inactive: '#999999',

  // Neutral colors
  white: '#FFFFFF',
  black: '#000000',
  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',

  // Status colors
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
};

export const appleBlue = '#007AFF';
export const appleRed = '#FF3B30';

export const zincColors = {
  zinc50: '#fafafa',
  zinc100: '#f4f4f5',
  zinc200: '#e4e4e7',
  zinc300: '#d4d4d8',
  zinc400: '#a1a1aa',
  zinc500: '#71717a',
  zinc600: '#52525b',
  zinc700: '#3f3f46',
  zinc800: '#27272a',
  zinc900: '#18181b',
  zinc950: '#09090b',
};

export const borderColor = (colorScheme: 'light' | 'dark') =>
  colorScheme === 'dark' ? zincColors.zinc800 : zincColors.zinc200;

// Precio del evento - modificar solo aquí para que se actualice en toda la app
export const PRECIO_EVENTO_COP = 2000;
