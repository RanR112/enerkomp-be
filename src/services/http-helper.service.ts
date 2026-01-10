/**
 * @file HttpHelperService – Utilitas HTTP umum untuk controller Express
 * @description
 * Service stateless yang menyediakan helper HTTP umum seperti:
 * - Ekstraksi IP client
 * - Penanganan error HTTP terstandarisasi
 *
 * Dirancang untuk:
 * - Digunakan lintas controller
 * - Mengurangi duplikasi logic
 * - Menjaga controller tetap fokus pada flow HTTP
 *
 * @security
 * - Tidak menyimpan state
 * - Tidak mengakses database atau external service
 * - Aman digunakan sebagai singleton
 *
 * @usage
 * const httpHelper = new HttpHelperService();
 * const ip = httpHelper.getClientIp(req);
 * httpHelper.handleError(res, error, 'Something went wrong');
 *
 * @dependencies
 * - Express Request & Response
 */

import { Request, Response } from "express";

export class HttpHelperService {
    /**
     * Mengambil IP address client dari request
     * @param req - Express Request
     * @returns IP address client atau string kosong
     */
    getClientIp(req: Request): string {
        return (
            req.ip ||
            (req.connection as any)?.remoteAddress ||
            (req.headers["x-forwarded-for"] as string) ||
            ""
        );
    }

    /**
     * Menangani error HTTP secara terstandarisasi
     * @param res - Express Response
     * @param error - Error yang tertangkap
     * @param defaultMessage - Pesan fallback jika error bukan instance Error
     * @param statusCode - HTTP status code (default 500)
     */
    handleError(
        res: Response,
        error: unknown,
        defaultMessage: string,
        statusCode: number = 500
    ): void {
        const message = error instanceof Error ? error.message : defaultMessage;

        res.status(statusCode).json({ error: message });
    }
}
