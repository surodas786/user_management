import path from 'node:path';
import { createApp } from './app';
import { loadConfig } from './config';
import { ensureBootstrapAdmin } from './services/bootstrapAdmin';
import { warmUpPasswordCheck } from './services/password';
import { JsonUserStore } from './services/userStore';

function loadEnvFile(): void {
  try {
    process.loadEnvFile(path.resolve(__dirname, '../.env'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  const store = new JsonUserStore(config.usersFile);

  await warmUpPasswordCheck(config.bcryptCost);
  await ensureBootstrapAdmin(config, store);

  createApp({ config, store }).listen(config.port, () => {
    console.info(`user_management API listening on port ${config.port}`);
  });
}

main().catch((error: unknown) => {
  console.error('Failed to start:', error instanceof Error ? error.message : error);
  process.exit(1);
});
