/**
 * @file AnalyticsController – Antarmuka HTTP untuk manajemen analitik website
 * @description
 * Controller class-based untuk mengelola analitik pengunjung:
 * - Pelacakan real-time kunjungan halaman
 * - Agregasi metrik harian
 * - Ekspor data ke Excel dan PDF
 *
 * @security
 * - Endpoint publik: /track, /end-session (tanpa autentikasi)
 * - Endpoint admin: memerlukan autentikasi dan permission
 * - Validasi input ketat untuk data analitik
 *
 * @usage
 * const analyticsController = new AnalyticsController(analyticsService, utmService, timezoneService, exportService);
 * router.post('/analytics/track', analyticsController.trackPageView);
 *
 * @dependencies
 * - `AnalyticsService`, `UtmService`, `TimezoneService`, `ExportService`
 * - Express Request/Response
 */

import { Request, Response } from "express";
import dayjs from "dayjs";
import { AnalyticsService } from "../services/analytics.service";
import { TimezoneService } from "../services/timezone.service";
import { ExportService } from "../services/reporting/export.service";
import { getClientIp, handleError } from "../utils/http-helper";

export class AnalyticsController {
    constructor(
        private analyticsService: AnalyticsService,
        private timezoneService: TimezoneService,
        private exportService: ExportService
    ) {}

    /**
     * Endpoint: GET /analytics
     * Ambil daftar analitik dengan pagination dan filter tanggal
     */
    getAnalytics = async (req: Request, res: Response): Promise<void> => {
        try {
            const { startDate, endDate, page = "1", limit = "30" } = req.query;

            const result = await this.analyticsService.list({
                startDate: startDate ? String(startDate) : undefined,
                endDate: endDate ? String(endDate) : undefined,
                page: parseInt(page as string, 10),
                limit: parseInt(limit as string, 10),
            });

            res.status(200).json(result);
        } catch (error) {
            handleError(res, error, "Failed to fetch analytics");
        }
    };

    /**
     * Endpoint: GET /analytics/date/:date
     * Ambil analitik untuk tanggal tertentu
     */
    getAnalyticsByDate = async (req: Request, res: Response): Promise<void> => {
        try {
            const { date } = req.params;
            const analytics = await this.analyticsService.findByDate(date);

            if (!analytics) {
                res.status(404).json({
                    error: "Analytics data not found for this date",
                });
                return;
            }

            res.status(200).json(analytics);
        } catch (error) {
            handleError(res, error, "Failed to fetch analytics");
        }
    };

    /**
     * Endpoint: GET /analytics/page-views (opsional)
     * Ambil daftar page view dengan pagination dan filter tanggal
     */
    getPageViews = async (req: Request, res: Response): Promise<void> => {
        try {
            const { startDate, endDate, page = "1", limit = "50" } = req.query;

            const result = await this.analyticsService.getPageViews({
                startDate: startDate ? String(startDate) : undefined,
                endDate: endDate ? String(endDate) : undefined,
                page: parseInt(page as string, 10),
                limit: parseInt(limit as string, 10),
            });

            res.status(200).json(result);
        } catch (error) {
            handleError(res, error, "Failed to fetch page views");
        }
    };

    /**
     * Endpoint: POST /analytics/track
     * Catat kunjungan halaman secara real-time
     */
    trackPageView = async (req: Request, res: Response): Promise<void> => {
        try {
            const { page, title, sessionId, referrer } = req.body;

            if (!page || !sessionId) {
                res.status(400).json({
                    error: "Page and sessionId are required",
                });
                return;
            }

            const ipAddress = getClientIp(req);
            const userAgent = req.get("User-Agent") || "unknown";
            const country = await this.getCountry(ipAddress);

            await this.analyticsService.trackPageView({
                page,
                title,
                sessionId,
                ipAddress,
                country,
                userAgent,
                referrer,
            });

            res.status(204).end();
        } catch (error) {
            console.error("Analytics track error:", error);
            res.status(204).end();
        }
    };

    /**
     * Endpoint: POST /analytics/end-session
     * Akhiri session dan hitung metrik harian
     */
    endSession = async (req: Request, res: Response): Promise<void> => {
        try {
            const { sessionId, duration } = req.body;

            if (!sessionId || duration == null) {
                res.status(400).end();
                return;
            }

            // Ambil page view terakhir
            const lastPageView =
                await this.analyticsService.findLastPageViewBySession(
                    sessionId
                );

            if (lastPageView) {
                await this.analyticsService.updatePageViewDuration(
                    lastPageView.id,
                    duration
                );
            }

            // Hitung metrik harian
            const today = new Date();
            today.setUTCHours(0, 0, 0, 0);
            await this.analyticsService.calculateDailyMetrics(today);

            res.status(204).end();
        } catch (error) {
            console.error("End session error:", error);
            res.status(500).end();
        }
    };

