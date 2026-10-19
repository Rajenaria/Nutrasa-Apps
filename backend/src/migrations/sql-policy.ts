import { governanceFunction, governanceParameters } from '../governance-contract.ts';

interface Token {
  kind: 'word' | 'identifier' | 'string' | 'body' | 'symbol' | 'marker';
  value: string;
}

function reject(): never {
  throw new Error('Unsupported or unsafe migration SQL.');
}

// A conservative lexer/policy for reviewed migrations, not a PostgreSQL syntax parser or sandbox.
function tokenize(sql: string) {
  const tokens: Token[] = [];
  const markers: string[] = [];
  let index = 0;
  while (index < sql.length) {
    const rest = sql.slice(index);
    if (/^\s/.test(rest)) { index++; continue; }
    if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', index);
      const comment = sql.slice(index, end < 0 ? sql.length : end);
      if (/^-- (Up|Down) Migration$/.test(comment)) {
        markers.push(comment);
        tokens.push({ kind: 'marker', value: comment });
      }
      index = end < 0 ? sql.length : end;
      continue;
    }
    if (rest.startsWith('/*')) {
      let depth = 1;
      index += 2;
      while (depth > 0 && index < sql.length) {
        if (sql.startsWith('/*', index)) { depth++; index += 2; }
        else if (sql.startsWith('*/', index)) { depth--; index += 2; }
        else index++;
      }
      if (depth !== 0) reject();
      continue;
    }
    const escaped = /^[eE]'/.test(rest);
    if (escaped || rest[0] === "'" || rest[0] === '"') {
      if (escaped) index++;
      const quote = sql[index];
      index++;
      let value = '';
      let closed = false;
      while (index < sql.length) {
        const character = sql[index];
        if (character === quote) {
          if (sql[index + 1] === quote) { value += quote; index += 2; continue; }
          index++; closed = true; break;
        }
        if (character === '\\') {
          // Reject ambiguous standard strings/identifiers; E strings explicitly opt in to escaping.
          if (!escaped || index + 1 >= sql.length) reject();
          value += sql.slice(index, index + 2); index += 2;
        } else { value += character; index++; }
      }
      if (!closed) reject();
      tokens.push({ kind: quote === '"' ? 'identifier' : 'string', value });
      continue;
    }
    const delimiter = /^(\$[a-zA-Z_][a-zA-Z_0-9]*\$|\$\$)/.exec(rest)?.[0];
    if (delimiter) {
      const end = sql.indexOf(delimiter, index + delimiter.length);
      if (end < 0) reject();
      tokens.push({ kind: 'body', value: sql.slice(index + delimiter.length, end) });
      index = end + delimiter.length;
      continue;
    }
    const word = /^[a-zA-Z_][a-zA-Z_0-9$]*/.exec(rest)?.[0];
    if (word) {
      // Unicode escape syntax needs a parser; never silently treat U& quotes as ordinary tokens.
      if (word.toLowerCase() === 'u' && rest[word.length] === '&') reject();
      tokens.push({ kind: 'word', value: word.toLowerCase() }); index += word.length; continue;
    }
    const scalar = /^(?:\$[1-9][0-9]*|[0-9]+(?:\.[0-9]+)?)/.exec(rest)?.[0];
    if (scalar) { tokens.push({ kind: 'symbol', value: scalar }); index += scalar.length; continue; }
    const character = rest[0];
    if (!character || !'(),;.[]:+-*/%=<>!|&^~'.includes(character)) reject();
    tokens.push({ kind: 'symbol', value: character }); index++;
  }
  return { tokens, markers };
}

const forbiddenWords = new Set(['commit', 'rollback', 'abort', 'start', 'savepoint', 'release',
  'prepare', 'discard', 'reset', 'call', 'do', 'execute', 'vacuum', 'copy', 'load']);
const metadata = new Set(['nutrasa_migrations', 'pgmigrations', 'migration_checksums']);

