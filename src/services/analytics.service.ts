/**
 * @file AnalyticsService – Manajemen analitik pengunjung website Enerkomp
 * @description
 * Layanan terpusat untuk:
 * - Pelacakan real-time kunjungan halaman
 * - Agregasi metrik harian (bounce rate, session time, dll)
 * - Analisis UTM parameters dan sumber traffic
 *
 * @security
 * - Sanitasi input untuk mencegah serangan injection
 * - Validasi data analitik sebelum penyimpanan
 * - Tidak menyimpan data pribadi sensitif
 *
 * @usage
 * const analyticsService = new AnalyticsService(prisma, utmService, timezoneService);
 *
 * await analyticsService.trackPageView({
 *   page: '/',
 *   sessionId: 'sess_123',
 *   ipAddress: '192.168.1.1',
 *   userAgent: 'Mozilla/5.0...'
 * });
 *
 * @dependencies
 * - `@prisma/client`
 * - `UtmService`, `TimezoneService`
 */

import { PrismaClient } from "@prisma/client";
import { UtmService } from "./utm.service";
import { TimezoneService } from "./timezone.service";

export interface TrackPageViewInput {
    page: string;
    title: string;
    sessionId: string;
    ipAddress: string;
    country: string;
    userAgent: string;
    referrer?: string;
}

export interface AnalyticsQueryOptions {
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
}

export class AnalyticsService {
    constructor(
        private prisma: PrismaClient,
        private utmService: UtmService,
        private timezoneService: TimezoneService
    ) {}

    /**
     * Ambil daftar analitik dengan pagination dan filter tanggal
     * @param options - Filter dan pagination options
     * @returns Data analitik dan metadata pagination
     */
    async list(options: AnalyticsQueryOptions = {}) {
        const { startDate, endDate, page = 1, limit = 30 } = options;
        const skip = (page - 1) * limit;

        const where: any = {};
        if (startDate && endDate) {
            where.date = {
                gte: new Date(startDate),
                lte: new Date(endDate),
            };
        }

        const [analytics, total] = await Promise.all([
            this.prisma.analytics.findMany({
                where,
                skip,
                take: limit,
                orderBy: { date: "desc" },
            }),
            this.prisma.analytics.count({ where }),
        ]);

        return {
            data: analytics,
            meta: {
                total,
                page,
                lastPage: Math.ceil(total / limit),
                perPage: limit,
            },
        };
    }

    /**
     * Ambil analitik untuk tanggal tertentu
     * @param date - Tanggal dalam format ISO string
     * @returns Data analitik harian
     */
    async findByDate(date: string) {
        return this.prisma.analytics.findUnique({
            where: { date: new Date(date) },
        });
    }