    /**
     * Endpoint: POST /analytics/calculate
     * Hitung ulang metrik harian untuk tanggal tertentu
     */
    calculateDailyMetrics = async (
        req: Request,
        res: Response
    ): Promise<void> => {
        try {
            const dateStr = req.query.date as string;
            const date = dateStr
                ? new Date(dateStr)
                : new Date(Date.now() - 24 * 60 * 60 * 1000); // kemarin

            await this.analyticsService.calculateDailyMetrics(date);

            res.status(200).json({
                message: "Daily metrics calculated successfully",
                date: date.toISOString().split("T")[0],
            });
        } catch (error) {
            console.error("Calculate metrics error:", error);
            res.status(500).json({ error: "Failed to calculate metrics" });
        }
    };

    /**
     * Endpoint: GET /analytics/export/excel
     * Ekspor data analitik ke Excel berdasarkan bulan/tahun
     */
    exportExcel = async (req: Request, res: Response): Promise<void> => {
        try {
            const { month, year } = req.query;

            if (!month || !year) {
                res.status(400).json({
                    error: "month and year are required. Example: ?month=02&year=2025",
                });
                return;
            }

            const startDate = dayjs(`${year}-${month}-01`)
                .startOf("month")
                .toDate();
            const endDate = dayjs(startDate).endOf("month").toDate();

            const result = await this.analyticsService.list({
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
            });

            if (result.data.length === 0) {
                res.status(404).json({
                    error: "No analytics found for this month",
                });
                return;
            }

            const exportRows = result.data.map((item) => ({
                Date: this.timezoneService.toLocalString(
                    item.date,
                    "Asia/Jakarta",
                    "yyyy-MM-dd"
                ),
                Visitor: item.visitor,
                Returning: item.uniqueVisitor,
                "Page Views": item.pageViews,
                Sessions: item.sessions,
                "Bounce Rate": item.bounceRate ? `${item.bounceRate}%` : "-",
                "Avg Session Time": `${item.avgSessionTime}s`,
            }));

            const sheets = [
                {
                    name: "Analytics Report",
                    headers:
                        exportRows.length > 0 ? Object.keys(exportRows[0]) : [],
                    rows: exportRows,
                },
            ];

            const filename = `analytics-${year}-${month}`;
            await this.exportService.toExcel(sheets, filename, res);
        } catch (error) {
            handleError(res, error, "Export to Excel failed");
        }
    };

    /**
     * Endpoint: GET /analytics/export/pdf
     * Ekspor data analitik ke PDF berdasarkan bulan/tahun
     */
    exportPdf = async (req: Request, res: Response): Promise<void> => {
        try {
            const { month, year } = req.query;

            if (!month || !year) {
                res.status(400).json({
                    error: "month and year are required. Example: ?month=02&year=2025",
                });
                return;
            }

            const startDate = dayjs(`${year}-${month}-01`)
                .startOf("month")
                .toDate();
            const endDate = dayjs(startDate).endOf("month").toDate();

            const result = await this.analyticsService.list({
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
            });

            if (result.data.length === 0) {
                res.status(404).json({
                    error: "No analytics found for this month",
                });
                return;
            }

            const exportData = result.data.map((item) => ({
                Date: this.timezoneService.toLocalString(
                    item.date,
                    "Asia/Jakarta",
                    "yyyy-MM-dd"
                ),
                Visitor: item.visitor,
                Returning: item.uniqueVisitor,
                "Page Views": item.pageViews,
                Sessions: item.sessions,
                "Bounce Rate": item.bounceRate ? `${item.bounceRate}%` : "-",
                "Avg Session Time": `${item.avgSessionTime}s`,
            }));

            const filename = `analytics-${year}-${month}`;
            const title = `Analytics Report - ${month}/${year}`;

            this.exportService.toPdf(exportData, filename, title, res);
        } catch (error) {
            handleError(res, error, "Export to PDF failed");
        }
    };

    // Helper methods
    private async getCountry(ipAddress: string): Promise<string> {
        try {
            // Gunakan service eksternal atau fallback
            const response = await fetch(
                `https://get.geojs.io/v1/ip/country/${ipAddress}.json`
            );
            const data = await response.json();

            if (data?.country) {
                return data.country;
            }
        } catch {
            // Fallback ke deteksi berdasarkan IP range
            return this.detectCountryFromIp(ipAddress);
        }
        return "XX";
    }

    private detectCountryFromIp(ipAddress: string): string {
        // Implementasi sederhana berdasarkan prefix IP
        if (ipAddress.startsWith("10.") || ipAddress.startsWith("192.168.")) {
            return "ID"; // Local network → Indonesia
        }
        return "XX";
    }
}
