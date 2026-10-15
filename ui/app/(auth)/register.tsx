import React, { useRef, useState } from 'react';
import { AuthLink, AuthMessage, AuthScreen } from '../../src/components/AuthScreen';
import { Button } from '../../src/components/Button';
import { TextInput } from '../../src/components/TextInput';
import { useAuth } from '../../src/context/AuthContext';

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const submitting = useRef(false);

  const handleSignUp = async () => {
    if (submitting.current) return;
    if (!email.trim() || !password) { setError('Please fill in all fields.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    submitting.current = true;
    setError(null);
    setLoading(true);
    try {
      const result = await signUp(email.trim(), password);
      setError(result.error);
      if (!result.error) setSuccess(result.needsEmailConfirmation);
    } finally { submitting.current = false; setLoading(false); }
  };

  if (success) return <AuthScreen title="Check your email" description={`We sent a confirmation link to ${email}. Please verify your email to continue.`}>
    <AuthLink href="/(auth)/login">Back to Sign In</AuthLink>
  </AuthScreen>;

  return <AuthScreen title="Create account" description="Start building your vocabulary.">
    <TextInput label="Email" placeholder="you@example.com" value={email} onChangeText={setEmail}
      autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" editable={!loading} />
    <TextInput label="Password" placeholder="At least 6 characters" value={password} onChangeText={setPassword}
      secureTextEntry autoComplete="new-password" editable={!loading} />
    <TextInput label="Confirm password" placeholder="Enter your password again" value={confirmPassword}
      onChangeText={setConfirmPassword} secureTextEntry autoComplete="new-password" editable={!loading}
      returnKeyType="go" onSubmitEditing={handleSignUp} />
    {error && <AuthMessage error>{error}</AuthMessage>}
    <Button label="Sign Up" onPress={handleSignUp} loading={loading} />
    <AuthLink href="/(auth)/login">Already have an account? Sign In</AuthLink>
  </AuthScreen>;
}
