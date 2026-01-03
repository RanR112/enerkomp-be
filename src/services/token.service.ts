/**
 * @file TokenService – Generasi dan verifikasi JWT (Access & Refresh)
 * @description
 * Layanan terpusat untuk manajemen token:
 * - Generate access token (short-lived)
 * - Generate refresh token (long-lived)
 * - Verifikasi & decode token
 * - Custom payload validation
 *
 * @security
 * - Secret key wajib dari environment (tidak hardcoded)
 * - Access token default 15 menit, refresh token 1 hari (dapat dikonfigurasi)
 * - Hindari menyimpan sensitive data di payload
 * - Error handling jelas untuk expired/invalid token
 *
 * @usage
 * const tokenService = new TokenService({
 *   accessTokenSecret: process.env.JWT_SECRET!,
 *   refreshTokenSecret: process.env.JWT_REFRESH_SECRET!,
 *   accessTokenExpiresIn: '15m',
 *   refreshTokenExpiresIn: '7d'
 * });
 *
 * const accessToken = tokenService.generateAccessToken({ id: '123' });
 * const refreshToken = tokenService.generateRefreshToken({ id: '123' });
 *
 * @dependencies
 * - `jsonwebtoken` v9+ (dukungan ES modules & type safety)
 */

import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";

export interface TokenServiceConfig {
    accessTokenSecret: string;
    refreshTokenSecret: string;
    accessTokenExpiresIn: number;
    refreshTokenExpiresIn: number;
}

export class TokenService {
    constructor(private config: TokenServiceConfig) {
        if (!config.accessTokenSecret || !config.refreshTokenSecret) {
            throw new Error("JWT secrets must be provided");
        }
    }

    /**
     * Generate access token (short-lived)
     * @param payload - Data yang disisipkan (minimal: { id, role })
     * @param options - Opsi tambahan untuk jwt.sign()
     * @returns Signed JWT string
     */
    generateAccessToken(payload: object, options: SignOptions = {}): string {
        return jwt.sign(payload, this.config.accessTokenSecret, {
            expiresIn: this.config.accessTokenExpiresIn,
            ...options,
        });
    }

    /**
     * Generate refresh token (long-lived)
     * @param payload - Data yang disisipkan (minimal: { id })
     * @param options - Opsi tambahan
     * @returns Signed JWT string
     */
    generateRefreshToken(payload: object, options: SignOptions = {}): string {
        return jwt.sign(payload, this.config.refreshTokenSecret, {
            expiresIn: this.config.refreshTokenExpiresIn,
            ...options,
        });
    }

    /**
     * Verifikasi dan decode token
     * @param token - JWT string
     * @param isRefresh - Jika true, verifikasi dengan refresh secret
     * @returns Payload terverifikasi
     * @throws TokenExpiredError, JsonWebTokenError, dll
     */
    verifyToken<T extends JwtPayload = JwtPayload>(
        token: string,
        isRefresh: boolean = false
    ): T {
        const secret = isRefresh
            ? this.config.refreshTokenSecret
            : this.config.accessTokenSecret;

        return jwt.verify(token, secret) as T;
    }
}
