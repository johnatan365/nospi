import React, { Component, ReactNode } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ error, errorInfo });
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <LinearGradient
          colors={['#1a0010', '#880E4F', '#AD1457']}
          style={styles.gradient}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        >
          <View style={styles.container}>
            <Text style={styles.icon}>😕</Text>
            <Text style={styles.title}>Algo salió mal</Text>
            <Text style={styles.message}>
              Ocurrió un error inesperado. Por favor intenta de nuevo.
            </Text>

            {__DEV__ && this.state.error && (
              <ScrollView style={styles.errorDetails}>
                <Text style={styles.errorTitle}>Error (solo en desarrollo):</Text>
                <Text style={styles.errorText}>
                  {this.state.error.toString()}
                </Text>
                {this.state.errorInfo && (
                  <Text style={styles.errorStack}>
                    {this.state.errorInfo.componentStack}
                  </Text>
                )}
              </ScrollView>
            )}

            <TouchableOpacity style={styles.button} onPress={this.handleReset}>
              <Text style={styles.buttonText}>Intentar de nuevo</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  icon: {
    fontSize: 72,
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 12,
    color: "#FFFFFF",
    textAlign: "center",
  },
  message: {
    fontSize: 16,
    textAlign: "center",
    color: "rgba(255,255,255,0.8)",
    marginBottom: 32,
    lineHeight: 24,
  },
  errorDetails: {
    maxHeight: 200,
    width: "100%",
    padding: 16,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 12,
    marginBottom: 24,
  },
  errorTitle: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
    color: "#FF6B6B",
  },
  errorText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
    fontFamily: "monospace",
    marginBottom: 8,
  },
  errorStack: {
    fontSize: 10,
    color: "rgba(255,255,255,0.5)",
    fontFamily: "monospace",
  },
  button: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonText: {
    color: "#880E4F",
    fontSize: 17,
    fontWeight: "700",
  },
});
