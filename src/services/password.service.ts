/**
 * @file PasswordService - Hashing dan verifikasi password dengan bcrypt
 * @description
 * Layanan untuk menangani operasi keamanan password:
 * - Hash password dengan salt cost yang dapat dikonfigurasi
 * - Verifikasi plaintext vs hashed password
 * - Proteksi terhadap timing attack via constant-time compare
 *
 * @security
 * - Salt rounds default 12
 * - Gunakan `bcrypt.compare()` yang constant-time
 * - Tidak ada log password/plaintext di mana pun
 * - Error message generik → hindari user enumeration
 *
 * @usage
 * const passwordService = new PasswordService({ saltRounds: 12 });
 *
 * const hashed = await passwordService.hash("mypassword");
 * const isValid = await passwordService.verify("mypassword", hashed);
 *
 * @dependencies
 * - `bcrypt` v5+ (async API, aman terhadap DOS via adaptive cost)
 */

import bcrypt from "bcrypt";

export interface PasswordServiceConfig {
    saltRounds: number;
}

export class PasswordService {
    constructor(private config: PasswordServiceConfig = { saltRounds: 12 }) {}

    /**
     * Hash password dengan bcrypt
     * @param password - Plaintext password (minimal 8 karakter direkomendasikan)
     * @returns Hashed password (string)
     * @throws Error jika password terlalu lemah atau hashing gagal
     */
    async hash(password: string): Promise<string> {
        if (!password || typeof password !== "string") {
            throw new Error("Password must be a non-empty string");
        }
        if (password.length < 6) {
            throw new Error("Password too weak: minimum 6 characters required");
        }
        return bcrypt.hash(password, this.config.saltRounds);
    }

    /**
     * Verifikasi password vs hash
     * @param plain - Plaintext password
     * @param hashed - Hash yang disimpan di DB
     * @returns true jika cocok, false jika tidak
     * @note Gunakan constant-time compare → aman dari timing attack
     */
    async verify(plain: string, hashed: string): Promise<boolean> {
        if (!plain || !hashed) return false;
        try {
            return await bcrypt.compare(plain, hashed);
        } catch {
            return false; // Hindari leak error internal
        }
    }
}
