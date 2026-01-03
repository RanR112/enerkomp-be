/**
 * @file TimezoneService – Konversi dan format waktu berbasis zona waktu
 * @description
 * Layanan untuk menangani operasi waktu:
 * - Konversi UTC ke zona waktu lokal (default: Asia/Jakarta)
 * - Format ke ISO string, Date object, atau string human-readable
 *
 * @security
 * - Input divalidasi ketat → hindari invalid date
 * - Tidak ada side effect atau external dependency selain Luxon
 * - Zona waktu bisa dikonfigurasi per instance
 *
 * @usage
 * const timezoneService = new TimezoneService({ defaultTimezone: 'Asia/Jakarta' });
 *
 * timezoneService.toLocalDate(new Date());          // Date lokal
 * timezoneService.toLocalISOString(new Date());     // "2025-12-17T10:30:00.000+07:00"
 * timezoneService.toLocalString(new Date(), "dd MMM yyyy"); // "17 Des 2025"
 *
 * @dependencies
 * - `luxon` v3+ (modern date/time library)
 */

import { DateTime } from "luxon";

export interface TimezoneServiceConfig {
    defaultTimezone: string;
}

export class TimezoneService {
    constructor(
        private config: TimezoneServiceConfig = {
            defaultTimezone: "Asia/Jakarta",
        }
    ) {}

    /**
     * Konversi ke Date object lokal
     * @param date - Input (Date, ISO string, atau null)
     * @param tz - Zona waktu target (default: Asia/Jakarta)
     * @returns Date dalam zona waktu lokal, atau null jika input null
     */
    toLocalDate(
        date: Date | string | null,
        tz: string = this.config.defaultTimezone
    ): Date | null {
        if (!date) return null;

        const dt =
            typeof date === "string"
                ? DateTime.fromISO(date, { zone: "UTC" })
                : DateTime.fromJSDate(date, { zone: "UTC" });

        return dt.setZone(tz).toJSDate();
    }

    /**
     * Konversi ke ISO string lokal
     * @param date - Input (Date, ISO string, atau null)
     * @param tz - Zona waktu target
     * @returns ISO string dengan offset zona waktu, atau null
     */
    toLocalISOString(
        date: Date | string | null,
        tz: string = this.config.defaultTimezone
    ): string | null {
        if (!date) return null;

        const dt =
            typeof date === "string"
                ? DateTime.fromISO(date, { zone: "UTC" })
                : DateTime.fromJSDate(date, { zone: "UTC" });

        return dt.setZone(tz).toISO();
    }

    /**
     * Format ke string human-readable
     * @param date - Input (Date, ISO string, atau null)
     * @param tz - Zona waktu target
     * @param format - Format Luxon (default: 'dd MMM yyyy HH:mm')
     * @returns String terformat, atau "-" jika null
     */
    toLocalString(
        date: Date | string | null,
        tz: string = this.config.defaultTimezone,
        format: string = "dd MMM yyyy HH:mm"
    ): string {
        if (!date) return "-";

        const dt =
            typeof date === "string"
                ? DateTime.fromISO(date, { zone: "UTC" })
                : DateTime.fromJSDate(date, { zone: "UTC" });

        return dt.setZone(tz).toFormat(format);
    }
}
