import { z } from 'zod';

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Usernames need at least 3 characters.')
  .max(20, 'Usernames can have at most 20 characters.')
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'Use letters, digits, dashes and underscores only.');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('Please enter a valid email address.'));

export const passwordSchema = z
  .string()
  .min(8, 'Passwords need at least 8 characters.')
  .max(128, 'Passwords can have at most 128 characters.');

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  login: z.string().trim().min(1, 'Enter your username or email.').max(254),
  password: z.string().min(1, 'Enter your password.').max(128),
});

export const resetRequestSchema = z.object({ email: emailSchema });

export const resetConfirmSchema = z.object({
  token: z.string().min(10).max(200),
  password: passwordSchema,
});

export function usernameKey(username: string): string {
  return username.trim().toLowerCase();
}
