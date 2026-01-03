/**
 * @file GalleryController – Antarmuka HTTP untuk manajemen galeri gambar
 * @description
 * Controller class-based untuk mengelola operasi galeri:
 * - CRUD gambar galeri (termasuk soft/hard delete)
 * - Integrasi dengan sistem upload file
 *
 * @security
 * - Semua endpoint yang mengubah data memerlukan autentikasi
 * - Permission checking dilakukan di middleware
 * - Validasi input dasar di level controller
 *
 * @usage
 * const galleryController = new GalleryController(galleryService);
 * router.get('/galleries', galleryController.getGalleries);
 *
 * @dependencies
 * - `GalleryService`
 * - Express Request/Response
 */

import { Request, Response } from "express";
import { GalleryService } from "../services/gallery.service";

export class GalleryController {
    constructor(private galleryService: GalleryService) {}

    /**
     * Endpoint: GET /galleries
     * Ambil daftar galeri dengan pagination
     */
    getGalleries = async (req: Request, res: Response): Promise<void> => {
        try {
            const { deleted, page = "1", limit = "10" } = req.query;

            const result = await this.galleryService.list({
                deleted: deleted === "true",
                page: parseInt(page as string, 10),
                limit: parseInt(limit as string, 10),
            });

            res.status(200).json(result);
        } catch (error) {
            this.handleError(res, error, "Failed to fetch galleries");
        }
    };

    /**
     * Endpoint: GET /galleries/:id
     * Ambil detail galeri berdasarkan ID
     */
    getGallery = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const gallery = await this.galleryService.findById(id);

            if (!gallery) {
                res.status(404).json({ error: "Gallery image not found" });
                return;
            }

            res.status(200).json(gallery);
        } catch (error) {
            this.handleError(res, error, "Failed to fetch gallery image");
        }
    };

    /**
     * Endpoint: POST /galleries
     * Buat galeri baru
     */
    createGallery = async (req: Request, res: Response): Promise<void> => {
        try {
            // Ambil URL gambar dari upload
            const imageUrl = req.file
                ? `/uploads/galleries/${req.file.filename}`
                : null;

            if (!imageUrl) {
                res.status(400).json({ error: "Image is required" });
                return;
            }

            const gallery = await this.galleryService.create({
                imageUrl,
                createdBy: req.user!.id,
                ipAddress: this.getClientIp(req),
                userAgent: req.get("User-Agent") || "",
            });

            res.status(201).json(gallery);
        } catch (error) {
            this.handleError(res, error, "Failed to add gallery image", 400);
        }
    };

    /**
     * Endpoint: DELETE /galleries/:id
     * Soft delete galeri
     */
    deleteGallery = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;

            await this.galleryService.delete({
                id,
                deletedBy: req.user!.id,
                ipAddress: this.getClientIp(req),
                userAgent: req.get("User-Agent") || "",
            });

            res.status(200).json({
                message: "Gallery image deleted successfully",
            });
        } catch (error) {
            this.handleError(res, error, "Failed to delete gallery image", 400);
        }
    };

    /**
     * Endpoint: DELETE /galleries/:id/hard
     * Hard delete galeri (permanen)
     */
    hardDeleteGallery = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;

            await this.galleryService.hardDelete({
                id,
                deletedBy: req.user!.id,
                ipAddress: this.getClientIp(req),
                userAgent: req.get("User-Agent") || "",
            });

            res.status(204).end();
        } catch (error) {
            this.handleError(
                res,
                error,
                "Failed to hard delete gallery image",
                400
            );
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
