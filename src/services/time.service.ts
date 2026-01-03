/**
 * @file TimeService – Parsing dan konversi durasi waktu dari string
 * @description
 * Layanan untuk mengonversi string waktu (misal: "5m", "2h") ke milidetik.
 * Berguna untuk konfigurasi timeout, cache TTL, throttling, dll.
 *
 * Format yang didukung:
 * - `1000` → 1000 ms
 * - `5s` → 5000 ms
 * - `2m` → 120000 ms
 * - `1h` → 3600000 ms
 * - `7d` → 604800000 ms
 *
 * @security
 * - Batas maksimum 30 hari (2_592_000_000 ms) → cegah DOS via durasi besar
 * - Input divalidasi ketat → hindari infinite loop
 * - Fallback aman jika parsing gagal
 *
 * @usage
 * const timeService = new TimeService();
 *
 * timeService.parse("5m");     // → 300000
 * timeService.parse("2h", 0);  // → 7200000
 *
 * @dependencies
 * - Tidak ada external dependency (pure JavaScript)
 */

export class TimeService {
    private readonly MAX_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari

    /**
     * Parsing string waktu ke milidetik
     * @param value - String waktu (misal: "5m", "2h", "1000")
     * @param fallback - Nilai default jika parsing gagal
     * @returns Durasi dalam milidetik (min: 0, max: 30 hari)
     */
    parse(value: string | undefined, fallback: number = 0): number {
        if (!value) return this.clamp(fallback);

        const cleaned = String(value)
            .trim()
            .replace(/^['"]|['"]$/g, "")
            .replace(/;$/, "")
            .trim()
            .toLowerCase();

        const match = cleaned.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)?$/);

        if (!match) return this.clamp(fallback);

        const num = parseFloat(match[1]);
        if (isNaN(num) || num < 0) return this.clamp(fallback);

        const unit = match[2] || "ms";
        let ms: number;

        switch (unit) {
            case "ms":
                ms = num;
                break;
            case "s":
                ms = num * 1000;
                break;
            case "m":
                ms = num * 60 * 1000;
                break;
            case "h":
                ms = num * 60 * 60 * 1000;
                break;
            case "d":
                ms = num * 24 * 60 * 60 * 1000;
                break;
            default:
                ms = fallback;
        }

        return this.clamp(ms);
    }

    private clamp(value: number): number {
        return Math.max(0, Math.min(Math.floor(value), this.MAX_DURATION_MS));
    }
}
