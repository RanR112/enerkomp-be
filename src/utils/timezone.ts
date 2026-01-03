/**
 * @file Timezone Adapter – Kompatibilitas dengan fungsi lama
 * @description
 * Menyediakan fungsi `toLocalTime`, `toLocalISOString`, `toLocalString`
 * seperti versi lama, namun di-backup oleh `TimezoneService`.
 *
 * @usage
 * import { toLocalTime } from '@/utils/timezone';
 * const localDate = toLocalTime(new Date());
 */

import { TimezoneService } from "../services/timezone.service";

const timezoneService = new TimezoneService({
    defaultTimezone: "Asia/Jakarta",
});

export const toLocalTime = (
    date: Date | string | null,
    tz: string = "Asia/Jakarta"
): Date | null => {
    return timezoneService.toLocalDate(date, tz);
};

export const toLocalISOString = (
    date: Date | string | null,
    tz: string = "Asia/Jakarta"
): string | null => {
    return timezoneService.toLocalISOString(date, tz);
};

export const toLocalString = (
    date: Date | string | null,
    tz: string = "Asia/Jakarta",
    format: string = "dd MMM yyyy HH:mm"
): string => {
    return timezoneService.toLocalString(date, tz, format);
};
