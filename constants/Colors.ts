
// Nospi Purple Gradient Theme
export const nospiColors = {
  // Primary purple gradient colors
  purpleDark: '#6B21A8',    // Deep purple
  purpleMid: '#9333EA',     // Medium purple
  purpleLight: '#C084FC',   // Light purple
  purplePale: '#E9D5FF',    // Very light purple
  
  // Accent colors
  accent: '#EC4899',        // Pink accent
  accentLight: '#F9A8D4',   // Light pink
  
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
