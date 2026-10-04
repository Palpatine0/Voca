import { Stack } from 'expo-router';
import React from 'react';
import { AuthGate } from '../../src/components/AuthGate';

export default function AuthLayout() {
  return (
    <AuthGate authenticated={false}>
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
      </Stack>
    </AuthGate>
  );
}
