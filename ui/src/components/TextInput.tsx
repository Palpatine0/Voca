import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput as NativeTextInput,
  TextInputProps as NativeTextInputProps,
  View,
} from 'react-native';
import { radii, spacing, typography, useTheme } from '../lib/theme';

interface TextInputProps extends NativeTextInputProps {
  label: string;
  error?: string;
}

export function TextInput({ label, error, style, ...props }: TextInputProps) {
  const theme = useTheme();

  return (
    <View>
      <Text style={[typography.captionUppercase, styles.label, { color: theme.colors.muted }]}>
        {label}
      </Text>
      <NativeTextInput
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? label}
        placeholderTextColor={theme.colors.mutedSoft}
        style={[
          styles.input,
          typography.bodyMd,
          {
            backgroundColor: theme.colors.surfaceCard,
            borderColor: error
              ? theme.colors.semanticError
              : theme.colors.hairlineStrong,
            color: theme.colors.ink,
          },
          style,
        ]}
      />
      {error ? (
        <Text style={[typography.caption, styles.error, { color: theme.colors.semanticError }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: spacing.xs,
  },
  input: {
    width: '100%',
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  error: {
    marginTop: spacing.xxs,
  },
});
