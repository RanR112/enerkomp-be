/**
 * @file ParseTime Adapter – Kompatibilitas dengan fungsi lama
 * @description
 * Menyediakan fungsi `parseTime()` seperti versi lama,
 * namun di-backup oleh `TimeService`.
 *
 * @usage
 * import { parseTime } from '@/utils/parseTime';
 * const ms = parseTime(process.env.CACHE_TTL, 5000); // → 5000
 */

import { TimeService } from "../services/time.service";

const timeService = new TimeService();

export const parseTime = (
    value: string | undefined,
    fallback: number
): number => {
    return timeService.parse(value, fallback);
};
