import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { radii, spacing, typography, useTheme } from '../../src/lib/theme';

export default function SettingsScreen() {
  const theme = useTheme();
  const { user, signOut } = useAuth();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.canvas }]}>
      <View style={styles.container}>
        <Text style={[typography.titleMd, { color: theme.colors.ink }]}>
          Settings
        </Text>

        {user && (
          <Text
            style={[
              typography.bodySm,
              { color: theme.colors.muted, marginTop: spacing.sm },
            ]}
          >
            {user.email}
          </Text>
        )}

        <Pressable
          onPress={signOut}
          style={({ pressed }) => [
            styles.signOutButton,
            {
              borderColor: theme.colors.hairlineStrong,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={[typography.button, { color: theme.colors.ink }]}>
            Sign Out
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  signOutButton: {
    marginTop: spacing.xl,
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
