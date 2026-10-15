import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform } from 'react-native';
import { AuthLink, AuthMessage, AuthScreen } from '../src/components/AuthScreen';
import { Button } from '../src/components/Button';
import { TextInput } from '../src/components/TextInput';
import { useAuth } from '../src/context/AuthContext';
import { INVALID_RESET_LINK } from '../src/lib/authLinks';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ '#': string; code: string }>();
  const { bootstrapped, session, sessionError, retrySession, recoveryError, updatePassword, finishPasswordRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  useEffect(() => {
    // Expo's initial linking state can restore the fragment after Supabase
    // clears it. Replace through the router once the callback is validated.
    if (bootstrapped && session && !recoveryError && Platform.OS === 'web' &&
      (params['#'] || params.code)) {
      router.setParams({ '#': undefined, code: undefined });
    }
  }, [bootstrapped, session, recoveryError, router, params['#'], params.code]);

  const save = async () => {
    if (submitting.current) return;
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmation) { setError('Passwords do not match.'); return; }
    submitting.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await updatePassword(password);
      setError(result.error);
      if (!result.error) { setPassword(''); setConfirmation(''); setSaved(true); }
    } finally { submitting.current = false; setLoading(false); }
  };

  if (!bootstrapped) return <AuthScreen title="Checking your link" description="Please wait while we verify your reset link.">
    {sessionError ? <><AuthMessage error>{sessionError}</AuthMessage><Button label="Try again" onPress={retrySession} /></>
      : <ActivityIndicator accessibilityLabel="Checking reset link" />}
  </AuthScreen>;

  if (saved) return <AuthScreen title="Password updated" description="Your new password is ready. Use it next time you sign in.">
    <Button label="Continue to Voca" onPress={() => { finishPasswordRecovery(); router.replace('/(tabs)'); }} />
  </AuthScreen>;

  if (!session || recoveryError) return <AuthScreen title="Request a new link" description={recoveryError || INVALID_RESET_LINK}>
    <AuthLink href="/forgot-password">Send a new reset link</AuthLink>
  </AuthScreen>;

  return <AuthScreen title="Choose a new password" description="Use at least 6 characters for your new password.">
    <TextInput label="New password" placeholder="New password" value={password} onChangeText={setPassword}
      secureTextEntry autoComplete="new-password" editable={!loading} />
    <TextInput label="Confirm new password" placeholder="Enter it again" value={confirmation} onChangeText={setConfirmation}
      secureTextEntry autoComplete="new-password" editable={!loading} returnKeyType="done" onSubmitEditing={save} />
    {error && <AuthMessage error>{error}</AuthMessage>}
    <Button label="Save new password" onPress={save} loading={loading} />
  </AuthScreen>;
}
