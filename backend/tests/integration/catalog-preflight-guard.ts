import { readGovernanceEnvironment } from './governance-environment.ts';

export function readCatalogPreflightEnvironment(environment: Readonly<Record<string, string | undefined>>) {
  const config = readGovernanceEnvironment(environment);
  if (config.migrator.database === 'nutrasa_it_5ca7bad4722340279d938775731cd4ee' ||
      environment.NUTRASA_IT_CATALOG_PREFLIGHT_CONFIRM !== config.migrator.database) {
    throw new Error('Fresh catalog preflight target and separate approval required.');
  }
  return config;
}
