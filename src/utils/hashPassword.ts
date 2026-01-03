/**
 * @file HashPassword Adapter - Kompatibilitas dengan fungsi lama
 * @description
 * Menyediakan fungsi `hashPassword()` dan `comparePassword()` seperti versi lama,
 * namun di-backup oleh `PasswordService` versi OOP.
 *
 * @usage
 * import { hashPassword, comparePassword } from '@/utils/hashPassword';
 * const hashed = await hashPassword("secret");
 * const match = await comparePassword("secret", hashed);
 */

import { PasswordService } from "../services/password.service";

const passwordService = new PasswordService();

export const hashPassword = async (password: string): Promise<string> => {
    return passwordService.hash(password);
};

export const comparePassword = async (
    plain: string,
    hashed: string
): Promise<boolean> => {
    return passwordService.verify(plain, hashed);
};
