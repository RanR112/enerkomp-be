/**
 * @file ExportToExcel Adapter – Kompatibilitas dengan fungsi lama
 * @description
 * Menyediakan fungsi `exportToExcel()` seperti versi lama,
 * namun di-backup oleh `ExportService`.
 *
 * @usage
 * import { exportToExcel } from '@/utils/exportToExcel';
 * await exportToExcel(sheets, 'users', res);
 */

import { Response } from "express";
import { SummaryService } from "../../services/reporting/summary.service";
import { ExportService } from "../../services/reporting/export.service";

const summaryService = new SummaryService();
const exportService = new ExportService(summaryService);

export const exportToExcel = async (
    sheets: {
        name: string;
        headers: string[];
        rows: Record<string, any>[];
    }[],
    filename: string,
    res: Response
): Promise<void> => {
    await exportService.toExcel(sheets, filename, res);
};
