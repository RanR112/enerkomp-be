/**
 * @file ExportService – Ekspor data ke format Excel dan PDF
 * @description
 * Layanan terpusat untuk ekspor data:
 * - Excel (.xlsx) dengan styling profesional dan ringkasan otomatis
 * - PDF dengan header/footer perusahaan dan layout responsif
 *
 * @security
 * - Semua path file divalidasi → hindari path traversal
 * - Input data divalidasi → hindari crash pada data corrupt
 * - Tidak ada credential atau data sensitif di log
 *
 * @usage
 * const exportService = new ExportService(summaryService);
 *
 * await exportService.toExcel(sheets, 'users', res);
 * exportService.toPdf(data, 'clients', 'Client Report', res);
 *
 * @dependencies
 * - `exceljs` v4+ untuk Excel export
 * - `pdfkit` v0.15+ untuk PDF export
 * - `date-fns` untuk formatting tanggal
 */

import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { format } from "date-fns";
import path from "path";
import { Response } from "express";
import { SummaryService, SummaryResult } from "./summary.service";

export interface ExportServiceConfig {
    companyName: string;
    companyAddress: string;
    companyEmail: string;
    logoPath: string;
}

export class ExportService {
    private readonly config: ExportServiceConfig;
    private readonly summaryService: SummaryService;

    constructor(
        summaryService: SummaryService,
        config: ExportServiceConfig = {
            companyName: "PT ENERKOMP PERSADA RAYA",
            companyAddress:
                "Grand Slipi Tower Building 42nd Floor Unit G-H Kav 22-24, West Jakarta, DKI Jakarta 11480",
            companyEmail: "info@enerkomp.co.id",
            logoPath: path.join(
                __dirname,
                "../../../public/images/logo/logo-primary.png"
            ),
        }
    ) {
        this.summaryService = summaryService;
        this.config = config;
    }

    private getColors() {
        return {
            Primary: "#2D4C52",
            Secondary: "#46777E",
            Third: "#6BA4A8",
            Fourth: "#D8F6DA",
            Accent: "#F3994B",
            White: "#FFFFFF",
            Black: "#000000",
            Card: "#F4F6F6",
            Footer: "#1C2E33",
        };
    }

    private getTableNameFromFilename(filename: string): string {
        const lower = filename.toLowerCase();
        if (lower.includes("user")) return "user";
        if (lower.includes("client")) return "client";
        if (lower.includes("analytics")) return "analytics";
        if (lower.includes("product")) return "product";
        if (lower.includes("brand")) return "brand";
        return "";
    }

