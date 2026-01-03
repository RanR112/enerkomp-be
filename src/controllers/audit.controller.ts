/**
 * @file AuditLogController – Antarmuka HTTP untuk manajemen log audit sistem
 * @description
 * Controller class-based untuk mengakses log audit Enerkomp:
 * - Filtering berdasarkan action, tableName, tanggal
 * - Pagination dan pencarian
 *
 * @security
 * - Semua endpoint memerlukan autentikasi dan permission 'audit_log.read'
 * - Tidak ada endpoint yang mengubah data audit log (read-only)
 *
 * @usage
 * const auditLogController = new AuditLogController(auditService);
 * router.get('/audit-logs', auditLogController.getAuditLogs);
 *
 * @dependencies
 * - `AuditService`
 * - Express Request/Response
 */

import { Request, Response } from "express";
import { AuditService } from "../services/audit.service";

export class AuditLogController {
    constructor(private auditService: AuditService) {}

    /**
     * Endpoint: GET /audit-logs
     * Ambil daftar log audit dengan pagination dan filter
     */
    getAuditLogs = async (req: Request, res: Response): Promise<void> => {
        try {
            const {
                page = "1",
                limit = "20",
                search,
                action,
                tableName,
                startDate,
                endDate,
            } = req.query;

            const result = await this.auditService.getLogs({
                page: parseInt(page as string, 10),
                limit: parseInt(limit as string, 10),
                search: search ? String(search) : undefined,
                action: action ? String(action) : undefined,
                tableName: tableName ? String(tableName) : undefined,
                startDate: startDate ? String(startDate) : undefined,
                endDate: endDate ? String(endDate) : undefined,
            });

            res.status(200).json(result);
        } catch (error) {
            this.handleError(res, error, "Failed to fetch audit logs", 400);
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
