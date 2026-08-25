import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing, typography, useTheme } from '../../src/lib/theme';

export default function AddScreen() {
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.canvas }]}>
      <View style={styles.container}>
        <Text style={[typography.titleMd, { color: theme.colors.ink }]}>
          Add Word
        </Text>
        <Text
          style={[
            typography.bodyMd,
            { color: theme.colors.muted, marginTop: spacing.xs },
          ]}
        >
          Coming soon
        </Text>
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
});