    /**
     * Ambil daftar page view dengan pagination dan filter tanggal
     * @param options - Filter dan pagination options
     * @returns Data page view dan metadata pagination
     */
    async getPageViews(options: AnalyticsQueryOptions = {}) {
        const { startDate, endDate, page = 1, limit = 50 } = options;
        const skip = (page - 1) * limit;

        const where: any = {};
        if (startDate && endDate) {
            where.createdAt = {
                gte: new Date(startDate),
                lte: new Date(endDate),
            };
        }

        const [pageViews, total] = await Promise.all([
            this.prisma.pageView.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
            }),
            this.prisma.pageView.count({ where }),
        ]);

        return {
            data: pageViews,
            meta: {
                total,
                page,
                lastPage: Math.ceil(total / limit),
                perPage: limit,
            },
        };
    }

    /**
     * Catat kunjungan halaman secara real-time
     * @param input - Data kunjungan halaman
     */
    async trackPageView(input: TrackPageViewInput): Promise<void> {
        const {
            page,
            title,
            sessionId,
            ipAddress,
            country,
            userAgent,
            referrer,
        } = input;

        try {
            // Sanitasi input
            const safeReferrer = (referrer || "direct").substring(0, 500);
            const safeSessionId = (sessionId || "unknown").substring(0, 100);
            const safePage = (page || "/").substring(0, 500);
            const safeIpAddress = (ipAddress || "unknown").substring(0, 100);
            const safeUserAgent = (userAgent || "unknown").substring(0, 1000);
            const safeTitle = (title || "").substring(0, 255);

            // Ambil tanggal hari ini
            const today = new Date();
            today.setUTCHours(0, 0, 0, 0);

            // Upsert analytics hari ini
            const analytics = await this.prisma.analytics.upsert({
                where: { date: today },
                create: {
                    date: today,
                    visitor: 0,
                    uniqueVisitor: 0,
                    pageViews: 0,
                    sessions: 0,
                    bounceRate: 0,
                    avgSessionTime: 0,
                },
                update: {},
            });

            // Cek keberadaan session
            const sessionExists = await this.prisma.pageView.findFirst({
                where: {
                    sessionId: safeSessionId,
                    createdAt: { gte: today },
                },
            });

            // Cek visitor
            const hasVisitedBefore = await this.prisma.pageView.findFirst({
                where: { sessionId: safeSessionId },
            });

            // Simpan page view
            await this.prisma.pageView.create({
                data: {
                    sessionId: safeSessionId,
                    page: safePage,
                    title: safeTitle,
                    referrer: safeReferrer,
                    ipAddress: safeIpAddress,
                    userAgent: safeUserAgent,
                    country,
                    device: this.detectDevice(safeUserAgent),
                    browser: this.detectBrowser(safeUserAgent),
                    os: this.detectOS(safeUserAgent),
                    duration: 0,
                },
            });

            // Update analytics
            const updates: any = {
                pageViews: { increment: 1 },
            };

            if (!sessionExists) {
                updates.sessions = { increment: 1 };

                if (!hasVisitedBefore) {
                    updates.visitor = { increment: 1 }; // new visitor
                } else {
                    updates.uniqueVisitor = { increment: 1 }; // returning visitor
                }
            }

            await this.prisma.analytics.update({
                where: { id: analytics.id },
                data: updates,
            });
        } catch (error) {
            console.error("trackPageView error:", error);
        }
    }

    /**
     * Mengambil page view terakhir berdasarkan session ID
     * Digunakan untuk mendapatkan aktivitas terakhir sebelum session berakhir
     *
     * @param sessionId - ID session pengunjung
     * @returns Data page view terakhir atau null jika tidak ditemukan
     */
    async findLastPageViewBySession(sessionId: string) {
        return this.prisma.pageView.findFirst({
            where: { sessionId },
            orderBy: { createdAt: "desc" },
        });
    }

    /**
     * Memperbarui durasi kunjungan pada page view tertentu
     *
     * @param pageViewId - ID page view yang akan diperbarui
     * @param duration - Durasi kunjungan dalam detik
     * @returns Data page view yang telah diperbarui
     */
    async updatePageViewDuration(pageViewId: string, duration: number) {
        return this.prisma.pageView.update({
            where: { id: pageViewId },
            data: { duration },
        });
    }

    /**
     * Hitung metrik harian untuk tanggal tertentu
     * @param date - Tanggal dalam format Date
     * @returns Data analitik harian yang telah di-update
     */
    async calculateDailyMetrics(date: Date) {
        const targetDate = new Date(date);
        targetDate.setUTCHours(0, 0, 0, 0);
        const nextDay = new Date(targetDate);
        nextDay.setDate(nextDay.getDate() + 1);

        // Ambil semua session
        const sessions = await this.prisma.pageView.groupBy({
            by: ["sessionId"],
            where: { createdAt: { gte: targetDate, lt: nextDay } },
            _count: { id: true },
            _sum: { duration: true },
        });

        if (sessions.length === 0) {
            const analytics = await this.prisma.analytics.upsert({
                where: { date: targetDate },
                create: {
                    date: targetDate,
                    visitor: 0,
                    uniqueVisitor: 0,
                    pageViews: 0,
                    sessions: 0,
                    bounceRate: 0,
                    avgSessionTime: 0,
                    pages: {},
                    referrers: {},
                    countries: {},
                    device: {},
                    browser: {},
                    operatingSystem: {},
                },
                update: { bounceRate: 0, avgSessionTime: 0 },
            });
            return analytics;
        }

        // Hitung bounce rate
        const bouncedSessions = sessions.filter(
            (s) => s._count.id === 1
        ).length;
        const bounceRate = parseFloat(
            ((bouncedSessions / sessions.length) * 100).toFixed(2)
        );

        // Hitung avg session time
        const totalDuration = sessions.reduce(
            (sum, s) => sum + (s._sum.duration || 0),
            0
        );
        const avgSessionTime = Math.round(totalDuration / sessions.length);

        // Ambil agregat dasar
        const [
            pageStats,
            referrerStats,
            countryStats,
            deviceStats,
            browserStats,
            osStats,
        ] = await Promise.all([
            this.prisma.pageView.groupBy({
                by: ["page"],
                where: { createdAt: { gte: targetDate, lt: nextDay } },
                _count: { id: true },
            }),
            this.prisma.pageView.groupBy({
                by: ["referrer"],
                where: { createdAt: { gte: targetDate, lt: nextDay } },
                _count: { id: true },
            }),
            this.prisma.pageView.groupBy({
                by: ["country"],
                where: { createdAt: { gte: targetDate, lt: nextDay } },
                _count: { id: true },
            }),
            this.prisma.pageView.groupBy({
                by: ["device"],
                where: { createdAt: { gte: targetDate, lt: nextDay } },
                _count: { id: true },
            }),
            this.prisma.pageView.groupBy({
                by: ["browser"],
                where: { createdAt: { gte: targetDate, lt: nextDay } },
                _count: { id: true },
            }),
            this.prisma.pageView.groupBy({
                by: ["os"],
                where: { createdAt: { gte: targetDate, lt: nextDay } },
                _count: { id: true },
            }),
        ]);

        // Ekstrak & agregasi UTM dari referrer
        const utmSources: Record<string, number> = {};
        const utmMediums: Record<string, number> = {};
        const utmCampaigns: Record<string, number> = {};

        for (const { referrer, _count } of referrerStats) {
            if (!referrer || referrer === "direct") continue;
            const utm = this.utmService.parse(referrer);
            const count = _count.id;

            if (utm.utm_source)
                utmSources[utm.utm_source] =
                    (utmSources[utm.utm_source] || 0) + count;
            if (utm.utm_medium)
                utmMediums[utm.utm_medium] =
                    (utmMediums[utm.utm_medium] || 0) + count;
            if (utm.utm_campaign)
                utmCampaigns[utm.utm_campaign] =
                    (utmCampaigns[utm.utm_campaign] || 0) + count;
        }

        // Konversi ke format JSON
        const pages = Object.fromEntries(
            pageStats.map((s: any) => [s.page, s._count.id])
        );
        const referrers: Record<string, any> = Object.fromEntries(
            referrerStats.map((s: any) => [s.referrer || "direct", s._count.id])
        );
        referrers.utm_source = utmSources;
        referrers.utm_medium = utmMediums;
        referrers.utm_campaign = utmCampaigns;

        const countries = Object.fromEntries(
            countryStats.map((s: any) => [s.country, s._count.id])
        );
        const device = Object.fromEntries(
            deviceStats.map((s: any) => [s.device, s._count.id])
        );
        const browser = Object.fromEntries(
            browserStats.map((s: any) => [s.browser, s._count.id])
        );
        const operatingSystem = Object.fromEntries(
            osStats.map((s: any) => [s.os, s._count.id])
        );

        // Simpan ke analytics
        const analytics = await this.prisma.analytics.upsert({
            where: { date: targetDate },
            create: {
                date: targetDate,
                visitor: 0,
                uniqueVisitor: 0,
                pageViews: 0,
                sessions: sessions.length,
                bounceRate,
                avgSessionTime,
                pages,
                referrers,
                countries,
                device,
                browser,
                operatingSystem,
            },
            update: {
                bounceRate,
                avgSessionTime,
                sessions: sessions.length,
                pages,
                referrers,
                countries,
                device,
                browser,
                operatingSystem,
            },
        });

        return analytics;
    }

    // Helper methods
    private detectDevice(ua: string): string {
        if (/mobile/i.test(ua)) return "mobile";
        if (/tablet/i.test(ua)) return "tablet";
        return "desktop";
    }

    private detectBrowser(ua: string): string {
        if (/edg/i.test(ua)) return "Edge";
        if (/chrome|crios/i.test(ua)) return "Chrome";
        if (/firefox|fxios/i.test(ua)) return "Firefox";
        if (/safari/i.test(ua) && !/chrome/i.test(ua)) return "Safari";
        return "Other";
    }

    private detectOS(ua: string): string {
        if (/windows/i.test(ua)) return "Windows";
        if (/mac os/i.test(ua)) return "Mac";
        if (/linux/i.test(ua)) return "Linux";
        if (/android/i.test(ua)) return "Android";
        if (/iphone|ipad/i.test(ua)) return "iOS";
        return "Other";
    }
}
