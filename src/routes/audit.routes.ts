/**
 * @file Audit Log Routes – Definisi endpoint API untuk manajemen log audit
 * @description
 * Routing Express untuk akses log audit sistem dengan proteksi role-based:
 * - Hanya bisa diakses oleh pengguna dengan permission 'audit_log.read'
 *
 * @security
 * - Semua endpoint dilindungi oleh middleware authenticate
 * - Hanya permission 'audit_log.read' yang diizinkan
 * - Tidak ada operasi write (read-only)
 *
 * @usage
 * const auditLogRouter = makeAuditLogRouter(auditService, authMiddleware, permissionMiddleware);
 * app.use('/api/audit-logs', auditLogRouter);
 */

import { Router } from "express";
import { AuditService } from "../services/audit.service";
import { AuditLogController } from "../controllers/audit.controller";
import { AuthMiddleware } from "../middleware/auth.middleware";
import { RequirePermissionMiddleware } from "../middleware/require-permission.middleware";

export function makeAuditLogRouter(
    auditService: AuditService,
    authMiddleware: AuthMiddleware,
    permissionMiddleware: RequirePermissionMiddleware
): Router {
    const router = Router();
    const controller = new AuditLogController(auditService);

    // Terapkan middleware proteksi untuk semua route
    router.use(authMiddleware.authenticate());
    router.use(permissionMiddleware.require("audit_log", "read"));

    router.get("/", controller.getAuditLogs);

    return router;
}
