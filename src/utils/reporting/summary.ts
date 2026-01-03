/**
 * @file Summary Adapter – Kompatibilitas dengan fungsi lama
 * @description
 * Menyediakan fungsi `generateSummary()` seperti versi lama,
 * namun di-backup oleh `SummaryService`.
 *
 * @usage
 * import { generateSummary } from '@/utils/summary';
 * const summary = generateSummary(rows, 'user');
 */

import { SummaryService } from "../../services/reporting/summary.service";

const summaryService = new SummaryService();

export function generateSummary(
    rows: Record<string, any>[],
    tableName?: string
) {
    return summaryService.generate(rows, tableName);
}
