/**
 * @file BrandController – Antarmuka HTTP untuk manajemen brand
 * @description
 * Controller class-based untuk mengelola operasi brand Enerkomp:
 * - CRUD brand (termasuk soft/hard delete dan restore)
 * - Manajemen logo (upload, update)
 * - Ekspor data ke Excel dan PDF
 *
 * @security
 * - Semua endpoint yang mengubah data memerlukan autentikasi
 * - Permission checking dilakukan di middleware
 * - Validasi input dasar di level controller
 *
 * @usage
 * const brandController = new BrandController(brandService, slugService, sortOrderService, exportService);
 * router.get('/brands', brandController.getBrands);
 *
 * @dependencies
 * - `BrandService`, `SlugService`, `SortOrderService`, `ExportService`
 * - Express Request/Response
 */

import { Request, Response } from "express";
import { BrandType } from "@prisma/client";
import { BrandService } from "../services/brand.service";
import { SlugService } from "../services/slug.service";
import { SortOrderService } from "../services/sort-order.service";
import { ExportService } from "../services/reporting/export.service";

export class BrandController {
    constructor(
        private brandService: BrandService,
        private slugService: SlugService,
        private sortOrderService: SortOrderService,
        private exportService: ExportService
    ) {}

    /**
     * Endpoint: GET /brands
     * Ambil daftar brand dengan pagination, filter tipe, dan pencarian
     */
    getBrands = async (req: Request, res: Response): Promise<void> => {
        try {
            const {
                deleted,
                page = "1",
                limit = "10",
                type,
                search,
            } = req.query;

            // Validasi tipe brand
            if (type && !["PRODUCT", "CLIENT"].includes(type as string)) {
                res.status(400).json({
                    error: 'Invalid brand type. Use "PRODUCT" or "CLIENT".',
                });
                return;
            }

            const result = await this.brandService.list({
                deleted: deleted === "true",
                page: parseInt(page as string, 10),
                limit: parseInt(limit as string, 10),
                type: type as BrandType | undefined,
                search: search ? String(search) : undefined,
            });

            res.status(200).json(result);
        } catch (error) {
            this.handleError(res, error, "Failed to fetch brands");
        }
    };

    /**
     * Endpoint: GET /brands/:id
     * Ambil detail brand berdasarkan ID
     */
    getBrand = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const brand = await this.brandService.findById(id);

            if (!brand) {
                res.status(404).json({ error: "Brand not found" });
                return;
            }

