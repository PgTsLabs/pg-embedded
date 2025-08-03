import anyTest, { type TestFn } from 'ava'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { PgRewindTool, PostgresInstance } from '../index.js'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const execAsync = promisify(exec)

const test = anyTest as TestFn<{
  pgMaster: PostgresInstance
  standbyConnection: { host: string; port: number; user: string; password: string }
}>

// This test setup is more complex as it requires a master and a standby server.
test.before(async (t) => {
  // Setup shared directories
  const archiveDir = path.resolve(__dirname, 'assets', 'wal_archive')
  await fs.mkdir(archiveDir, { recursive: true })

  // 1. Initialize master
  const master = new PostgresInstance({
    databaseName: 'master_db',
    username: 'postgres',
    password: 'password',
    port: 54321,
  })
  await master.start()

  // Enable wal_log_hints and WAL archiving on master for pg_rewind compatibility
  const masterConfPath = path.join(master.dataDir, 'postgresql.conf')

  let masterConf = await fs.readFile(masterConfPath, 'utf-8')
  masterConf += `
# Enable wal_log_hints for pg_rewind
wal_log_hints = on

# Enable WAL archiving for pg_rewind
archive_mode = on
archive_command = 'cp "%p" "${archiveDir}/%f"'
restore_command = 'cp "${archiveDir}/%f" "%p"'
max_wal_senders = 3
wal_level = replica
`
  await fs.writeFile(masterConfPath, masterConf)

  // Restart master to apply the configuration
  await master.stop()
  await master.start()

  t.context.pgMaster = master

  // 2. Create a base backup from the master
  const backupDir = path.resolve(__dirname, 'assets', 'standby_backup')
  await fs.mkdir(backupDir, { recursive: true })
  const basebackupCmd = `"${path.join(master.programDir, 'bin', 'pg_basebackup')}" -h ${master.connectionInfo.host} -p ${master.connectionInfo.port} -U ${master.connectionInfo.username} -D "${backupDir}" -Fp -X fetch`
  await execAsync(basebackupCmd, { env: { PGPASSWORD: master.connectionInfo.password } })

  // Set correct permissions for PostgreSQL data directory (0700)
  await fs.chmod(backupDir, 0o700)

  // 3. Configure standby
  const standbyConfPath = path.join(backupDir, 'postgresql.conf')
  let conf = await fs.readFile(standbyConfPath, 'utf-8')

  // Remove any existing port configuration (commented or uncommented)
  conf = conf.replace(/(#?\s*port\s*=\s*\d+)/g, '')

  // Add explicit port configuration at the end
  conf += '\n# Port configuration for standby\nport = 54322\n'

  // Add wal_log_hints and WAL archiving for pg_rewind compatibility
  conf += `# Enable wal_log_hints for pg_rewind
wal_log_hints = on

# Enable WAL archiving and restore for pg_rewind
archive_mode = on
archive_command = 'cp "%p" "${archiveDir}/%f"'
restore_command = 'cp "${archiveDir}/%f" "%p"'
max_wal_senders = 3
wal_level = replica
`

  await fs.writeFile(standbyConfPath, conf)

  // Clear postgresql.auto.conf to prevent port override
  const autoConfPath = path.join(backupDir, 'postgresql.auto.conf')
  await fs.writeFile(autoConfPath, '# Auto-generated file cleared to prevent port conflicts\n')

  await fs.writeFile(path.join(backupDir, 'standby.signal'), '')
  const recoveryConf = `
primary_conninfo = 'host=${master.connectionInfo.host} port=${master.connectionInfo.port} user=${master.connectionInfo.username} password=${master.connectionInfo.password}'
`
  await fs.appendFile(standbyConfPath, recoveryConf)

  // 4. Start standby server manually
  const pgCtlPath = path.join(master.programDir, 'bin', 'pg_ctl')
  const startCmd = `"${pgCtlPath}" -D "${backupDir}" -l "${backupDir}/logfile" start`
  await execAsync(startCmd)
  await new Promise((resolve) => setTimeout(resolve, 2000)) // wait for standby to start
  t.context.standbyConnection = { host: 'localhost', port: 54322, user: 'postgres', password: 'password' }

  // 4.5. Create some activity on master to generate WAL records
  const psqlPath = path.join(master.programDir, 'bin', 'psql')
  const createTableCmd = `"${psqlPath}" -h ${master.connectionInfo.host} -p ${master.connectionInfo.port} -U ${master.connectionInfo.username} -d ${master.connectionInfo.databaseName} -c "CREATE TABLE test_table (id SERIAL PRIMARY KEY, data TEXT); INSERT INTO test_table (data) VALUES ('test data 1'), ('test data 2');"`
  await execAsync(createTableCmd, { env: { PGPASSWORD: master.connectionInfo.password } })

  // Force a checkpoint to ensure WAL is written
  const checkpointCmd = `"${psqlPath}" -h ${master.connectionInfo.host} -p ${master.connectionInfo.port} -U ${master.connectionInfo.username} -d ${master.connectionInfo.databaseName} -c "CHECKPOINT;"`
  await execAsync(checkpointCmd, { env: { PGPASSWORD: master.connectionInfo.password } })

  // Wait for replication to catch up
  await new Promise((resolve) => setTimeout(resolve, 1000))

  // 5. Promote standby and stop master to simulate a failover
  const promoteCmd = `"${pgCtlPath}" -D "${backupDir}" promote`
  await execAsync(promoteCmd)
  // Wait for promotion to complete
  await new Promise((resolve) => setTimeout(resolve, 3000))
  await master.stop()
})

test.after.always(async (t) => {
  await t.context.pgMaster?.stop().catch(() => {}) // master might be already stopped
  const backupDir = path.resolve(__dirname, 'assets', 'standby_backup')
  const pgCtlPath = path.join(t.context.pgMaster.programDir, 'bin', 'pg_ctl')
  const stopCmd = `"${pgCtlPath}" -D "${backupDir}" stop`
  await execAsync(stopCmd).catch(() => {}) // standby might be already stopped
  await fs.rm(backupDir, { recursive: true, force: true }).catch(() => {})
})

test('should rewind a former master', async (t) => {
  const { pgMaster, standbyConnection } = t.context

  // pgMaster is now behind pgStandby. We need to rewind it.
  const rewindTool = new PgRewindTool({
    connection: {
      host: standbyConnection.host,
      port: standbyConnection.port,
      username: standbyConnection.user,
      password: standbyConnection.password,
    },
    programDir: path.join(pgMaster.programDir, 'bin'),
    config: {
      targetPgdata: pgMaster.dataDir,
      sourceServer: `host=${standbyConnection.host} port=${standbyConnection.port} user=${standbyConnection.user} password=${standbyConnection.password}`,
      progress: true,
      restoreTargetWal: true, // Enable automatic WAL retrieval from archive
    },
  })

  const result = await rewindTool.execute()

  if (result.exitCode !== 0) {
    console.log('stdout:', result.stdout)
    console.log('stderr:', result.stderr)
  }

  t.is(result.exitCode, 0, 'pg_rewind should execute successfully')
})
