
import { StyleSheet } from 'react-native';
import { nospiColors } from '@/constants/Colors';

export const colors = {
  // Primary gradient colors
  primary: nospiColors.purpleMid,
  primaryDark: nospiColors.purpleDark,
  primaryLight: nospiColors.purpleLight,
  
  // Accent
  accent: nospiColors.accent,
  accentLight: nospiColors.accentLight,
  
  // Text colors
  text: nospiColors.gray900,
  textLight: nospiColors.gray600,
  textInverse: nospiColors.white,
  
  // Background colors
  background: nospiColors.white,
  backgroundSecondary: nospiColors.gray50,
  
  // Border colors
  border: nospiColors.gray200,
  borderLight: nospiColors.gray100,
  
  // Status colors
  success: nospiColors.success,
  error: nospiColors.error,
  warning: nospiColors.warning,
  info: nospiColors.info,
};

export const commonStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  gradientBackground: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textLight,
    textAlign: 'center',
    marginBottom: 32,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginVertical: 8,
  },
  buttonText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  buttonSecondaryText: {
    color: colors.primary,
  },
  input: {
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.text,
    width: '100%',
    marginVertical: 8,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 20,
    marginVertical: 8,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
});
