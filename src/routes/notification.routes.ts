/**
 * @file Notification Routes – Definisi endpoint API untuk manajemen notifikasi
 * @description
 * Routing Express untuk operasi notifikasi pengguna:
 * - GET /notifications: daftar notifikasi
 * - GET /notifications/unread-count: jumlah notifikasi belum dibaca
 * - PATCH /notifications/:id/read: tandai sebagai sudah dibaca
 *
 * @security
 * - Semua endpoint dilindungi oleh middleware authenticate
 * - Hanya bisa mengakses notifikasi milik sendiri (userId dari req.user)
 *
 * @usage
 * const notificationRouter = makeNotificationRouter(notificationService, authMiddleware);
 * app.use('/api/notifications', notificationRouter);
 */

import { Router } from "express";
import { NotificationService } from "../services/notification.service";
import { NotificationController } from "../controllers/notification.controller";
import { AuthMiddleware } from "../middleware/auth.middleware";

export function makeNotificationRouter(
    notificationService: NotificationService,
    authMiddleware: AuthMiddleware
): Router {
    const router = Router();
    const controller = new NotificationController(notificationService);

    // Terapkan middleware proteksi untuk semua route
    router.use(authMiddleware.authenticate());

    router.get("/", controller.getNotifications);
    router.get("/unread-count", controller.getUnreadCount);
    router.patch("/:id/read", controller.markAsRead);

    return router;
}
