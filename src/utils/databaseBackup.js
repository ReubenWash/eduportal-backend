const { execFile } = require('child_process');
const { promisify } = require('util');
const { mkdtemp, rm, stat } = require('fs/promises');
const { createWriteStream } = require('fs');
const { tmpdir } = require('os');
const path = require('path');
const { pipeline } = require('stream/promises');
const cloudinary = require('../config/cloudinary');

const execFileAsync = promisify(execFile);

const parseDatabaseUrl = (connectionString) => {
  if (!connectionString) throw new Error('DATABASE_URL or DATABASE_DIRECT_URL must be configured.');
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('Database backups currently support PostgreSQL only.');
  }
  if (!url.hostname || !url.pathname.slice(1)) throw new Error('Database connection URL is incomplete.');

  const environment = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  };
  const sslMode = url.searchParams.get('sslmode') || process.env.PGSSLMODE;
  if (sslMode) environment.PGSSLMODE = sslMode;
  return environment;
};

const pgDumpArguments = (outputPath) => [
  '--format=custom',
  '--no-owner',
  '--no-privileges',
  '--file', outputPath,
];

const pgRestoreArguments = (inputPath) => [
  '--clean',
  '--if-exists',
  '--no-owner',
  '--no-privileges',
  '--exit-on-error',
  '--single-transaction',
  inputPath,
];

const getPgEnvironment = () => parseDatabaseUrl(process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL);

const createTempDirectory = () => mkdtemp(path.join(tmpdir(), 'eduportal-db-backup-'));

const createDumpFile = async () => {
  const directory = await createTempDirectory();
  const filePath = path.join(directory, 'database.dump');
  try {
    await execFileAsync('pg_dump', pgDumpArguments(filePath), {
      env: getPgEnvironment(),
      timeout: Number(process.env.PG_DUMP_TIMEOUT_MS) || 60 * 60 * 1000,
      maxBuffer: 10 * 1024 * 1024,
    });
    const fileStats = await stat(filePath);
    if (!fileStats.size) throw new Error('pg_dump returned an empty backup archive.');
    return { directory, filePath, size: fileStats.size };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    if (error.code === 'ENOENT') throw new Error('pg_dump is not installed on this server. Install PostgreSQL client tools to enable backups.');
    throw error;
  }
};

const uploadDump = async (filePath, backupId) => {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error('Cloudinary credentials are required for durable backup storage.');
  }
  return cloudinary.uploader.upload(filePath, {
    resource_type: 'raw',
    type: 'authenticated',
    access_mode: 'authenticated',
    public_id: `eduportal/backups/database-${backupId}.dump`,
    overwrite: false,
  });
};

const getSignedDownloadUrl = (publicId) => cloudinary.utils.private_download_url(publicId, null, {
  resource_type: 'raw',
  type: 'authenticated',
  expires_at: Math.floor(Date.now() / 1000) + 300,
});

const downloadDump = async (publicId) => {
  const directory = await createTempDirectory();
  const filePath = path.join(directory, 'database.dump');
  try {
    const response = await fetch(getSignedDownloadUrl(publicId), { signal: AbortSignal.timeout(5 * 60 * 1000) });
    if (!response.ok || !response.body) throw new Error(`Could not download backup artifact (HTTP ${response.status}).`);
    await pipeline(require('stream').Readable.fromWeb(response.body), createWriteStream(filePath));
    const fileStats = await stat(filePath);
    if (!fileStats.size) throw new Error('Downloaded backup archive is empty.');
    return { directory, filePath, size: fileStats.size };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
};

const restoreDump = async (filePath) => {
  try {
    await execFileAsync('pg_restore', pgRestoreArguments(filePath), {
      env: getPgEnvironment(),
      timeout: Number(process.env.PG_RESTORE_TIMEOUT_MS) || 2 * 60 * 60 * 1000,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('pg_restore is not installed on this server. Install PostgreSQL client tools to enable restore.');
    throw error;
  }
};

module.exports = {
  parseDatabaseUrl,
  pgDumpArguments,
  pgRestoreArguments,
  createDumpFile,
  uploadDump,
  downloadDump,
  restoreDump,
  getSignedDownloadUrl,
};
