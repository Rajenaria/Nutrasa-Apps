import type { FastifyInstance, FastifyRequest, onRequestAsyncHookHandler } from 'fastify';
import { isKnownCapability } from './capability-registry.ts';

export interface VerifiedIdentity {
  readonly firebaseUid: string;
}

// Supply the initialized Firebase Admin Auth instance from trusted server composition.
// No JWT decoding or credential discovery is implemented as a substitute for that SDK.
export interface FirebaseTokenVerifier {
  verifyIdToken(token: string, checkRevoked: true): Promise<{ readonly uid: string }>;
}

export interface CapabilityAuthority {
  allows(firebaseUid: string, capability: string, scope: string): Promise<boolean>;
}

export interface IdentityDependencies {
  readonly verifier?: FirebaseTokenVerifier;
  readonly capabilities?: CapabilityAuthority;
}

// Only successful verification issues provenance. A frozen public object is not an authority token.
const verifiedRequests = new WeakMap<FastifyRequest, VerifiedIdentity>();

export function verifiedRequestUid(request: FastifyRequest): string {
  const principal = verifiedRequests.get(request);
  if (!principal) throw new Error('Verified request identity required.');
  return principal.firebaseUid;
}

declare module 'fastify' {
  interface FastifyRequest {
    identity: VerifiedIdentity | null;
  }
  interface FastifyInstance {
    authenticate: onRequestAsyncHookHandler;
    requireCapability(capability: string, scope: string): onRequestAsyncHookHandler;
  }
}

const invalidTokenCodes = new Set([
  'auth/argument-error', 'auth/invalid-id-token', 'auth/id-token-expired',
  'auth/id-token-revoked', 'auth/user-disabled', 'auth/user-not-found',
]);

function deny(statusCode: 401 | 403): never {
  // The existing app error handler owns wire codes, messages and response envelopes.
  throw Object.assign(new Error('Access rejected.'), { statusCode });
}

export function registerIdentityBoundary(app: FastifyInstance, dependencies: IdentityDependencies) {
  app.decorateRequest('identity', null);
  app.addHook('onResponse', async request => { verifiedRequests.delete(request); });
  app.addHook('onRequestAbort', async request => { verifiedRequests.delete(request); });

  const authenticate = async (request: FastifyRequest) => {
    request.identity = null;
    verifiedRequests.delete(request);
    const authorization = request.headers.authorization;
    const headerCount = request.raw.rawHeaders.filter((name, index) =>
      index % 2 === 0 && name.toLowerCase() === 'authorization').length;
    const token = typeof authorization === 'string' && headerCount === 1 ?
      /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authorization)?.[1] : undefined;
    if (!token) deny(401);
    if (!dependencies.verifier) throw new Error('Identity verifier is not configured.');

    let claims: { readonly uid: string };
    try {
      claims = await dependencies.verifier.verifyIdToken(token, true);
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error &&
          typeof error.code === 'string' && invalidTokenCodes.has(error.code)) deny(401);
      throw new Error('Identity verification unavailable.');
    }
    if (typeof claims?.uid !== 'string' || claims.uid.trim().length === 0) {
      throw new Error('Invalid identity verifier result.');
    }
    // Store only verified UID; never propagate arbitrary token/custom claims into authorization.
    request.identity = Object.freeze({ firebaseUid: claims.uid });
    verifiedRequests.set(request, request.identity);
  };

  app.decorate('authenticate', async function (request: FastifyRequest) {
    await authenticate(request);
  });
  app.decorate('requireCapability', (capability: string, scope: string): onRequestAsyncHookHandler => {
    if (capability.length === 0 || capability.trim() !== capability) {
      throw new Error('Protected routes require an explicit server-defined capability.');
    }
    if (typeof scope !== 'string' || scope.trim().length === 0) {
      throw new Error('Protected routes require an explicit server-defined scope.');
    }
    return async function (request) {
      await authenticate(request);
      if (!isKnownCapability(capability, scope)) deny(403);
      const identity = request.identity;
      if (!identity || !dependencies.capabilities) deny(403);
      let allowed: boolean;
      try {
        allowed = await dependencies.capabilities.allows(identity.firebaseUid, capability, scope);
      } catch {
        throw new Error('Capability authority unavailable.');
      }
      if (allowed !== true) deny(403);
    };
  });
}
