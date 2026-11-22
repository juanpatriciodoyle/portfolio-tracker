/** The Google client id of this deployment, set when the app is built (VITE_GOOGLE_CLIENT_ID). Empty when Google sign-in is not set up. */
export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

/** Without a client id Google's own script fails while starting, so nothing of Google's may be started at all. */
export const isGoogleSignInConfigured = (): boolean => GOOGLE_CLIENT_ID.trim() !== '';
