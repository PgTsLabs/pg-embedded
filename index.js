import { PostgresInstance as Postgres } from './binding.js'
export * from './binding.js';

export class PostgresInstance extends Postgres {
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