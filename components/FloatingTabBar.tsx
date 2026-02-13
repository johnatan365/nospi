
import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { IconSymbol } from './IconSymbol';
import { nospiColors } from '@/constants/Colors';

export interface TabBarItem {
  name: string;
  route: string;
  icon: string;
  label: string;
}

interface FloatingTabBarProps {
  tabs: TabBarItem[];
}

export default function FloatingTabBar({ tabs }: FloatingTabBarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleTabPress = (route: string) => {
    console.log('Tab pressed:', route);
    router.push(route as any);
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        {tabs.map((tab) => {
          const isActive = pathname === tab.route || pathname.startsWith(tab.route);
          const iconColor = isActive ? '#FFFFFF' : '#9CA3AF';
          const labelColor = isActive ? '#FFFFFF' : '#6B7280';
          const backgroundColor = isActive ? nospiColors.purpleDark : 'transparent';

          return (
            <TouchableOpacity
              key={tab.name}
              style={[styles.tab, { backgroundColor }]}
              onPress={() => handleTabPress(tab.route)}
              activeOpacity={0.7}
            >
              <View style={styles.iconContainer}>
                <IconSymbol
                  ios_icon_name={tab.icon}
                  android_material_icon_name={tab.icon}
                  size={26}
                  color={iconColor}
                />
              </View>
              <Text style={[styles.label, { color: labelColor }]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 4,
    paddingBottom: 4,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginHorizontal: 4,
    borderRadius: 12,
    position: 'relative',
  },
  iconContainer: {
    marginBottom: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
});
