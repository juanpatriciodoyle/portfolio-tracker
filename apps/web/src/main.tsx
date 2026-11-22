import './zodSetup.ts'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import App from './App.tsx'
import { LocaleProvider } from './i18n/LocaleProvider.tsx'

import { GOOGLE_CLIENT_ID, isGoogleSignInConfigured } from './lib/googleConfig.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      {isGoogleSignInConfigured() ? (
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
          <App />
        </GoogleOAuthProvider>
      ) : (
        <App />
      )}
    </LocaleProvider>
  </StrictMode>,
)
