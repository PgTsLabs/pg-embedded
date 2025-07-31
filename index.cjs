const { PostgresInstance: Postgres } = require('./binding.cjs')

class PostgresInstance extends Postgres {
  constructor(settings) {
    super(settings)
    // catch Ctrl+C
    process.on('SIGINT', async () => {
      await this.cleanup()
    });
    // catch kill command
    process.on('SIGTERM', async () => {
      await this.cleanup()
    });
  }
}

module.exports = Object.assign(require('./binding.cjs'), {
  PostgresInstance
});