            res.status(200).json(brand);
        } catch (error) {
            this.handleError(res, error, "Failed to fetch brand");
        }
    };

    /**
     * Endpoint: POST /brands
     * Buat brand baru
     */
    createBrand = async (req: Request, res: Response): Promise<void> => {
        try {
            const {
                name,
                slug: inputSlug,
                type = "PRODUCT",
                isActive = true,
                sortOrder: sortOrderRaw,
            } = req.body;

            if (!name) {
                res.status(400).json({ error: "Name is required" });
                return;
            }

            // Generate slug
            const slug = inputSlug || this.slugService.generate(name);

            // Parse sortOrder
            const sortOrder = this.sortOrderService.parse(sortOrderRaw);

            // Ambil URL logo dari upload
            const logoUrl = req.file
                ? `/uploads/brands/${req.file.filename}`
                : null;

            const brand = await this.brandService.create({
                slug,
                name,
                logo: logoUrl,
                type: type as BrandType,
                isActive,
                sortOrder,
                createdBy: req.user!.id,
                ipAddress: this.getClientIp(req),
                userAgent: req.get("User-Agent") || "",
            });

            res.status(201).json(brand);
        } catch (error) {
            this.handleError(res, error, "Failed to create brand", 400);
        }
    };

    /**
     * Endpoint: PUT /brands/:id
     * Update brand yang sudah ada
     */
    updateBrand = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const {
                name,
                slug: inputSlug,
                type,
                isActive: isActiveRaw,
                sortOrder: sortOrderRaw,
            } = req.body;

            if (!name) {
                res.status(400).json({ error: "Name is required" });
                return;
            }

            // Konversi boolean
            const isActive =
                isActiveRaw === "true" ||
                isActiveRaw === "1" ||
                isActiveRaw === true;

            // Generate slug
            const slug = inputSlug || this.slugService.generate(name);

            // Parse sortOrder
            const sortOrder = this.sortOrderService.parse(sortOrderRaw);

            // Ambil URL logo dari upload atau existing
            const logoUrl = req.file
                ? `/uploads/brands/${req.file.filename}`
                : req.body.logo;

            const brand = await this.brandService.update({
                id,
                slug,
                name,
                logo: logoUrl,
                type: type as BrandType,
                isActive,
                sortOrder,
                updatedBy: req.user!.id,
                ipAddress: this.getClientIp(req),
                userAgent: req.get("User-Agent") || "",
            });

            res.status(200).json(brand);
        } catch (error) {
            this.handleError(res, error, "Failed to update brand", 400);
        }
    };

    /**
     * Endpoint: DELETE /brands/:id
     * Soft delete brand
     */
    deleteBrand = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;

            await this.brandService.delete({
                id,
                deletedBy: req.user!.id,
                ipAddress: this.getClientIp(req),
                userAgent: req.get("User-Agent") || "",
            });

            res.status(200).json({ message: "Brand deleted successfully" });
        } catch (error) {
            this.handleError(res, error, "Failed to delete brand", 400);
        }
    };

    /**
     * Endpoint: DELETE /brands/:id/hard
     * Hard delete brand (permanen)
     */
    hardDeleteBrand = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;

            await this.brandService.hardDelete({
                id,
                deletedBy: req.user!.id,
                ipAddress: this.getClientIp(req),
                userAgent: req.get("User-Agent") || "",
            });

            res.status(204).end();
        } catch (error) {
            this.handleError(res, error, "Failed to hard delete brand", 400);
        }
    };

    /**
     * Endpoint: GET /brands/export/excel
     * Ekspor data brand ke Excel
     */
    exportExcel = async (req: Request, res: Response): Promise<void> => {
        try {
            const brands = await this.brandService.list({
                deleted: false,
                page: 1,
                limit: 1000, // Ambil semua untuk export
            });

            const rows = (brands.data || []).map((brand) => ({
                Name: brand.name,
                Type: brand.type,
                "Is Active": brand.isActive,
                "Created At": brand.createdAt
                    ? brand.createdAt.toISOString().split("T")[0]
                    : "",
            }));

            const sheets = [
                {
                    name: "Brands",
                    headers: rows.length > 0 ? Object.keys(rows[0]) : [],
                    rows,
                },
            ];

            await this.exportService.toExcel(sheets, "brands-report", res);
        } catch (error) {
            this.handleError(res, error, "Export to Excel failed");
        }
    };

    /**
     * Endpoint: GET /brands/export/pdf
     * Ekspor data brand ke PDF
     */
    exportPdf = async (req: Request, res: Response): Promise<void> => {
        try {
            const brands = await this.brandService.list({
                deleted: false,
                page: 1,
                limit: 1000, // Ambil semua untuk export
            });

            const exportData = (brands.data || []).map((brand) => ({
                Name: brand.name,
                Type: brand.type,
                "Is Active": brand.isActive,
                "Created At": brand.createdAt
                    ? brand.createdAt.toISOString().split("T")[0]
                    : "",
            }));

            this.exportService.toPdf(
                exportData,
                "brands-report",
                "Brand List",
                res
            );
        } catch (error) {
            this.handleError(res, error, "Export to PDF failed");
        }
    };

    // Helper methods
    private getClientIp(req: Request): string {
        return (
            req.ip ||
            (req.connection as any)?.remoteAddress ||
            (req.headers["x-forwarded-for"] as string) ||
            ""
        );
    }

    private handleError(
        res: Response,
        error: unknown,
        defaultMessage: string,
        statusCode: number = 500
    ): void {
        const message = error instanceof Error ? error.message : defaultMessage;
        res.status(statusCode).json({ error: message });
    }
}
