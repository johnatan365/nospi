
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Dimensions,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/IconSymbol';
import { BlurView } from 'expo-blur';
import { useTheme } from '@react-navigation/native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  interpolate,
} from 'react-native-reanimated';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Href } from 'expo-router';

const { width: screenWidth } = Dimensions.get('window');

export interface TabBarItem {
  name: string;
  route: Href;
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
}

interface FloatingTabBarProps {
  tabs: TabBarItem[];
  containerWidth?: number;
  borderRadius?: number;
  bottomMargin?: number;
}

export default function FloatingTabBar({
  tabs,
  containerWidth = screenWidth * 0.85, // Increased from 2.5 to 0.85 (85% of screen width)
  borderRadius = 40, // Increased from 35 to 40
  bottomMargin
}: FloatingTabBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const theme = useTheme();
  const animatedValue = useSharedValue(0);

  // Improved active tab detection with better path matching
  const activeTabIndex = React.useMemo(() => {
    // Find the best matching tab based on the current pathname
    let bestMatch = -1;
    let bestMatchScore = 0;

    tabs.forEach((tab, index) => {
      let score = 0;

      // Exact route match gets highest score
      if (pathname === tab.route) {
        score = 100;
      }
      // Check if pathname starts with tab route (for nested routes)
      else if (pathname.startsWith(tab.route as string)) {
        score = 80;
      }
      // Check if pathname contains the tab name
      else if (pathname.includes(tab.name)) {
        score = 60;
      }
      // Check for partial matches in the route
      else if (tab.route.includes('/(tabs)/') && pathname.includes(tab.route.split('/(tabs)/')[1])) {
        score = 40;
      }

      if (score > bestMatchScore) {
        bestMatchScore = score;
        bestMatch = index;
      }
    });

    // Default to first tab if no match found
    return bestMatch >= 0 ? bestMatch : 0;
  }, [pathname, tabs]);

  React.useEffect(() => {
    if (activeTabIndex >= 0) {
      animatedValue.value = withSpring(activeTabIndex, {
        damping: 20,
        stiffness: 120,
        mass: 1,
      });
    }
  }, [activeTabIndex, animatedValue]);

  const handleTabPress = (route: Href) => {
    router.push(route);
  };

  const tabWidthPercent = ((100 / tabs.length) - 1).toFixed(2);

  const indicatorStyle = useAnimatedStyle(() => {
    const tabWidth = (containerWidth - 12) / tabs.length; // Account for container padding (6px on each side)
    return {
      transform: [
        {
          translateX: interpolate(
            animatedValue.value,
            [0, tabs.length - 1],
            [0, tabWidth * (tabs.length - 1)]
          ),
        },
      ],
    };
  });

  // Dynamic styles based on theme
  const dynamicStyles = {
    blurContainer: {
      ...styles.blurContainer,
      borderWidth: 1.2,
      borderColor: 'rgba(255, 255, 255, 1)',
      ...Platform.select({
        ios: {
          backgroundColor: theme.dark
            ? 'rgba(28, 28, 30, 0.8)'
            : 'rgba(255, 255, 255, 0.6)',
        },
        android: {
          backgroundColor: theme.dark
            ? 'rgba(28, 28, 30, 0.95)'
            : 'rgba(255, 255, 255, 0.6)',
        },
        web: {
          backgroundColor: theme.dark
            ? 'rgba(28, 28, 30, 0.95)'
            : 'rgba(255, 255, 255, 0.6)',
          backdropFilter: 'blur(10px)',
        },
      }),
    },
    background: {
      ...styles.background,
    },
    indicator: {
      ...styles.indicator,
      backgroundColor: theme.dark
        ? 'rgba(255, 255, 255, 0.08)' // Subtle white overlay in dark mode
        : 'rgba(0, 0, 0, 0.04)', // Subtle black overlay in light mode
      width: `${tabWidthPercent}%` as `${number}%`, // Dynamic width based on number of tabs
    },
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <View style={[
        styles.container,
        {
          width: containerWidth,
          marginBottom: bottomMargin ?? 24 // Increased from 20 to 24
        }
      ]}>
        <BlurView
          intensity={80}
          style={[dynamicStyles.blurContainer, { borderRadius }]}
        >
          <View style={dynamicStyles.background} />
          <Animated.View style={[dynamicStyles.indicator, indicatorStyle]} />
          <View style={styles.tabsContainer}>
            {tabs.map((tab, index) => {
              const isActive = activeTabIndex === index;

              return (
                <React.Fragment key={index}>
                <TouchableOpacity
                  key={index}
                  style={styles.tab}
                  onPress={() => handleTabPress(tab.route)}
                  activeOpacity={0.7}
                >
                  <View key={index} style={styles.tabContent}>
                    <IconSymbol
                      android_material_icon_name={tab.icon}
                      ios_icon_name={tab.icon}
                      size={28} // Increased from 24 to 28
                      color={isActive ? theme.colors.primary : (theme.dark ? '#98989D' : '#000000')}
                    />
                    <Text
                      style={[
                        styles.tabLabel,
                        { color: theme.dark ? '#98989D' : '#8E8E93' },
                        isActive && { color: theme.colors.primary, fontWeight: '600' },
                      ]}
                    >
                      {tab.label}
                    </Text>
                  </View>
                </TouchableOpacity>
                </React.Fragment>
              );
            })}
          </View>
        </BlurView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    alignItems: 'center',
  },
  container: {
    marginHorizontal: 20,
    alignSelf: 'center',
  },
  blurContainer: {
    overflow: 'hidden',
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  indicator: {
    position: 'absolute',
    top: 6, // Increased from 4 to 6
    left: 4, // Increased from 2 to 4
    bottom: 6, // Increased from 4 to 6
    borderRadius: 32, // Increased from 27 to 32
    width: `${(100 / 2) - 1}%`,
  },
  tabsContainer: {
    flexDirection: 'row',
    height: 72, // Increased from 60 to 72
    alignItems: 'center',
    paddingHorizontal: 6, // Increased from 4 to 6
    gap: 8, // Added gap for more separation between tabs
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10, // Increased from 8 to 10
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4, // Increased from 2 to 4
  },
  tabLabel: {
    fontSize: 11, // Increased from 9 to 11
    fontWeight: '500',
    marginTop: 2,
  },
});
