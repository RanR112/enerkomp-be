/**
 * @file User Routes – Definisi endpoint API untuk manajemen pengguna
 * @description
 * Routing Express untuk operasi pengguna dengan proteksi role-based:
 * - List & detail: memerlukan permission 'user.read'
 * - Create: memerlukan permission 'user.create'
 * - Update: memerlukan permission 'user.update'
 * - Delete: memerlukan permission 'user.delete'
 * - Hard delete: memerlukan permission 'user.manage'
 * - Export: memerlukan permission 'user.read'
 *
 * @security
 * - Semua endpoint dilindungi oleh middleware authenticate
 * - Permission checking dilakukan sebelum controller dijalankan
 * - Upload avatar menggunakan middleware uploadUserAvatar
 *
 * @usage
 * const userRouter = makeUserRouter(userService, exportService, authMiddleware, permissionMiddleware);
 * app.use('/api/users', userRouter);
 */

import { Router } from "express";
import { UserService } from "../services/user.service";
import { ExportService } from "../services/reporting/export.service";
import { UserController } from "../controllers/user.controller";
import { AuthMiddleware } from "../middleware/auth.middleware";
import { RequirePermissionMiddleware } from "../middleware/require-permission.middleware";
import { uploadUserAvatar } from "../utils/upload";

export function makeUserRouter(
    userService: UserService,
    exportService: ExportService,
    authMiddleware: AuthMiddleware,
    permissionMiddleware: RequirePermissionMiddleware
): Router {
    const router = Router();
    const controller = new UserController(userService, exportService);

    // Terapkan middleware proteksi untuk semua route
    router.use(authMiddleware.authenticate());

    // List & detail
    router.get(
        "/",
        permissionMiddleware.require("user", "read"),
        controller.getUsers
    );
    router.get(
        "/:id",
        permissionMiddleware.require("user", "read"),
        controller.getUser
    );

    // Create
    router.post(
        "/",
        permissionMiddleware.require("user", "create"),
        uploadUserAvatar,
        controller.createUser
    );

    // Update
    router.put(
        "/:id",
        permissionMiddleware.require("user", "update"),
        uploadUserAvatar,
        controller.updateUser
    );

    // Delete
    router.delete(
        "/:id",
        permissionMiddleware.require("user", "delete"),
        controller.deleteUser
    );
    router.delete(
        "/:id/hard",
        permissionMiddleware.require("user", "manage"),
        controller.hardDeleteUser
    );

    // Avatar routes
    router.patch(
        "/:id/avatar",
        permissionMiddleware.require("user", "manage"),
        uploadUserAvatar,
        controller.updateAvatar
    );
    router.delete(
        "/:id/avatar",
        permissionMiddleware.require("user", "manage"),
        controller.deleteAvatar
    );

    // Export
    router.get(
        "/export/excel",
        permissionMiddleware.require("user", "read"),
        controller.exportExcel
    );
    router.get(
        "/export/pdf",
        permissionMiddleware.require("user", "read"),
        controller.exportPdf
    );

    return router;
}
