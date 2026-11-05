import type { LoginInput, RegisterInput } from "@/lib/api/types";

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

const NAME_MAX = 100;
const EMAIL_MAX = 254;
const PASSWORD_MIN = 8;
const PASSWORD_MAX_BYTES = 72;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(rawEmail: string): string | undefined {
  const email = rawEmail.trim();
  if (!email) return "Enter your email address.";
  if (email.length > EMAIL_MAX) return "Use an email of 254 characters or fewer.";
  if (!EMAIL_PATTERN.test(email)) return "Enter an email like name@example.com.";
  return undefined;
}

function validateNewPassword(password: string): string | undefined {
  if (password.length < PASSWORD_MIN) return "Use at least 8 characters.";
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return "Use a shorter password. The limit is 72 bytes.";
  }
  return undefined;
}

function compact<K extends string>(
  errors: Record<K, string | undefined>,
): FieldErrors<K> {
  return Object.fromEntries(
    Object.entries(errors).filter(([, message]) => message),
  ) as FieldErrors<K>;
}

/** Mirrors the API's rules for quick feedback. The API remains the authority. */
export function validateLogin(input: LoginInput) {
  return compact({
    email: validateEmail(input.email),
    password: input.password ? undefined : "Enter your password.",
  });
}

export function validateRegister(input: RegisterInput) {
  const name = input.name.trim();
  return compact({
    name: !name
      ? "Enter your name."
      : name.length > NAME_MAX
        ? "Use a name of 100 characters or fewer."
        : undefined,
    email: validateEmail(input.email),
    password: validateNewPassword(input.password),
  });
}
