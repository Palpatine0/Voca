import { Audio } from 'expo-av';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { downloadPronunciation } from '../lib/audio';
import { radii, spacing, useTheme } from '../lib/theme';

interface PronunciationButtonProps {
  wordId: string;
  audioUrl: string;
}

export function PronunciationButton({
  wordId,
  audioUrl,
}: PronunciationButtonProps) {
  const theme = useTheme();
  const sound = useRef<Audio.Sound | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    return () => {
      sound.current?.unloadAsync();
    };
  }, []);

  const handlePress = async () => {
    if (loading) return;

    if (sound.current) {
      const status = await sound.current.getStatusAsync();
      if (status.isLoaded && status.isPlaying) {
        await sound.current.pauseAsync();
        setPlaying(false);
      } else if (status.isLoaded) {
        await sound.current.replayAsync();
        setPlaying(true);
      }
      return;
    }

    setLoading(true);
    try {
      const localUri = await downloadPronunciation(wordId, audioUrl);
      const result = await Audio.Sound.createAsync(
        { uri: localUri },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded) {
            setPlaying(status.isPlaying);
            if (status.didJustFinish) {
              setPlaying(false);
            }
          }
        }
      );
      sound.current = result.sound;
      setPlaying(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Pressable
      accessibilityLabel="Play pronunciation"
      accessibilityRole="button"
      onPress={handlePress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: pressed
            ? theme.colors.primaryActive
            : theme.colors.primary,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.onPrimary} size="small" />
      ) : (
        <Ionicons
          name={playing ? 'pause' : 'volume-high-outline'}
          size={18}
          color={theme.colors.onPrimary}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
});
