import React, { useRef, useState } from 'react';
import { AuthLink, AuthMessage, AuthScreen } from '../src/components/AuthScreen';
import { Button } from '../src/components/Button';
import { TextInput } from '../src/components/TextInput';
import { useAuth } from '../src/context/AuthContext';

export default function ForgotPasswordScreen() {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  const send = async () => {
    if (submitting.current) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.'); return;
    }
    submitting.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await sendPasswordReset(email.trim());
      setError(result.error);
      if (!result.error) setSent(true);
    } finally { submitting.current = false; setLoading(false); }
  };

  return <AuthScreen title={sent ? 'Check your email' : 'Forgot password?'}
    description={sent ? 'If an account exists for this email, you’ll receive a password reset link shortly.' : 'Enter your email and we’ll send you a link to choose a new password.'}>
    {sent ? <>
      <AuthMessage>Check your inbox and spam folder. Open the latest link to reset your password.</AuthMessage>
      <Button label="Use a different email" variant="outline" onPress={() => { setSent(false); setError(null); }} />
    </> : <>
      <TextInput label="Email" placeholder="you@example.com" value={email} onChangeText={setEmail}
        keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email"
        editable={!loading} returnKeyType="send" onSubmitEditing={send} />
      {error && <AuthMessage error>{error}</AuthMessage>}
      <Button label="Send reset link" onPress={send} loading={loading} />
    </>}
    <AuthLink href="/(auth)/login">Back to Sign In</AuthLink>
  </AuthScreen>;
}
