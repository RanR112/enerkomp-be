/**
 * @file ExportToPdf Adapter – Kompatibilitas dengan fungsi lama
 * @description
 * Menyediakan fungsi `exportToPdf()` seperti versi lama,
 * namun di-backup oleh `ExportService`.
 *
 * @usage
 * import { exportToPdf } from '@/utils/exportToPdf';
 * exportToPdf(data, 'clients', 'Client Report', res);
 */

import { Response } from "express";
import { SummaryService } from "../../services/reporting/summary.service";
import { ExportService } from "../../services/reporting/export.service";

const summaryService = new SummaryService();
const exportService = new ExportService(summaryService);

export const exportToPdf = (
    data: Record<string, any>[],
    filenameBase: string,
    title: string,
    res: Response
): void => {
    exportService.toPdf(data, filenameBase, title, res);
};