function inspectTokens(tokens: readonly Token[], body = false, conflictUpdate = false) {
  for (const [index, token] of tokens.entries()) {
    // Keep metadata names forbidden in literals too: SQL-taking functions must not hide those references.
    if (token.kind === 'string' && /\b(nutrasa_migrations|pgmigrations|migration_checksums|pg_advisory_unlock\w*)\b/i.test(token.value)) reject();
    const conflictDo = conflictUpdate && token.value === 'do' && tokens[index - 1]?.value === ')'
      && tokens[index + 1]?.kind === 'word' && tokens[index + 1]?.value === 'update';
    if (token.kind === 'word' && ((!conflictDo && forbiddenWords.has(token.value)) ||
        (!body && (token.value === 'begin' || token.value === 'end')))) reject();
    if ((token.kind === 'word' || token.kind === 'identifier') &&
        (metadata.has(token.value.toLowerCase()) || /^pg_advisory_unlock/i.test(token.value) ||
          token.value.toLowerCase() === 'set_config')) reject();
  }
}

const types = new Set(['uuid', 'text', 'integer', 'bigint', 'smallint', 'boolean', 'numeric',
  'jsonb', 'timestamptz', 'bytea', 'void']);

// Digest helpers opt into one SELECT, INVOKER, a fixed path and STABLE/IMMUTABLE.
// Existing static PL/pgSQL support stays unchanged; neither path is a SQL sandbox.
function inspectFunction(statement: readonly Token[]) {
  inspectTokens(statement);
  if (statement[4]?.value === governanceFunction) {
    inspectGovernanceFunction(statement);
    return;
  }
  let index = 0;
  const take = (value: string) => {
    const token = statement[index++];
    if (!token || token.value !== value || !['word', 'symbol'].includes(token.kind)) reject();
  };
  const name = () => {
    const token = statement[index++];
    if (token?.kind !== 'word' || !/^[a-z_][a-z_0-9]*$/.test(token.value)) reject();
  };
  const type = () => {
    const token = statement[index++];
    if (token?.kind !== 'word' || !types.has(token.value)) reject();
    if (statement[index]?.value === '[') {
      if (token.value !== 'uuid') reject();
      take('['); take(']');
    }
  };
  take('create'); take('function'); take('nutrasa'); take('.'); name(); take('(');
  if (statement[index]?.value !== ')') {
    while (true) {
      name(); type();
      if (statement[index]?.value !== ',') break;
      take(',');
    }
  }
  take(')'); take('returns'); type(); take('language');
  const language = statement[index]?.value;
  if (language === 'sql') {
    take('sql');
    const volatility = statement[index]?.value;
    if (volatility !== 'stable' && volatility !== 'immutable') reject();
    take(volatility); take('security'); take('invoker');
    take('set'); take('search_path'); take('='); take('pg_catalog'); take(','); take('pg_temp');
  } else take('plpgsql');
  take('as');
  const body = statement[index++];
  if (body?.kind !== 'body' || index !== statement.length) reject();
  // Header validation does not grant permission to ignore executable content inside the body.
  const nested = tokenize(body.value);
  if (nested.markers.length) reject();
  inspectTokens(nested.tokens, true);
  let parentheses = 0;
  for (const token of nested.tokens) {
    if (token.kind === 'symbol' && token.value === '(') parentheses++;
    if (token.kind === 'symbol' && token.value === ')' && --parentheses < 0) reject();
  }
  if (parentheses !== 0) reject();
  if (language === 'sql') {
    if (nested.tokens[0]?.kind !== 'word' || nested.tokens[0]?.value !== 'select' ||
        nested.tokens.at(-1)?.value !== ';' ||
        nested.tokens.slice(0, -1).some(token => token.value === ';' && token.kind === 'symbol') ||
        nested.tokens.some(token => token.kind === 'body' || token.kind === 'marker' ||
          (token.kind === 'word' && ['insert', 'update', 'delete', 'merge', 'into', 'lock', 'begin'].includes(token.value)))) reject();
    return;
  }
  let position = 0;
  const block = (): void => {
    const opening = nested.tokens[position++];
    if (opening?.kind !== 'word' || opening.value !== 'begin') reject();
    while (!(nested.tokens[position]?.kind === 'word' && nested.tokens[position]?.value === 'end')) {
      const token = nested.tokens[position];
      if (!token) reject();
      if (token.kind === 'word' && token.value === 'begin') { block(); continue; }
      if (token.kind !== 'word' || !['return', 'perform', 'select', 'insert', 'update', 'delete', 'raise'].includes(token.value)) reject();
      const start = position++;
      while (!(nested.tokens[position]?.kind === 'symbol' && nested.tokens[position]?.value === ';')) {
        const next = nested.tokens[position++];
        if (!next || next.kind === 'body' || (next.kind === 'word' && ['begin', 'end', 'if', 'loop'].includes(next.value))) reject();
      }
      if (position === start + 1 && token.value !== 'return') reject();
      position++;
    }
    position++;
    const closing = nested.tokens[position++];
    if (closing?.kind !== 'symbol' || closing.value !== ';') reject();
  };
  block();
  if (position !== nested.tokens.length) reject();
}

