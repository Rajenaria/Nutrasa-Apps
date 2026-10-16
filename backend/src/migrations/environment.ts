export function assertSafePgEnvironment(environment: Readonly<Record<string, string | undefined>>) {
  if (environment.PGOPTIONS || environment.PGREPLICATION) {
    throw new Error('Inherited PGOPTIONS and PGREPLICATION are not allowed for migration connections.');
  }
}

export function readMigrationEnvironment(environment: Readonly<Record<string, string | undefined>>) {
  assertSafePgEnvironment(environment);
  const connectionString = environment.MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error('MIGRATION_DATABASE_URL is required.');

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('Invalid migration connection configuration.');
  }

  const database = url.pathname.slice(1);
  const role = database === 'nutrasa_dev' ? 'nutrasa_dev_migrator' :
    database === 'nutrasa_test' ? 'nutrasa_test_migrator' : undefined;
  if (!role || url.username !== role ||
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      (url.port !== '' && url.port !== '5432') || url.search !== '' || url.hash !== '') {
    throw new Error('Migration requires the matching local development/testing migrator.');
  }
  // pg otherwise falls back to PGPORT when the URL has no port.
  url.port = '5432';
  return { connectionString: url.toString(), database, role };
}
