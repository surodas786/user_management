import type { Config } from '../config';
import { hashPassword } from './password';
import type { JsonUserStore } from './userStore';

export async function ensureBootstrapAdmin(config: Config, store: JsonUserStore): Promise<void> {
  const admin = config.bootstrapAdmin;
  if (!admin) {
    return;
  }

  const existing = await store.findByEmail(admin.email);
  if (existing) {
    if (existing.role !== 'admin') {
      console.warn('Bootstrap admin email belongs to a non-admin user; role left unchanged');
    }
    return;
  }

  await store.create({
    email: admin.email,
    name: 'Administrator',
    passwordHash: await hashPassword(admin.password, config.bcryptCost),
    role: 'admin',
  });
  console.info('Bootstrap admin created');
}
