import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/lib/theme';

export default function Index() {
  const { bootstrapped, session } = useAuth();
  const theme = useTheme();

  if (!bootstrapped) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.canvas }]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (session) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/login" />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
