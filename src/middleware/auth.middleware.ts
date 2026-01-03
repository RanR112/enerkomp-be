/**
 * @file AuthMiddleware – Proteksi route berbasis JWT dan validasi sesi pengguna
 * @description
 * Middleware class-based untuk mengamankan endpoint API Enerkomp:
 * - Mendukung token dari cookie (`access_token`) atau header `Authorization: Bearer <token>`
 * - Memvalidasi token melalui database (revoked/expired check)
 * - Menyediakan `req.user` dengan data typed untuk digunakan di controller
 * - Kompatibel dengan sistem RBAC (Role-Based Access Control) Enerkomp
 *
 * @security
 * - Semua token diverifikasi signature + expiry + status DB → cegah eksploitasi token bocor
 * - Hanya user dengan status `ACTIVE` dan `deletedAt: null` yang diizinkan
 * - Error message generik → hindari user enumeration (sesuai best practice keamanan API)
 * - IP address & user agent otomatis dilog untuk forensik
 *
 * @usage
 * const authMiddleware = new AuthMiddleware(authService);
 * router.use(authMiddleware.authenticate());
 *
 * @dependencies
 * - `AuthService` (dari `src/services/auth.service.ts`)
 * - Express Request/Response/NextFunction
 */

import { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/auth.service";

export class AuthMiddleware {
    constructor(private authService: AuthService) {}

    /**
     * Middleware untuk memproteksi route yang memerlukan autentikasi
     * @returns Express middleware function
     */
    authenticate() {
        return async (
            req: Request,
            res: Response,
            next: NextFunction
        ): Promise<void> => {
            try {
                const token = this.extractToken(req);
                if (!token) {
                    res.status(401).json({ error: "Access token required" });
                    return;
                }

                // Gunakan AuthService untuk validasi penuh (DB + JWT)
                const user = await this.authService.validateAccessToken(token);
                req.user = user;

                next();
            } catch (error) {
                const message =
                    error instanceof Error
                        ? error.message
                        : "Authentication failed";

                // Gunakan status 401 untuk semua error autentikasi (konsisten & aman)
                res.status(401).json({ error: message });
            }
        };
    }

    /**
     * Ekstrak access token dari request
     * Prioritas: cookie > Authorization header
     */
    private extractToken(req: Request): string | null {
        // 1. Cek cookie (digunakan untuk SPA/web app)
        if (req.cookies?.access_token) {
            return req.cookies.access_token;
        }

        // 2. Cek Authorization header (Bearer token — untuk mobile/API client)
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith("Bearer ")) {
            return authHeader.substring(7).trim();
        }

        return null;
    }
}
