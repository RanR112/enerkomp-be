/**
 * @file Role Routes – Definisi endpoint API untuk manajemen role
 * @description
 * Routing Express untuk operasi role dengan proteksi role-based:
 * - Semua endpoint memerlukan autentikasi
 * - Hanya super admin yang bisa mengakses
 *
 * @security
 * - Middleware `authenticate` memastikan req.user tersedia
 * - Middleware `requireSuperAdmin` membatasi akses ke super admin saja
 * - Tidak ada endpoint publik untuk role management
 *
 * @usage
 * const roleRouter = makeRoleRouter(roleService);
 * app.use('/api/roles', roleRouter);
 *
 * @dependencies
 * - `RoleService`
 * - `authenticate` middleware
 * - `requireSuperAdmin` middleware
 */

import { Router } from "express";
import { RoleService } from "../services/role.service";
import { RoleController } from "../controllers/role.controller";
import { AuthMiddleware } from "../middleware/auth.middleware";
import { RequireRoleMiddleware } from "../middleware/require-role.middleware";

/**
 * Factory function untuk membuat router role
 * @param roleService - Instance RoleService yang sudah di-DI
 * @returns Express Router dengan semua endpoint role
 */
export function makeRoleRouter(
    roleService: RoleService,
    authMiddleware: AuthMiddleware
): Router {
    const router = Router();
    const controller = new RoleController(roleService);
    const roleMiddleware = new RequireRoleMiddleware();

    // Terapkan middleware proteksi untuk semua route
    router.use(authMiddleware.authenticate());
    router.use(roleMiddleware.require('Super Admin'));

    // Definisi endpoint
    router.get("/", controller.getRoles);
    router.get("/:id", controller.getRole);
    router.post("/", controller.createRole);
    router.put("/:id", controller.updateRole);
    router.delete("/:id", controller.deleteRole);
    router.delete("/:id/hard", controller.hardDeleteRole);

    return router;
}
