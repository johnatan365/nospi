
// Nospi Crimson/Pink Theme — derived from welcome screen
// Primary gradient: #1a0010 → #880E4F → #AD1457
// Accent: #F06292 (light pink)

export const nospiColors = {
  // Primary gradient colors (welcome screen: #1a0010 → #880E4F → #AD1457)
  purpleDark: '#880E4F',    // Deep crimson-pink (primary brand color)
  purpleMid: '#AD1457',     // Mid crimson-pink
  purpleLight: '#F06292',   // Light pink accent
  purplePale: '#FCE4EC',    // Very light pink (backgrounds)

  // Accent colors
  accent: '#F06292',        // Pink accent
  accentLight: '#F8BBD9',   // Light pink

  // Gradient stops
  gradientDark: '#1a0010',  // Darkest gradient stop
  gradientMid: '#880E4F',   // Mid gradient stop
  gradientLight: '#AD1457', // Light gradient stop

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

// Gradient presets
export const nospiGradientDark = ['#1a0010', '#880E4F', '#AD1457'] as const;
export const nospiGradientLight = ['#FFFFFF', '#F3E8FF', '#E9D5FF', '#F06292', '#AD1457'] as const;

// Default Colors export for navigation theming
export const Colors = {
  light: {
    text: nospiColors.purpleDark,
    background: nospiColors.white,
    tint: nospiColors.purpleDark,
    tabIconDefault: nospiColors.gray400,
    tabIconSelected: nospiColors.purpleDark,
    card: nospiColors.white,
    border: nospiColors.gray200,
    primary: nospiColors.purpleDark,
    notification: nospiColors.purpleLight,
  },
  dark: {
    text: nospiColors.white,
    background: nospiColors.gradientDark,
    tint: nospiColors.purpleLight,
    tabIconDefault: nospiColors.gray500,
    tabIconSelected: nospiColors.purpleLight,
    card: '#2a0020',
    border: 'rgba(240, 98, 146, 0.30)',
    primary: nospiColors.purpleLight,
    notification: nospiColors.purpleLight,
  },
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
  colorScheme === 'dark' ? 'rgba(240, 98, 146, 0.30)' : nospiColors.gray200;

// Precio del evento - modificar solo aquí para que se actualice en toda la app
export const PRECIO_EVENTO_COP = 2000;
