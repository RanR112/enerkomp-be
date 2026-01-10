/**
 * @file CatalogController – Antarmuka HTTP untuk manajemen dokumen katalog
 * @description
 * Controller class-based untuk mengelola operasi katalog Enerkomp:
 * - CRUD dokumen katalog (PDF, Excel, dll)
 * - Integrasi dengan sistem upload file
 *
 * @security
 * - Semua endpoint yang mengubah data memerlukan autentikasi
 * - Permission checking dilakukan di middleware
 * - Validasi input dasar di level controller
 *
 * @usage
 * const catalogController = new CatalogController(catalogService);
 * router.get('/catalogs', catalogController.getCatalogs);
 *
 * @dependencies
 * - `CatalogService`
 * - Express Request/Response
 */

import { Request, Response } from "express";
import { CatalogService } from "../services/catalog.service";
import { getClientIp, handleError } from "../utils/http-helper";

export class CatalogController {
    constructor(private catalogService: CatalogService) {}

    /**
     * Endpoint: GET /catalogs
     * Ambil daftar katalog dengan pagination dan pencarian
     */
    getCatalogs = async (req: Request, res: Response): Promise<void> => {
        try {
            const { deleted, page = "1", limit = "10", search } = req.query;

            const result = await this.catalogService.list({
                deleted: deleted === "true",
                page: parseInt(page as string, 10),
                limit: parseInt(limit as string, 10),
                search: search ? String(search) : undefined,
            });

            res.status(200).json(result);
        } catch (error) {
            handleError(res, error, "Failed to fetch catalogs");
        }
    };

    /**
     * Endpoint: GET /catalogs/:id
     * Ambil detail katalog berdasarkan ID
     */
    getCatalog = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const catalog = await this.catalogService.findById(id);

            if (!catalog) {
                res.status(404).json({ error: "Catalog not found" });
                return;
            }

            res.status(200).json(catalog);
        } catch (error) {
            handleError(res, error, "Failed to fetch catalog");
        }
    };

    /**
     * Endpoint: POST /catalogs
     * Buat katalog baru
     */
    createCatalog = async (req: Request, res: Response): Promise<void> => {
        try {
            const { name, description } = req.body;

            // Ambil URL file dari upload atau body
            const fileUrl = req.file
                ? `/uploads/catalogs/${req.file.filename}`
                : req.body.file;

            if (!name || !fileUrl) {
                res.status(400).json({ error: "Name and file are required" });
                return;
            }

            const catalog = await this.catalogService.create({
                name,
                description: description || null,
                fileUrl,
                createdBy: req.user!.id,
                ipAddress: getClientIp(req),
                userAgent: req.get("User-Agent") || "",
            });

            res.status(201).json(catalog);
        } catch (error) {
            handleError(res, error, "Failed to create catalog", 400);
        }
    };

    /**
     * Endpoint: PUT /catalogs/:id
     * Update katalog yang sudah ada
     */
    updateCatalog = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const { name, description } = req.body;

            // Ambil URL file dari upload atau body
            const fileUrl = req.file
                ? `/uploads/catalogs/${req.file.filename}`
                : req.body.file;

            if (!name || !fileUrl) {
                res.status(400).json({ error: "Name and file are required" });
                return;
            }

            const catalog = await this.catalogService.update({
                id,
                name,
                description: description || null,
                fileUrl,
                updatedBy: req.user!.id,
                ipAddress: getClientIp(req),
                userAgent: req.get("User-Agent") || "",
            });

            res.status(200).json(catalog);
        } catch (error) {
            handleError(res, error, "Failed to update catalog", 400);
        }
    };

    /**
     * Endpoint: DELETE /catalogs/:id
     * Soft delete katalog
     */
    deleteCatalog = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;

            await this.catalogService.delete({
                id,
                deletedBy: req.user!.id,
                ipAddress: getClientIp(req),
                userAgent: req.get("User-Agent") || "",
            });

            res.status(200).json({ message: "Catalog deleted successfully" });
        } catch (error) {
            handleError(res, error, "Failed to delete catalog", 400);
        }
    };
}
