import { Redirect } from 'expo-router';
import React from 'react';
import { AuthGate } from '../src/components/AuthGate';

export default function Index() {
  return (
    <AuthGate>
      <Redirect href="/(tabs)" />
    </AuthGate>
  );
}