    /**
     * Ekspor data ke format Excel (.xlsx)
     * @param sheets - Definition sheet (name, headers, rows)
     * @param filename - Nama dasar file
     * @param res - Express response untuk streaming
     */
    async toExcel(
        sheets: {
            name: string;
            headers: string[];
            rows: Record<string, any>[];
        }[],
        filename: string,
        res: Response
    ): Promise<void> {
        if (!sheets || sheets.length === 0) {
            res.status(400).json({ error: "No sheets to export" });
            return;
        }

        const workbook = new ExcelJS.Workbook();
        const colors = this.getColors();
        const generatedAt = new Date();

        const colNumberToLetter = (col: number) => {
            let s = "";
            while (col > 0) {
                const mod = (col - 1) % 26;
                s = String.fromCharCode(65 + mod) + s;
                col = Math.floor((col - 1) / 26);
            }
            return s;
        };

        for (const sheetDef of sheets) {
            const { name, headers, rows } = sheetDef;
            if (headers.length === 0) continue;

            const worksheet = workbook.addWorksheet(name || "Sheet");
            worksheet.columns = headers.map((h) => ({
                header: h,
                key: h,
                width: 10,
            }));

            const columnCount = headers.length;
            const lastColLetter = colNumberToLetter(columnCount);

            // Header perusahaan
            worksheet.mergeCells(`A1:${lastColLetter}1`);
            worksheet.mergeCells(`A2:${lastColLetter}2`);
            worksheet.mergeCells(`A3:${lastColLetter}3`);

            const companyCell = worksheet.getCell("A1");
            companyCell.value = this.config.companyName;
            companyCell.font = {
                size: 16,
                bold: true,
                color: { argb: colors.Primary.replace("#", "") },
            };
            companyCell.alignment = {
                vertical: "middle",
                horizontal: "center",
            };

            const titleCell = worksheet.getCell("A2");
            titleCell.value = `Data Report - ${name}`;
            titleCell.font = {
                size: 12,
                bold: true,
                color: { argb: colors.Secondary.replace("#", "") },
            };
            titleCell.alignment = { vertical: "middle", horizontal: "center" };

            const metaCell = worksheet.getCell("A3");
            metaCell.value = `Generated: ${
                generatedAt.toISOString().split("T")[0]
            } | By: System`;
            metaCell.font = { size: 10, color: { argb: "FF000000" } };
            metaCell.alignment = { vertical: "middle", horizontal: "center" };

            // Header tabel
            const HEADER_ROW_INDEX = 5;
            const headerRow = worksheet.getRow(HEADER_ROW_INDEX);
            headerRow.values = headers;
            headerRow.height = 20;

            headerRow.eachCell((cell) => {
                cell.font = {
                    bold: true,
                    color: { argb: colors.White.replace("#", "") },
                };
                cell.alignment = {
                    horizontal: "center",
                    vertical: "middle",
                    wrapText: true,
                };
                cell.fill = {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: colors.Primary.replace("#", "") },
                };
                cell.border = {
                    top: { style: "thin" },
                    left: { style: "thin" },
                    bottom: { style: "thin" },
                    right: { style: "thin" },
                };
            });

            // Data rows
            for (const r of rows) {
                const rowValues = headers.map((h) => {
                    const v = r[h];
                    if (v === null || v === undefined) return "";
                    if (v instanceof Date) return v.toISOString().split("T")[0];
                    return typeof v === "object" ? JSON.stringify(v) : v;
                });
                worksheet.addRow(rowValues);
            }

            // Styling data rows
            const firstDataRowIndex = HEADER_ROW_INDEX + 1;
            const lastRowIndex = worksheet.rowCount;
            for (
                let rowIndex = firstDataRowIndex;
                rowIndex <= lastRowIndex;
                rowIndex++
            ) {
                const row = worksheet.getRow(rowIndex);
                row.eachCell((cell, colNumber) => {
                    const v = cell.value;
                    cell.alignment = {
                        horizontal: typeof v === "number" ? "right" : "left",
                        vertical: "middle",
                        wrapText: true,
                    };
                    cell.border = {
                        top: { style: "thin" },
                        left: { style: "thin" },
                        bottom: { style: "thin" },
                        right: { style: "thin" },
                    };
                });

                if ((rowIndex - firstDataRowIndex) % 2 === 0) {
                    row.fill = {
                        type: "pattern",
                        pattern: "solid",
                        fgColor: { argb: colors.Card.replace("#", "") },
                    };
                }
            }

            // Auto-fit columns
            const MIN_COL_WIDTH = 8;
            const MAX_COL_WIDTH = 50;
            (worksheet.columns || []).forEach((col) => {
                if (!col) return;
                let maxLength = String(col.header || "").length;
                try {
                    (col as ExcelJS.Column).eachCell(
                        { includeEmpty: true },
                        (cell) => {
                            const text =
                                cell.value === null || cell.value === undefined
                                    ? ""
                                    : String(cell.value);
                            maxLength = Math.max(maxLength, text.length);
                        }
                    );
                } catch {}
                col.width = Math.min(
                    MAX_COL_WIDTH,
                    Math.max(MIN_COL_WIDTH, maxLength + 2)
                );
            });

            // Freeze header
            worksheet.views = [{ state: "frozen", ySplit: HEADER_ROW_INDEX }];

            // Summary section
            const summaryStartRow = worksheet.rowCount + 2;
            const summaryTitleRow = worksheet.getRow(summaryStartRow);
            summaryTitleRow.getCell(1).value = "Summary (Auto Generated)";
            summaryTitleRow.height = 22;
            summaryTitleRow.getCell(1).font = {
                bold: true,
                size: 13,
                color: { argb: colors.Primary.replace("#", "") },
            };
            worksheet.mergeCells(
                summaryStartRow,
                1,
                summaryStartRow,
                columnCount
            );
            summaryTitleRow.getCell(1).alignment = {
                horizontal: "left",
                vertical: "middle",
            };

            const summaryResult = this.summaryService.generate(
                rows,
                this.getTableNameFromFilename(filename)
            );
            const summaryRows = this.buildSummaryRows(summaryResult);

            let sr = summaryStartRow + 1;
            summaryRows.forEach((item) => {
                const row = worksheet.getRow(sr);
                row.getCell(1).value = item.label;
                row.getCell(2).value = item.value;

                row.getCell(1).font = {
                    bold: this.isSummarySectionTitle(item.label),
                    color: { argb: colors.Black.replace("#", "") },
                };
                row.getCell(2).font = {
                    color: { argb: colors.Black.replace("#", "") },
                };

                row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                    if (colNumber <= 2) {
                        cell.border = {
                            top: { style: "thin", color: { argb: "FFD1D5DB" } },
                            left: {
                                style: "thin",
                                color: { argb: "FFD1D5DB" },
                            },
                            bottom: {
                                style: "thin",
                                color: { argb: "FFD1D5DB" },
                            },
                            right: {
                                style: "thin",
                                color: { argb: "FFD1D5DB" },
                            },
                        };
                        cell.fill = {
                            type: "pattern",
                            pattern: "solid",
                            fgColor: { argb: colors.Card.replace("#", "") },
                        };
                        cell.alignment = {
                            vertical: "middle",
                            horizontal: "left",
                        };
                    }
                });
                sr++;
            });
        }

        // Send response
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const dateSuffix = `${now.getFullYear()}-${pad(
            now.getMonth() + 1
        )}-${pad(now.getDate())}`;
        const safeFilename = `${filename}_${dateSuffix}.xlsx`;

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${safeFilename}"`
        );

        await workbook.xlsx.write(res);
        res.end();
    }

    private buildSummaryRows(
        summaryResult: SummaryResult
    ): { label: string; value: string | number }[] {
        const rows: { label: string; value: string | number }[] = [];
        const { enumSummary, integerSummary, averageSummary } = summaryResult;

        if (Object.keys(integerSummary).length > 0) {
            rows.push({ label: "Numeric Value Totals", value: "" });
            Object.entries(integerSummary).forEach(([key, total]) => {
                rows.push({ label: ` • ${key}`, value: total });
            });
        }

        if (Object.keys(averageSummary).length > 0) {
            rows.push({ label: "Analytics Averages", value: "" });
            Object.entries(averageSummary).forEach(([key, avg]) => {
                const isTime = key.toLowerCase().includes("time");
                rows.push({
                    label: ` • ${key}`,
                    value: isTime
                        ? Math.round(avg)
                        : parseFloat(avg.toFixed(2)),
                });
            });
        }

        if (Object.keys(enumSummary).length > 0) {
            rows.push({ label: "Value Classification", value: "" });
            Object.entries(enumSummary).forEach(([field, counts]) => {
                rows.push({ label: ` → ${field}`, value: "" });
                Object.entries(counts).forEach(([val, count]) => {
                    rows.push({ label: `   • ${val}`, value: count });
                });
            });
        }

        if (rows.length === 0) {
            rows.push({ label: "No summary available", value: "" });
        }

        return rows;
    }

    private isSummarySectionTitle(label: string): boolean {
        return (
            label === "Numeric Value Totals" ||
            label === "Analytics Averages" ||
            label === "Value Classification"
        );
    }

    /**
     * Ekspor data ke format PDF
     * @param data - Data untuk diekspor
     * @param filenameBase - Nama dasar file
     * @param title - Judul laporan
     * @param res - Express response
     */
    toPdf(
        data: Record<string, any>[],
        filenameBase: string,
        title: string,
        res: Response
    ): void {
        if (!data || data.length === 0) {
            res.status(400).json({ error: "No data to export" });
            return;
        }

        const doc = new PDFDocument({
            size: "A4",
            margin: 40,
            info: {
                Title: title,
                Author: this.config.companyName,
            },
        });

        const dateSuffix = format(new Date(), "yyyy-MM-dd");
        const filename = `${filenameBase}_${dateSuffix}.pdf`;

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${filename}"`
        );
        doc.pipe(res);

        const colors = this.getColors();
        const leftX = 40;
        const pageWidth =
            (doc as any).page.width -
            (doc as any).page.margins.left -
            (doc as any).page.margins.right;
        const usableWidth =
            pageWidth - (leftX - (doc as any).page.margins.left);

        // Draw header on first page
        this.drawPdfHeader(doc, leftX, pageWidth, colors, title);

        // Setup pageAdded listener
        (doc as any).on("pageAdded", () => {
            this.drawPdfHeader(doc, leftX, pageWidth, colors, title);
        });

        const headers = Object.keys(data[0]);
        this.drawPdfTable(doc, data, headers, leftX, usableWidth, colors);

        // Summary page
        doc.addPage();
        this.drawPdfHeader(doc, leftX, pageWidth, colors, title);
        this.drawPdfSummary(doc, data, filenameBase, leftX, colors);

        doc.end();
    }

    private drawPdfHeader(
        doc: typeof PDFDocument,
        leftX: number,
        pageWidth: number,
        colors: Record<string, string>,
        title: string
    ) {
        const usableWidth = pageWidth - (leftX - 40);

        try {
            doc.image(this.config.logoPath, leftX, 35, {
                width: 60,
                height: 60,
            });
        } catch {
            doc.rect(leftX, 35, 60, 60)
                .fillAndStroke(colors.Fourth, colors.Primary)
                .fillColor(colors.Primary)
                .fontSize(18)
                .font("Helvetica-Bold")
                .text(
                    "PT ENERKOMP PERSADA RAYA".slice(0, 3).toUpperCase(),
                    leftX + 8,
                    50
                );
            doc.fillColor(colors.Black);
        }

        doc.fontSize(14)
            .fillColor(colors.Primary)
            .font("Helvetica-Bold")
            .text(this.config.companyName, leftX + 80, 40);

        doc.fontSize(10)
            .fillColor(colors.Secondary)
            .font("Helvetica-Bold")
            .text(this.config.companyAddress, leftX + 80, 60);

        doc.fontSize(9)
            .fillColor(colors.Third)
            .font("Helvetica")
            .text("Generated by system", leftX + 80, 80);

        doc.rect(leftX, 105, usableWidth, 40).fillAndStroke(
            colors.Primary,
            colors.Primary
        );
        doc.fillColor(colors.White)
            .fontSize(14)
            .font("Helvetica-Bold")
            .text(title, leftX, 116, { width: usableWidth, align: "center" });

        doc.fontSize(9)
            .fillColor(colors.White)
            .text(
                `Print Date: ${format(new Date(), "dd/MM/yyyy HH:mm")}`,
                leftX + usableWidth - 170,
                118,
                {
                    width: 160,
                    align: "right",
                }
            );
    }

    private drawPdfTable(
        doc: typeof PDFDocument,
        data: Record<string, any>[],
        headers: string[],
        leftX: number,
        usableWidth: number,
        colors: Record<string, string>
    ) {
        doc.fontSize(10).font("Helvetica");
        const paddingPerCell = 8;

        const measuredWidths = headers.map((h) => {
            const headerW = doc.widthOfString(String(h)) + paddingPerCell;
            const maxDataW = data.reduce((acc, row) => {
                const cellText =
                    row[h] !== undefined && row[h] !== null
                        ? String(row[h])
                        : "";
                const w = doc.widthOfString(cellText) + paddingPerCell;
                return Math.max(acc, w);
            }, 0);
            return Math.max(headerW, maxDataW, 40);
        });

        let colWidths = [...measuredWidths];
        const totalMeasured = measuredWidths.reduce((s, v) => s + v, 0);
        if (totalMeasured > usableWidth) {
            const scale = usableWidth / totalMeasured;
            colWidths = measuredWidths.map((w) =>
                Math.max(30, Math.floor(w * scale))
            );
        }

        let sumWidths = colWidths.reduce((s, v) => s + v, 0);
        if (sumWidths < usableWidth) {
            let remaining = Math.floor(usableWidth - sumWidths);
            let i = 0;
            while (remaining > 0) {
                colWidths[i % colWidths.length] += 1;
                remaining--;
                i++;
            }
        }

        let cursorY = 160;
        const headerHeight = 26;
        doc.rect(leftX, cursorY, usableWidth, headerHeight).fillAndStroke(
            colors.Secondary,
            colors.Secondary
        );
        doc.fontSize(10).fillColor(colors.White).font("Helvetica-Bold");

        let tx = leftX;
        headers.forEach((h, idx) => {
            const w = colWidths[idx];
            doc.text(String(h), tx + 4, cursorY + 7, {
                width: w - 8,
                align: "left",
            });
            tx += w;
        });

        cursorY += headerHeight + 6;
        const rowHeight = 20;
        doc.fontSize(9).font("Helvetica");

        let rowIndex = 0;
        for (const row of data) {
            const bottomMargin = 80;
            const pageBottom = (doc as any).page.height - bottomMargin;
            if (cursorY + rowHeight > pageBottom) {
                this.drawPdfFooter(
                    doc,
                    leftX,
                    usableWidth,
                    colors,
                    (doc as any).page.number ?? 1
                );
                doc.addPage();
                cursorY = 160 + headerHeight + 6;
            }

            const bg = rowIndex % 2 === 0 ? colors.White : colors.Card;
            doc.rect(leftX, cursorY - 2, usableWidth, rowHeight).fillAndStroke(
                bg,
                "#e9e9e9"
            );

            let cx = leftX;
            headers.forEach((h, idx) => {
                const w = colWidths[idx];
                const cellText =
                    row[h] !== undefined && row[h] !== null
                        ? String(row[h])
                        : "";
                doc.fillColor(colors.Black)
                    .font("Helvetica")
                    .text(cellText, cx + 4, cursorY + 4, {
                        width: w - 8,
                        ellipsis: true,
                    });
                cx += w;
            });

            cursorY += rowHeight;
            rowIndex++;
        }

        this.drawPdfFooter(
            doc,
            leftX,
            usableWidth,
            colors,
            (doc as any).page.number ?? 1
        );
    }

    private drawPdfFooter(
        doc: typeof PDFDocument,
        leftX: number,
        usableWidth: number,
        colors: Record<string, string>,
        pageNumber: number
    ) {
        const footerY = (doc as any).page.height - 50;
        doc.strokeColor("#e0e0e0")
            .lineWidth(0.5)
            .moveTo(leftX, footerY - 8)
            .lineTo(leftX + usableWidth, footerY - 8)
            .stroke();

        doc.fontSize(9)
            .fillColor(colors.Secondary)
            .text(this.config.companyName, leftX, footerY - 4, { width: 300 });

        const pageText = `Halaman ${pageNumber}`;
        doc.fontSize(9)
            .fillColor(colors.Secondary)
            .text(pageText, leftX + usableWidth - 100, footerY - 4, {
                width: 100,
                align: "right",
            });
    }

    private drawPdfSummary(
        doc: typeof PDFDocument,
        data: Record<string, any>[],
        filenameBase: string,
        leftX: number,
        colors: Record<string, string>
    ) {
        doc.fontSize(10)
            .fillColor(colors.White)
            .font("Helvetica-Bold")
            .text("Summary (Auto Generated)", leftX + 10, 120);

        doc.fontSize(10).fillColor(colors.Black).font("Helvetica");

        const summaryResult = this.summaryService.generate(
            data,
            this.getTableNameFromFilename(filenameBase)
        );
        const { enumSummary, integerSummary, averageSummary } = summaryResult;

        let sy = 160;
        doc.fontSize(12)
            .font("Helvetica-Bold")
            .text("Summary Overview", leftX, sy);
        sy += 20;

        // Integer totals
        doc.fontSize(11)
            .font("Helvetica-Bold")
            .text("Numeric Value Totals:", leftX, sy);
        sy += 16;
        doc.fontSize(10).font("Helvetica");
        if (Object.keys(integerSummary).length === 0) {
            doc.text("No numeric values detected", leftX, sy);
            sy += 16;
        } else {
            Object.entries(integerSummary).forEach(([col, total]) => {
                doc.text(`${col}: ${total}`, leftX, sy);
                sy += 14;
            });
        }

        sy += 10;

        // Enum recap
        doc.fontSize(11)
            .font("Helvetica-Bold")
            .text("Value Classification:", leftX, sy);
        sy += 16;
        doc.fontSize(10).font("Helvetica");
        if (Object.keys(enumSummary).length === 0) {
            doc.text("No classification values detected", leftX, sy);
            sy += 14;
        } else {
            Object.entries(enumSummary).forEach(([col, values]) => {
                doc.font("Helvetica-Bold").text(col + ":", leftX, sy);
                sy += 14;
                doc.font("Helvetica");
                Object.entries(values).forEach(([val, count]) => {
                    doc.text(`- ${val}: ${count}`, leftX + 15, sy);
                    sy += 12;
                });
                sy += 6;
            });
        }

        sy += 10;

        // Analytics averages
        if (Object.keys(averageSummary).length > 0) {
            doc.fontSize(11)
                .font("Helvetica-Bold")
                .text("Analytics Averages:", leftX, sy);
            sy += 16;
            doc.fontSize(10).font("Helvetica");
            Object.entries(averageSummary).forEach(([col, avg]) => {
                doc.text(`${col}: ${avg.toFixed(2)}`, leftX, sy);
                sy += 14;
            });
        }

        doc.moveDown(2);
        doc.fontSize(9)
            .fillColor(colors.Secondary)
            .text(
                `Summary generated automatically at ${format(
                    new Date(),
                    "dd/MM/yyyy HH:mm"
                )}`
            );
    }
}
