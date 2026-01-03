/**
 * @file RequireRoleMiddleware – Proteksi route berbasis role pengguna
 * @description
 * Middleware class-based untuk membatasi akses berdasarkan role pengguna:
 * - Mendukung single role atau multiple roles
 * - Kompatibel dengan struktur role di Enerkomp Persada Raya
 * - Error message konsisten dan aman
 *
 * @security
 * - Hanya izinkan role yang eksplisit disebutkan
 * - Tidak ada kebocoran informasi struktur role melalui error message
 * - Validasi role dilakukan setelah autentikasi (req.user sudah ada)
 *
 * @usage
 * const roleMiddleware = new RequireRoleMiddleware();
 *
 * // Hanya Super Admin
 * router.use(roleMiddleware.require('Super Admin'));
 *
 * // Super Admin atau Admin
 * router.use(roleMiddleware.require(['Super Admin', 'Admin']));
 *
 * @dependencies
 * - Express Request/Response/NextFunction
 */

import { Request, Response, NextFunction } from "express";

export class RequireRoleMiddleware {
    /**
     * Middleware factory untuk memeriksa role pengguna
     * @param roles - Nama role tunggal atau array role yang diizinkan
     * @returns Express middleware function
     */
    require(roles: string | string[]) {
        const allowedRoles = Array.isArray(roles) ? roles : [roles];

        return (req: Request, res: Response, next: NextFunction): void => {
            try {
                if (!req.user) {
                    res.status(401).json({ error: "Authentication required" });
                    return;
                }

                if (!req.user.role?.name) {
                    res.status(403).json({ error: "Insufficient permissions" });
                    return;
                }

                const userRole = req.user.role.name;
                if (allowedRoles.includes(userRole)) {
                    return next();
                }

                res.status(403).json({ error: "Insufficient permissions" });
            } catch (error) {
                const message =
                    error instanceof Error
                        ? error.message
                        : "Role validation failed";
                res.status(500).json({ error: message });
            }
        };
    }
}
