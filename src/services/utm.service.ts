/**
 * @file UtmService – Parsing dan ekstraksi parameter UTM dari URL
 * @description
 * Layanan untuk mengekstrak parameter UTM (`utm_source`, `utm_medium`, dll)
 * dari URL string. Digunakan untuk pelacakan campaign marketing.
 *
 * @security
 * - Input divalidasi via `new URL()` → otomatis tolak URL tidak valid
 * - Hanya ekstrak parameter yang benar-benar dimulai dengan `utm_`
 * - Tidak ada side effect atau external call
 *
 * @usage
 * const utmService = new UtmService();
 * const utm = utmService.parse('https://example.com?utm_source=ig&utm_campaign=sale');
 * // → { utm_source: 'ig', utm_campaign: 'sale' }
 *
 * @dependencies
 * - Tidak ada external dependency (pure JavaScript)
 */

export class UtmService {
    /**
     * Parse URL dan ekstrak parameter UTM
     * @param url - URL string (boleh relatif atau absolute)
     * @returns Record<string, string> berisi hanya parameter `utm_*`
     * @note Jika URL tidak valid, kembalikan objek kosong
     */
    parse(url: string): Record<string, string> {
        if (!url || typeof url !== "string") {
            return {};
        }

        try {
            const params = new URL(url, "http://localhost").searchParams;
            const utm: Record<string, string> = {};

            for (const [key, value] of params) {
                if (key.startsWith("utm_")) {
                    utm[key] = value;
                }
            }
            return utm;
        } catch {
            return {};
        }
    }
}