function inspectGovernanceFunction(statement: readonly Token[]) {
  const header = ['create', 'function', 'nutrasa', '.', governanceFunction, '(',
    ...governanceParameters.flatMap(([name, type], index) => index ? [',', name, type] : [name, type]),
    ')', 'returns', 'uuid', 'language', 'plpgsql', 'volatile', 'security', 'definer',
    'set', 'search_path', '=', 'pg_catalog', ',', 'pg_temp', 'as'];
  if (statement.length !== header.length + 1 || !header.every((value, index) =>
      statement[index]?.value === value && statement[index]?.kind ===
        (['.', '(', ')', ',', '='].includes(value) ? 'symbol' : 'word'))) reject();
  const body = statement.at(-1);
  if (body?.kind !== 'body') reject();
  const nested = tokenize(body.value);
  if (nested.markers.length) reject();
  inspectTokens(nested.tokens, true, true);
  const tokens = nested.tokens;
  let index = 0;
  const is = (word: string) => tokens[index]?.kind === 'word' && tokens[index]?.value === word;
  const take = (value: string) => {
    const token = tokens[index++];
    if (!token || token.value !== value || token.kind !== (value === ';' ? 'symbol' : 'word')) reject();
  };
  const expression = (ending: string) => {
    const start = index;
    let depth = 0;
    while (index < tokens.length) {
      const token = tokens[index];
      if (!token || ['body', 'marker'].includes(token.kind)) reject();
      if (token.value === ending && depth === 0 && token.kind === (ending === ';' ? 'symbol' : 'word')) break;
      if (token.kind === 'symbol' && token.value === ';') reject();
      if (token.kind === 'word' && ['begin', 'if', 'loop', 'declare', 'exception'].includes(token.value)) {
        // RAISE EXCEPTION is consumed before scanning the remainder of that statement.
        reject();
      }
      if (token.kind === 'symbol' && token.value === '(') depth++;
      if (token.kind === 'symbol' && token.value === ')' && --depth < 0) reject();
      index++;
    }
    if (index === start || index >= tokens.length || depth) reject();
  };
  take('declare');
  while (!is('begin')) {
    const name = tokens[index++]; const type = tokens[index++];
    if (name?.kind !== 'word' || !/^v_[a-z_]+$/.test(name.value) ||
        type?.kind !== 'word' || !['uuid', 'text', 'boolean', 'bigint'].includes(type.value)) reject();
    take(';');
  }
  take('begin');
  const statements = () => {
    while (!is('end') && !is('else')) {
      if (is('if')) {
        take('if'); expression('then'); take('then'); statements();
        if (is('else')) { take('else'); statements(); }
        take('end'); take('if'); take(';');
      } else {
        const first = tokens[index++];
        if (first?.kind !== 'word' || !['select', 'perform', 'insert', 'raise', 'return'].includes(first.value)) reject();
        if (first.value === 'raise') take('exception');
        expression(';'); take(';');
      }
    }
  };
  statements(); take('end'); take(';');
  if (index !== tokens.length) reject();
  // This is a narrow reviewed grammar, not a SQL sandbox or proof of writer semantics.
}

