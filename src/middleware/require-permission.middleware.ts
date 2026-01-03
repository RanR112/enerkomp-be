/**
 * @file RequirePermissionMiddleware – Proteksi route berbasis permission RBAC
 * @description
 * Middleware class-based untuk mengamankan endpoint berdasarkan permission user:
 * - Izinkan akses jika user memiliki permission eksplisit (action + resource)
 * - Izinkan akses jika user memiliki permission "manage" untuk resource tersebut
 * - Mendukung caching permission di memori untuk optimasi performa
 *
 * @security
 * - Tidak ada query DB berulang untuk permission yang sama dalam satu request
 * - Hanya izinkan permission yang eksplisit atau "manage"
 * - Error message generik → hindari kebocoran informasi sistem
 *
 * @usage
 * const permissionMiddleware = new RequirePermissionMiddleware(roleService);
 * router.get('/api/users',
 *   permissionMiddleware.require('user', 'read'),
 *   userController.getUsers
 * );
 *
 * @dependencies
 * - `RoleService` (dari `src/services/role.service.ts`)
 * - Express Request/Response/NextFunction
 */

import { Request, Response, NextFunction } from "express";
import { RoleService } from "../services/role.service";

export class RequirePermissionMiddleware {
    constructor(private roleService: RoleService) {}

    /**
     * Middleware factory untuk memeriksa permission tertentu
     * @param resource - Nama resource (misal: 'user', 'product', 'brand')
     * @param action - Aksi yang diminta (misal: 'read', 'create', 'delete')
     * @returns Express middleware function
     */
    require(resource: string, action: string) {
        return async (
            req: Request,
            res: Response,
            next: NextFunction
        ): Promise<void> => {
            try {
                if (!req.user) {
                    res.status(401).json({ error: "Authentication required" });
                    return;
                }

                // Inisialisasi cache permission untuk request ini
                if (!req._permissionCache) {
                    req._permissionCache = new Map<string, boolean>();
                }

                const cacheKey = `${resource}:${action}:${req.user.roleId}`;

                // Cek cache dulu
                if (req._permissionCache.has(cacheKey)) {
                    if (req._permissionCache.get(cacheKey)) {
                        return next();
                    }
                    res.status(403).json({ error: "Insufficient permissions" });
                    return;
                }

                // Cek permission "manage" (mencakup semua aksi)
                const hasManagePermission =
                    await this.roleService.hasPermission(
                        req.user.roleId,
                        resource,
                        "manage"
                    );

                if (hasManagePermission) {
                    req._permissionCache.set(cacheKey, true);
                    return next();
                }

                // Cek permission eksplisit
                const hasSpecificPermission =
                    await this.roleService.hasPermission(
                        req.user.roleId,
                        resource,
                        action
                    );

                req._permissionCache.set(cacheKey, hasSpecificPermission);

                if (hasSpecificPermission) {
                    return next();
                }

                res.status(403).json({ error: "Insufficient permissions" });
            } catch (error) {
                const message =
                    error instanceof Error
                        ? error.message
                        : "Permission check failed";
                res.status(500).json({ error: message });
            }
        };
    }
}
