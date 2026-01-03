/**
 * @file SummaryService – Generasi ringkasan statistik dari data
 * @description
 * Layanan untuk menganalisis dataset dan menghasilkan:
 * - Ringkasan enum (jumlah per nilai kategori)
 * - Total nilai numerik
 * - Rata-rata metrik analitik (BounceRate, AvgSessionTime)
 *
 * @security
 * - Input divalidasi → hindari crash pada data corrupt
 * - Tidak ada side effect atau external call
 * - Field enum dikonfigurasi eksplisit → hindari leak data sensitif
 *
 * @usage
 * const summaryService = new SummaryService();
 *
 * const summary = summaryService.generate(rows, 'user');
 * // → { enumSummary, integerSummary, averageSummary }
 *
 * @dependencies
 * - Tidak ada external dependency (pure JavaScript)
 */

export type SummaryResult = {
    enumSummary: Record<string, Record<string, number>>;
    integerSummary: Record<string, number>;
    averageSummary: Record<string, number>;
};

export interface SummaryServiceConfig {
    enumFields: Record<string, string[]>;
}

export class SummaryService {
    private readonly config: SummaryServiceConfig;

    constructor(
        config: SummaryServiceConfig = {
            enumFields: {
                user: ["Status", "Role"],
                client: ["Form", "Replied"],
                product: ["Category", "Brand"],
                brand: ["Type"],
                analytics: [],
            },
        }
    ) {
        this.config = config;
    }

    /**
     * Generate ringkasan statistik dari dataset
     * @param rows - Array data untuk dianalisis
     * @param tableName - Nama tabel (untuk konfigurasi enum field)
     * @returns Objek ringkasan dengan tiga bagian
     */
    generate(rows: Record<string, any>[], tableName?: string): SummaryResult {
        if (rows.length === 0) {
            return {
                enumSummary: {},
                integerSummary: {},
                averageSummary: {},
            };
        }

        const enumSummary: Record<string, Record<string, number>> = {};
        const integerSummary: Record<string, number> = {};
        const averageSummary: Record<string, number[]> = {};

        const enumFieldSet = new Set(
            this.config.enumFields[tableName || ""] || []
        );
        const averageFields = ["BounceRate", "AvgSessionTime"];

        for (const key of Object.keys(rows[0])) {
            const columnValues = rows.map((r) => r[key]);

            // Enum breakdown untuk field yang dikonfigurasi
            if (enumFieldSet.has(key)) {
                enumSummary[key] = {};
                for (const row of rows) {
                    const value = this.getValueByPath(row, key);
                    const strVal =
                        value === null || value === undefined
                            ? "–"
                            : String(value);
                    enumSummary[key][strVal] =
                        (enumSummary[key][strVal] || 0) + 1;
                }
                continue;
            }

            // Rata-rata khusus untuk field analitik
            if (averageFields.includes(key)) {
                const numbers = columnValues
                    .map((v) => {
                        if (typeof v === "string") return parseFloat(v);
                        return typeof v === "number" && !isNaN(v) ? v : null;
                    })
                    .filter((v) => v !== null);

                if (numbers.length > 0) {
                    averageSummary[key] = numbers;
                }
                continue;
            }

            // Total untuk nilai numerik
            if (columnValues.every((v) => typeof v === "number" && !isNaN(v))) {
                integerSummary[key] = columnValues.reduce((a, b) => a + b, 0);
            }
        }

        // Hitung rata-rata akhir
        const finalAvg: Record<string, number> = {};
        for (const [key, values] of Object.entries(averageSummary)) {
            finalAvg[key] = parseFloat(
                (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)
            );
        }

        return {
            enumSummary,
            integerSummary,
            averageSummary: finalAvg,
        };
    }

    private getValueByPath(obj: any, path: string): any {
        return path
            .split(".")
            .reduce(
                (o, key) => (o && o[key] !== undefined ? o[key] : null),
                obj
            );
    }
}
