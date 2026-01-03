/**
 * @file Utm Adapter – Kompatibilitas dengan fungsi lama
 * @description
 * Menyediakan fungsi `parseUtmParams()` seperti versi lama,
 * namun di-backup oleh `UtmService`.
 *
 * @usage
 * import { parseUtmParams } from '@/utils/utm';
 * const utm = parseUtmParams('https://example.com?utm_source=ig');
 */

import { UtmService } from "../services/utm.service";

const utmService = new UtmService();

export const parseUtmParams = (url: string): Record<string, string> => {
    return utmService.parse(url);
};
