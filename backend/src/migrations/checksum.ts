import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { migrationVersion } from './config.ts';

export interface SqlSnapshot {
  readonly path: string;
  readonly name: string;
  readonly sha256: string;
  readonly content: string;
}

export interface IntegrityState {
  readonly ledgerExists: boolean;
  readonly historyExists: boolean;
  readonly history: readonly string[];
  readonly ledger: readonly { name: string; sha256: string }[];
}

export function sha256(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function snapshotSql(path: string, bytes: Uint8Array): SqlSnapshot {
  const filename = basename(path);
  if (!filename.endsWith('.sql')) {
    throw new Error('Invalid versioned SQL filename.');
  }
  const name = filename.slice(0, -4);
  migrationVersion(name);
  const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  if (content.startsWith('\uFEFF') || content.includes('\r') || !content.endsWith('\n')) {
    throw new Error('Migration SQL must use UTF-8 without BOM, LF, and a final newline.');
  }
  const markers = content.split('\n').filter((line) => /^\s*--[\s-]*(up|down)\s+migration/i.test(line));
  if (markers.length !== 2 || markers[0] !== '-- Up Migration' || markers[1] !== '-- Down Migration') {
    throw new Error('SQL requires exactly one Up Migration followed by one Down Migration.');
  }
  // Conservative fail-closed policy, including literals/comments; not a SQL sandbox/parser.
  if (/\b(begin|commit|rollback|abort|end|start|savepoint|release|prepare|discard)\b/i.test(content) ||
      /\b(nutrasa_migrations|pgmigrations|migration_checksums|pg_advisory_unlock\w*)\b/i.test(content)) {
    throw new Error('SQL transaction/session control or migration metadata access is prohibited.');
  }
  return Object.freeze({ path, name, sha256: sha256(bytes), content });
}

export async function readSqlSnapshots(directory: string) {
  const entries = await readdir(directory, { withFileTypes: true });
  const snapshots: SqlSnapshot[] = [];
  const versions = new Set<number>();
  for (const entry of entries) {
    if (entry.name === '.gitkeep' && entry.isFile()) continue;
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('Only regular SQL files are allowed.');
    const path = join(directory, entry.name);
    const snapshot = snapshotSql(path, await readFile(path));
    const version = migrationVersion(snapshot.name);
    if (versions.has(version)) throw new Error('Duplicate migration version.');
    versions.add(version);
    snapshots.push(snapshot);
  }
  return snapshots.sort((a, b) => migrationVersion(a.name) - migrationVersion(b.name));
}

export function assertIntegrity(snapshots: readonly SqlSnapshot[], state: IntegrityState) {
  const versions = new Set<number>();
  for (const file of snapshots) {
    const version = migrationVersion(file.name);
    if (versions.has(version) || basename(file.path) !== `${file.name}.sql` ||
        !/^[a-f0-9]{64}$/.test(file.sha256)) {
      throw new Error('Invalid migration snapshot identity.');
    }
    versions.add(version);
  }
  for (const name of state.history) migrationVersion(name);
  if (!state.ledgerExists || (!state.historyExists &&
      (state.history.length > 0 || state.ledger.length > 0))) {
    throw new Error('Manual bootstrap required or inconsistent metadata.');
  }
  const files = new Map(snapshots.map((file) => [file.name, file.sha256]));
  if (files.size !== snapshots.length || new Set(state.history).size !== state.history.length) {
    throw new Error('Duplicate migration identity.');
  }
  const ledger = new Map<string, string>();
  for (const entry of state.ledger) {
    migrationVersion(entry.name);
    if (ledger.has(entry.name) || !/^[a-f0-9]{64}$/.test(entry.sha256) ||
        files.get(entry.name) !== entry.sha256) {
      throw new Error('Historical migration missing, changed, or ledger invalid.');
    }
    ledger.set(entry.name, entry.sha256);
  }
  if (snapshots.slice(0, ledger.size).some((file) => !ledger.has(file.name)) ||
      state.history.some((name, index) => snapshots[index]?.name !== name || !ledger.has(name))) {
    throw new Error('Migration history and checksum ledger disagree.');
  }
}

export async function executeAfterIntegrityCheck<T>(
  snapshots: readonly SqlSnapshot[], state: IntegrityState, execute: () => Promise<T>,
) {
  assertIntegrity(snapshots, state);
  return execute();
}
