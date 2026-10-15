import React, { useRef, useState } from 'react';
import { AuthLink, AuthMessage, AuthScreen } from '../../src/components/AuthScreen';
import { Button } from '../../src/components/Button';
import { TextInput } from '../../src/components/TextInput';
import { useAuth } from '../../src/context/AuthContext';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  const handleSignIn = async () => {
    if (submitting.current) return;
    if (!email.trim() || !password) { setError('Please fill in all fields.'); return; }
    submitting.current = true;
    setError(null);
    setLoading(true);
    try {
      const result = await signIn(email.trim(), password);
      setError(result.error);
    } finally { submitting.current = false; setLoading(false); }
  };

  return <AuthScreen title="Welcome back" description="Sign in to continue your learning.">
    <TextInput label="Email" placeholder="you@example.com" value={email} onChangeText={setEmail}
      autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email"
      editable={!loading} returnKeyType="next" />
    <TextInput label="Password" placeholder="Enter your password" value={password} onChangeText={setPassword}
      secureTextEntry autoComplete="current-password" editable={!loading} returnKeyType="go"
      onSubmitEditing={handleSignIn} />
    {error && <AuthMessage error>{error}</AuthMessage>}
    <Button label="Sign In" onPress={handleSignIn} loading={loading} />
    <AuthLink href="/forgot-password">Forgot password?</AuthLink>
    <AuthLink href="/(auth)/register">New to Voca? Create an account</AuthLink>
  </AuthScreen>;
}
