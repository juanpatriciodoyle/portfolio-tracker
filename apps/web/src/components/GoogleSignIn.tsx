import type { ReactNode } from 'react';
import { useGoogleLogin } from '@react-oauth/google';

interface GoogleSignInProps {
  /** Google's access token: the only thing sent to the server, which asks Google who it belongs to. */
  onToken: (accessToken: string) => void;
  onError: () => void;
  /** Draws the button; `signIn` opens Google's prompt. */
  children: (signIn: () => void) => ReactNode;
}

/**
 * Everything that starts Google's own script lives here, so it exists only where Google is set up: with no client id
 * that script fails while starting and takes the whole page down with it.
 */
export default function GoogleSignIn({ onToken, onError, children }: GoogleSignInProps) {
  const signIn = useGoogleLogin({ onSuccess: (response) => onToken(response.access_token), onError });
  return <>{children(() => signIn())}</>;
}
