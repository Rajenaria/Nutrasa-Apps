import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import type { Credential } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { Auth } from 'firebase-admin/auth';
import type { FirebaseTokenVerifier } from './identity.ts';

const appName = 'nutrasa-backend';

// The SDK owns signature, audience, issuer, expiry and account/revocation checks.
export function firebaseTokenVerifier(auth: Pick<Auth, 'verifyIdToken'>): FirebaseTokenVerifier {
  return {
    async verifyIdToken(token, _checkRevoked) {
      const { uid } = await auth.verifyIdToken(token, true);
      return { uid };
    },
  };
}

// Importing this module never initializes an app or discovers credentials.
export function createFirebaseVerifier(
  environment: Readonly<Record<string, string | undefined>>,
  credentialFactory: () => Credential = applicationDefault,
): FirebaseTokenVerifier | undefined {
  if (environment.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('Firebase emulator authentication is not permitted.');
  }
  const projectId = environment.FIREBASE_PROJECT_ID;
  if (projectId === undefined || projectId === '') return undefined;
  if (projectId.trim() !== projectId || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
    throw new Error('Invalid Firebase project configuration.');
  }

  try {
    // SDK initialization with credentials is not idempotent; reuse our named app explicitly.
    const existing = getApps().find(app => app.name === appName);
    if (existing && existing.options.projectId !== projectId) {
      throw new Error('Firebase app project mismatch.');
    }
    const app = existing ?? initializeApp({ projectId, credential: credentialFactory() }, appName);
    return firebaseTokenVerifier(getAuth(app));
  } catch {
    // Credential providers can include paths or private details in their errors.
    throw new Error('Firebase initialization unavailable.');
  }
}
