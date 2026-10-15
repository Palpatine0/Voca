import React from 'react';
import { Linking, Text, View } from 'react-native';
import { Word } from '../lib/api';
import { spacing, typography, useTheme } from '../lib/theme';

export function WordSources({ word }: { word: Word }) {
  const theme = useTheme();
  const definition = word.enrichment?.definition_source;
  const photo = word.enrichment?.image_source;
  const link = (label: string, url: string) => <Text accessibilityRole="link"
    style={{ textDecorationLine: 'underline' }} onPress={(event) => {
      event.stopPropagation();
      if (/^https:\/\//.test(url)) void Linking.openURL(url).catch(() => undefined);
    }}>{label}</Text>;
  return <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
    {word.definition && definition && <Text style={[typography.caption, { color: theme.colors.muted, textAlign: 'center' }]}>
      {link('Meaning: ' + definition.name + ' (shortened)', definition.url)}{' · '}{link(definition.license, definition.license_url)}
    </Text>}
    {word.image_url && photo && <Text style={[typography.caption, { color: theme.colors.muted, textAlign: 'center' }]}>
      Photo by {link(photo.photographer, photo.photographer_url)} on {link(photo.name, photo.url)}
    </Text>}
  </View>;
}
