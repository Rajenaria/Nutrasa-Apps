// Vocabulary only: recognizing a pair never assigns it to an actor or activates a writer.
export const catalogCapabilities = Object.freeze({
  sourcePermissionReview: 'catalog.source_permission.review',
  nutritionReview: 'catalog.nutrition.review',
  publicationPublish: 'catalog.publication.publish',
  publicationWithdraw: 'catalog.publication.withdraw',
  capabilityGrant: 'catalog.capability.grant',
  capabilityRevoke: 'catalog.capability.revoke',
} as const);

export interface CapabilityPermission {
  readonly capability: string;
  readonly scope: string;
}

export type CatalogCapability = typeof catalogCapabilities[keyof typeof catalogCapabilities];
export const catalogScope = 'CATALOG';
export const catalogPermissions = Object.freeze(Object.values(catalogCapabilities)
  .map(capability => Object.freeze({ capability, scope: catalogScope })));

export function isKnownCapability(capability: string, scope: string): boolean {
  return scope === catalogScope && catalogPermissions.some(entry => entry.capability === capability);
}
