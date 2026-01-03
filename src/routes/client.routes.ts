/**
 * @file Client Routes – Definisi endpoint API untuk manajemen klien
 * @description
 * Routing Express untuk operasi klien dengan proteksi role-based:
 * - POST /clients: publik (form website)
 * - GET/PUT/DELETE /clients: memerlukan autentikasi dan permission
 * - Ekspor data: memerlukan permission 'user.read'
 *
 * @security
 * - Endpoint publik hanya menerima POST (form submission)
 * - Semua endpoint admin dilindungi oleh middleware authenticate
 * - Permission checking sesuai RBAC Enerkomp
 *
 * @usage
 * const clientRouter = makeClientRouter(clientService, notificationService, exportService, timezoneService, authMiddleware, permissionMiddleware);
 * app.use('/api/clients', clientRouter);
 */

import { Router } from "express";
import { ClientService } from "../services/client.service";
import { NotificationService } from "../services/notification.service";
import { ExportService } from "../services/reporting/export.service";
import { TimezoneService } from "../services/timezone.service";
import { ClientController } from "../controllers/client.controller";
import { AuthMiddleware } from "../middleware/auth.middleware";
import { RequirePermissionMiddleware } from "../middleware/require-permission.middleware";

export function makeClientRouter(
    clientService: ClientService,
    notificationService: NotificationService,
    exportService: ExportService,
    timezoneService: TimezoneService,
    authMiddleware: AuthMiddleware,
    permissionMiddleware: RequirePermissionMiddleware
): Router {
    const router = Router();
    const controller = new ClientController(
        clientService,
        notificationService,
        exportService,
        timezoneService
    );

    // Public endpoint (form website)
    router.post("/", controller.createClient);

    // Protected endpoints (admin)
    router.use(authMiddleware.authenticate());

    router.get(
        "/",
        permissionMiddleware.require("client", "read"),
        controller.getClients
    );
    router.get(
        "/:id",
        permissionMiddleware.require("client", "read"),
        controller.getClient
    );
    router.post(
        "/:id/reply",
        permissionMiddleware.require("client", "update"),
        controller.replyToClient
    );
    router.put(
        "/:id",
        permissionMiddleware.require("client", "update"),
        controller.updateClient
    );
    router.delete(
        "/:id",
        permissionMiddleware.require("client", "delete"),
        controller.deleteClient
    );

    // Export endpoints
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
