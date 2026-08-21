import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../src/context/AuthContext';
import { spacing, typography, useTheme } from '../src/lib/theme';

export default function Index() {
  const { bootstrapped } = useAuth();
  const theme = useTheme();

  if (!bootstrapped) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.canvas }]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.center, { backgroundColor: theme.colors.canvas }]}>
      <Text style={[typography.displaySm, { color: theme.colors.ink }]}>
        Voca
      </Text>
      <Text
        style={[
          typography.bodyMd,
          { color: theme.colors.muted, marginTop: spacing.xs },
        ]}
      >
        Your vocabulary companion
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
