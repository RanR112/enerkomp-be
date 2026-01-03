/**
 * @file Konfigurasi jwt
 * @description
 * Menyediakan nilai konfigurasi yang digunakan untuk jwt:
 * - Secret JWT untuk access dan refresh
 * - Waktu Expires JWT
 *
 * @usage
 * import { jwtConfig } from '@/config/app.config';
 * const accessTokenSecret: jwtConfig.accessSecret,
 */

import { parseTime } from "../utils/parseTime";
import dotenv from "dotenv";

dotenv.config();

export interface JwtConfigOptions {
    accessTokenSecret: string;
    refreshTokenSecret: string;
    accessTokenExpiresIn: number;
    refreshTokenExpiresIn: number;
    resetTokenExpiresIn: number;
    forgotPasswordCooldown: number;
}

export class JwtConfig {
    private readonly config: JwtConfigOptions;

    constructor() {
        this.config = {
            accessTokenSecret: process.env.JWT_SECRET ?? "enerkomp_access_secret",

            refreshTokenSecret: process.env.JWT_REFRESH_SECRET ?? "enerkomp_refresh_secret",

            accessTokenExpiresIn: parseTime(
                process.env.ACCESS_TOKEN_EXPIRES_IN,
                15 * 60 * 1000 // 15 menit
            ),

            refreshTokenExpiresIn: parseTime(
                process.env.REFRESH_TOKEN_EXPIRES_IN,
                24 * 60 * 60 * 1000 // 1 hari
            ),

            resetTokenExpiresIn: parseTime(
                process.env.FORGOT_PASSWORD_TOKEN_EXPIRES_IN,
                2 * 60 * 1000 // 2 menit
            ),

            forgotPasswordCooldown: parseTime(
                process.env.FORGOT_PASSWORD_TOKEN_EXPIRES_IN,
                2 * 60 * 1000 // 2 menit
            ),
        };
    }

    // ===== Getters =====

    get accessTokenSecret(): string {
        return this.config.accessTokenSecret;
    }

    get refreshTokenSecret(): string {
        return this.config.refreshTokenSecret;
    }

    get accessTokenExpiresIn(): number {
        return this.config.accessTokenExpiresIn;
    }

    get refreshTokenExpiresIn(): number {
        return this.config.refreshTokenExpiresIn;
    }

    get resetTokenExpiresIn(): number {
        return this.config.resetTokenExpiresIn;
    }

    get forgotPasswordCooldown(): number {
        return this.config.forgotPasswordCooldown;
    }
}

/**
 * Singleton instance
 * Digunakan di seluruh aplikasi
 */
export const jwtConfig = new JwtConfig();
