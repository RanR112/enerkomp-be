/**
 * @file GenerateToken Adapter – Kompatibilitas dengan fungsi lama
 * @description
 * Menyediakan fungsi `generateAccessToken()` dan `generateRefreshToken()`
 * seperti versi lama, namun di-backup oleh `TokenService`.
 *
 * @usage
 * import { generateAccessToken, generateRefreshToken } from '@/utils/generateToken';
 * const token = generateAccessToken({ id: '123' });
 */

import { jwtConfig } from "../config/jwt.config";
import { TokenService } from "../services/token.service";

// Ambil konfigurasi dari environment (sesuai struktur lama)
const tokenService = new TokenService({
    accessTokenSecret: jwtConfig.accessTokenSecret,
    refreshTokenSecret: jwtConfig.refreshTokenSecret,
    accessTokenExpiresIn: jwtConfig.accessTokenExpiresIn,
    refreshTokenExpiresIn: jwtConfig.refreshTokenExpiresIn,
});

export const generateAccessToken = (payload: object): string => {
    return tokenService.generateAccessToken(payload);
};

export const generateRefreshToken = (payload: object): string => {
    return tokenService.generateRefreshToken(payload);
};
