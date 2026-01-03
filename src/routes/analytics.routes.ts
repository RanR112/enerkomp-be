/**
 * @file Analytics Routes – Definisi endpoint API untuk manajemen analitik website
 * @description
 * Routing Express untuk operasi analitik dengan proteksi role-based:
 * - POST /track, /end-session: publik (tanpa autentikasi)
 * - GET /, /date/:date, /page-views: memerlukan permission 'analytics.read'
 * - POST /calculate: memerlukan permission 'analytics.manage'
 * - Export: memerlukan permission 'user.read'
 *
 * @security
 * - Endpoint pelacakan bisa diakses oleh frontend tanpa autentikasi
 * - Endpoint administrasi dilindungi oleh middleware authenticate
 * - Permission checking sesuai RBAC Enerkomp
 *
 * @usage
 * const analyticsRouter = makeAnalyticsRouter(analyticsService, utmService, timezoneService, exportService, authMiddleware, permissionMiddleware);
 * app.use('/api/analytics', analyticsRouter);
 */

import { Router } from "express";
import { AnalyticsService } from "../services/analytics.service";
import { UtmService } from "../services/utm.service";
import { TimezoneService } from "../services/timezone.service";
import { ExportService } from "../services/reporting/export.service";
import { AnalyticsController } from "../controllers/analytics.controller";
import { AuthMiddleware } from "../middleware/auth.middleware";
import { RequirePermissionMiddleware } from "../middleware/require-permission.middleware";

export function makeAnalyticsRouter(
    analyticsService: AnalyticsService,
    utmService: UtmService,
    timezoneService: TimezoneService,
    exportService: ExportService,
    authMiddleware: AuthMiddleware,
    permissionMiddleware: RequirePermissionMiddleware
): Router {
    const router = Router();
    const controller = new AnalyticsController(
        analyticsService,
        utmService,
        timezoneService,
        exportService
    );

    // Public endpoints (tanpa autentikasi)
    router.post("/track", controller.trackPageView);
    router.post("/end-session", controller.endSession);

    // Protected endpoints
    router.use(authMiddleware.authenticate());

    router.get(
        "/",
        permissionMiddleware.require("analytics", "read"),
        controller.getAnalytics
    );
    router.get(
        "/date/:date",
        permissionMiddleware.require("analytics", "read"),
        controller.getAnalyticsByDate
    );
    router.get(
        "/page-views",
        permissionMiddleware.require("analytics", "read"),
        controller.getPageViews
    );
    router.post(
        "/calculate",
        permissionMiddleware.require("analytics", "manage"),
        controller.calculateDailyMetrics
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
