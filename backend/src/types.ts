export type Role = 'user' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  tokenVersion: number;
  createdAt: string;
  updatedAt: string;
}

export type PublicUser = Omit<User, 'passwordHash' | 'tokenVersion'>;

// Copies fields explicitly so a new secret field on User can never leak by default.
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
