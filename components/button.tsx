import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  ViewStyle,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

type ButtonVariant = "filled" | "outline" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Button: React.FC<ButtonProps> = ({
  onPress,
  variant = "filled",
  size = "md",
  disabled = false,
  loading = false,
  children,
  style,
  textStyle,
}) => {
  const sizeStyles: Record<
    ButtonSize,
    { height: number; fontSize: number; padding: number }
  > = {
    sm: { height: 36, fontSize: 14, padding: 12 },
    md: { height: 44, fontSize: 16, padding: 16 },
    lg: { height: 55, fontSize: 18, padding: 20 },
  };

  const getOutlineGhostStyle = (): ViewStyle => {
    if (variant === "outline") {
      return {
        borderRadius: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "transparent",
        borderWidth: 1,
        borderColor: "#E5E7EB",
      };
    }
    return {
      borderRadius: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
    };
  };

  const getTextColor = () => {
    if (disabled) return "#9CA3AF";
    if (variant === "filled") return "#FFFFFF";
    return "#880E4F";
  };

  const textColorValue = getTextColor();

  if (variant === "filled") {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled || loading}
        style={[
          {
            borderRadius: 12,
            overflow: "hidden",
            opacity: disabled ? 0.5 : 1,
          },
          style,
        ]}
      >
        <LinearGradient
          colors={["#1a0010", "#880E4F", "#AD1457"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{
            height: sizeStyles[size].height,
            paddingHorizontal: sizeStyles[size].padding,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text
              style={StyleSheet.flatten([
                {
                  fontSize: sizeStyles[size].fontSize,
                  color: "#FFFFFF",
                  textAlign: "center",
                  fontWeight: "700",
                },
                textStyle,
              ])}
            >
              {children}
            </Text>
          )}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        getOutlineGhostStyle(),
        {
          height: sizeStyles[size].height,
          paddingHorizontal: sizeStyles[size].padding,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColorValue} />
      ) : (
        <Text
          style={StyleSheet.flatten([
            {
              fontSize: sizeStyles[size].fontSize,
              color: textColorValue,
              textAlign: "center",
              fontWeight: "700",
            },
            textStyle,
          ])}
        >
          {children}
        </Text>
      )}
    </Pressable>
  );
};

export default Button;
