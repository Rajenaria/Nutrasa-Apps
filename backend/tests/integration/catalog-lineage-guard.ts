import { readCatalogPreflightEnvironment } from './catalog-preflight-guard.ts';

export function readCatalogLineageEnvironment(environment: Readonly<Record<string, string | undefined>>) {
  const config = readCatalogPreflightEnvironment(environment);
  if (['nutrasa_it_6643ae844e614d2fa430c6e48953f5be',
    'nutrasa_it_e4c65951b6bf42c2b310b5924372b20d'].includes(config.migrator.database) ||
      environment.NUTRASA_IT_CATALOG_LINEAGE_CONFIRM !== config.migrator.database) {
    throw new Error('Separately approved fresh lineage target required.');
  }
  return config;
}
