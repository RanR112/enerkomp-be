/**
 * @file NotificationController – Antarmuka HTTP untuk manajemen notifikasi pengguna
 * @description
 * Controller class-based untuk mengelola notifikasi sistem:
 * - Ambil daftar notifikasi
 * - Tandai notifikasi sebagai sudah dibaca
 * - Ambil jumlah notifikasi belum dibaca
 *
 * @security
 * - Semua endpoint memerlukan autentikasi
 * - Hanya bisa mengakses notifikasi milik sendiri
 * - Validasi input dasar di level controller
 *
 * @usage
 * const notificationController = new NotificationController(notificationService);
 * router.get('/notifications', notificationController.getNotifications);
 *
 * @dependencies
 * - `NotificationService`
 * - Express Request/Response
 */

import { Request, Response } from "express";
import { NotificationService } from "../services/notification.service";

export class NotificationController {
    constructor(private notificationService: NotificationService) {}

    /**
     * Endpoint: GET /notifications
     * Ambil daftar notifikasi pengguna dengan pagination
     */
    getNotifications = async (req: Request, res: Response): Promise<void> => {
        try {
            const { page = "1", limit = "20" } = req.query;

            const result = await this.notificationService.getNotifications(
                req.user!.id,
                parseInt(page as string, 10),
                parseInt(limit as string, 10)
            );

            res.status(200).json(result);
        } catch (error) {
            this.handleError(res, error, "Failed to fetch notifications");
        }
    };

    /**
     * Endpoint: PATCH /notifications/:id/read
     * Tandai notifikasi sebagai sudah dibaca
     */
    markAsRead = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;

            await this.notificationService.markAsRead(id, req.user!.id);

            res.status(200).json({ message: "Notification marked as read" });
        } catch (error) {
            this.handleError(res, error, "Failed to mark as read", 400);
        }
    };

    /**
     * Endpoint: GET /notifications/unread-count
     * Ambil jumlah notifikasi belum dibaca
     */
    getUnreadCount = async (req: Request, res: Response): Promise<void> => {
        try {
            const count = await this.notificationService.getUnreadCount(
                req.user!.id
            );

            res.status(200).json({ count });
        } catch (error) {
            this.handleError(res, error, "Failed to fetch unread count");
        }
    };

    // Helper methods
    private handleError(
        res: Response,
        error: unknown,
        defaultMessage: string,
        statusCode: number = 500
    ): void {
        const message = error instanceof Error ? error.message : defaultMessage;
        res.status(statusCode).json({ error: message });
    }
}
