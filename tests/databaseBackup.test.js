const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDatabaseUrl, pgDumpArguments, pgRestoreArguments } = require('../src/utils/databaseBackup');

test('database backup parses PostgreSQL credentials into libpq environment variables', () => {
  const environment = parseDatabaseUrl('postgresql://backup_user:p%40ss%3Aword@db.example.test:5433/eduportal?sslmode=require&schema=public');
  assert.equal(environment.PGHOST, 'db.example.test');
  assert.equal(environment.PGPORT, '5433');
  assert.equal(environment.PGUSER, 'backup_user');
  assert.equal(environment.PGPASSWORD, 'p@ss:word');
  assert.equal(environment.PGDATABASE, 'eduportal');
  assert.equal(environment.PGSSLMODE, 'require');
});

test('database backups refuse absent and non-PostgreSQL connection strings', () => {
  assert.throws(() => parseDatabaseUrl(''), /DATABASE_URL/);
  assert.throws(() => parseDatabaseUrl('mysql://user:pass@host/db'), /PostgreSQL only/);
});

test('pg_dump and pg_restore use safe archive modes and omit credentials from arguments', () => {
  const dumpArgs = pgDumpArguments('C:/tmp/database.dump');
  const restoreArgs = pgRestoreArguments('C:/tmp/database.dump');
  assert.deepEqual(dumpArgs, ['--format=custom', '--no-owner', '--no-privileges', '--file', 'C:/tmp/database.dump']);
  assert.ok(restoreArgs.includes('--single-transaction'));
  assert.ok(restoreArgs.includes('--clean'));
  assert.equal(dumpArgs.some(argument => argument.includes('password')), false);
  assert.equal(restoreArgs.some(argument => argument.includes('password')), false);
});
