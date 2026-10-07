import { Audio } from 'expo-av';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { downloadPronunciation } from '../lib/audio';
import { radii, spacing, typography, useTheme } from '../lib/theme';

interface PronunciationButtonProps {
  userId: string;
  wordId: string;
  audioUrl: string;
}

interface PlaybackSession {
  sound: Audio.Sound | null;
  busy: boolean;
  disposed: boolean;
}

export function PronunciationButton({
  userId,
  wordId,
  audioUrl,
}: PronunciationButtonProps) {
  const theme = useTheme();
  const playback = useRef<PlaybackSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const session: PlaybackSession = { sound: null, busy: false, disposed: false };
    playback.current = session;
    setLoading(false);
    setPlaying(false);
    setError(false);
    return () => {
      session.disposed = true;
      void session.sound?.unloadAsync().catch(() => undefined);
    };
  }, [userId, wordId, audioUrl]);

  const handlePress = async () => {
    const session = playback.current;
    if (!session || session.disposed || session.busy) return;

    session.busy = true;
    setLoading(true);
    setError(false);
    try {
      if (session.sound) {
        const status = await session.sound.getStatusAsync();
        if (session.disposed) return;
        if (status.isLoaded) {
          if (status.isPlaying) await session.sound.pauseAsync();
          else await session.sound.replayAsync();
          if (!session.disposed) setPlaying(!status.isPlaying);
          return;
        }
        await session.sound.unloadAsync();
        session.sound = null;
      }

      const localUri = await downloadPronunciation(userId, wordId, audioUrl);
      if (session.disposed) return;
      const result = await Audio.Sound.createAsync(
        { uri: localUri },
        // Do not play until we know the card is still visible.
        { shouldPlay: false },
        (status) => {
          if (!session.disposed && status.isLoaded) {
            setPlaying(status.isPlaying && !status.didJustFinish);
          }
        }
      );
      if (session.disposed) {
        await result.sound.unloadAsync();
        return;
      }
      session.sound = result.sound;
      await session.sound.playAsync();
      if (!session.disposed) setPlaying(true);
    } catch {
      if (!session.disposed) {
        setError(true);
        setPlaying(false);
      }
      const failedSound = session.sound;
      session.sound = null;
      void failedSound?.unloadAsync().catch(() => undefined);
    } finally {
      session.busy = false;
      if (!session.disposed) setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityLabel={playing ? 'Pause pronunciation' : 'Play pronunciation'}
        accessibilityRole="button"
        accessibilityState={{ disabled: loading }}
        disabled={loading}
        onPress={(event) => {
          event.stopPropagation();
          void handlePress();
        }}
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
      {error && (
        <Text
          accessibilityRole="alert"
          style={[typography.caption, styles.error, { color: theme.colors.semanticError }]}
        >
          Audio unavailable. Tap to retry.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center' },
  error: { marginTop: spacing.xs, textAlign: 'center' },
  button: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
});
