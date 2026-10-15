import { Platform, type ViewStyle } from 'react-native';

// Keep browser content readable while letting the page background fill the window.
export const webContent: ViewStyle = Platform.OS === 'web'
  ? { width: '100%', maxWidth: 960, alignSelf: 'center' } : {};
export const webFormContent: ViewStyle = Platform.OS === 'web'
  ? { width: '100%', maxWidth: 680, alignSelf: 'center' } : {};