function inspectDigestRevoke(statement: readonly Token[]) {
  // No role grants, wildcards, procedures or metadata targets are admitted here.
  const values = statement.map(token => token.value);
  const prefix = ['revoke', 'execute', 'on', 'function', 'nutrasa', '.'];
  const expected: Record<string, string[]> = {
    [governanceFunction]: governanceParameters.map(([, type]) => type),
    catalog_revision_content_mutable_v1: ['uuid', '[', ']'],
    catalog_category_parent_valid_v1: ['uuid', 'uuid'],
    catalog_publication_preflight_v1: ['uuid'],
    catalog_source_permission_payload_v1: ['uuid', 'text', 'jsonb', 'boolean', 'text', 'timestamptz', 'timestamptz', 'text', 'text'],
    catalog_revision_payload_v1: ['uuid', 'uuid', '[', ']'],
    catalog_payload_digest_v1: ['jsonb'],
  };
  const name = values[6] ?? '';
  const argumentsList = expected[name];
  if (!argumentsList) reject();
  const signature = name === 'catalog_revision_content_mutable_v1' ? ['uuid', '[', ']'] :
    name === 'catalog_revision_payload_v1' ? ['uuid', ',', 'uuid', '[', ']'] :
    argumentsList.flatMap((value, index) => index === 0 ? [value] : [',', value]);
  const exact = [...prefix, name, '(', ...signature, ')', 'from', 'public'];
  if (statement.length !== exact.length || !exact.every((value, index) => values[index] === value &&
      statement[index]?.kind === (['.', '(', ')', ',', '[', ']'].includes(value) ? 'symbol' : 'word'))) reject();
}

export function assertMigrationSqlPolicy(sql: string) {
  const { tokens, markers } = tokenize(sql);
  if (markers.join('\n') !== '-- Up Migration\n-- Down Migration') reject();
  let statement: Token[] = [];
  let parentheses = 0;
  const inspect = () => {
    if (statement.length === 0) reject();
    const first = statement[0];
    if (first?.kind !== 'word') reject();
    if (first.value === 'create' && statement[1]?.value === 'function') inspectFunction(statement);
    else if (first.value === 'revoke') inspectDigestRevoke(statement);
    else {
      if (!['create', 'alter', 'drop', 'select', 'insert', 'update', 'delete', 'lock'].includes(first.value)) reject();
      const second = statement[1];
      if (first.value === 'create' && !(second?.kind === 'word' &&
          (['table', 'index'].includes(second.value) ||
            (second.value === 'unique' && statement[2]?.value === 'index')))) reject();
      if (first.value === 'alter' && second?.value !== 'table') reject();
      if (first.value === 'drop' && !['table', 'index', 'function'].includes(second?.value ?? '')) reject();
      if (first.value === 'lock' && second?.value !== 'table') reject();
      inspectTokens(statement);
      // Quoted data is allowed; anonymous/dynamic executable dollar bodies are not.
      if (statement.some(token => token.kind === 'body')) reject();
      if (statement.some(token => token.kind === 'word' && ['function', 'procedure'].includes(token.value)) &&
          !(first.value === 'drop' && statement[1]?.value === 'function')) reject();
    }
    statement = [];
  };
  for (const token of tokens) {
    if (token.kind === 'marker') {
      if (statement.length || parentheses !== 0) reject();
      continue;
    }
    if (token.kind === 'symbol' && token.value === '(') parentheses++;
    if (token.kind === 'symbol' && token.value === ')' && --parentheses < 0) reject();
    if (token.kind === 'symbol' && token.value === ';') {
      if (parentheses !== 0) reject();
      inspect();
    } else statement.push(token);
  }
  if (statement.length || parentheses !== 0) reject();
}
