export type Role = "user" | "admin";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface UserResponse {
  user: User;
}

export interface UserListResponse {
  users: User[];
  total: number;
}

export interface FieldErrorDetail {
  field: string;
  message: string;
}
