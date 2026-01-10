/**
 * @file CategoryController – Antarmuka HTTP untuk manajemen kategori produk
 * @description
 * Controller class-based untuk mengelola operasi kategori:
 * - CRUD kategori (termasuk soft/hard delete dan restore)
 * - Integrasi dengan sistem slug generation
 *
 * @security
 * - Semua endpoint yang mengubah data memerlukan autentikasi
 * - Permission checking dilakukan di middleware
 * - Validasi input dasar di level controller
 *
 * @usage
 * const categoryController = new CategoryController(categoryService, slugService);
 * router.get('/categories', categoryController.getCategories);
 *
 * @dependencies
 * - `CategoryService`, `SlugService`
 * - Express Request/Response
 */

import { Request, Response } from "express";
import { CategoryService } from "../services/category.service";
import { SlugService } from "../services/slug.service";
import { getClientIp, handleError } from "../utils/http-helper";

export class CategoryController {
    constructor(
        private categoryService: CategoryService,
        private slugService: SlugService
    ) {}

    /**
     * Endpoint: GET /categories
     * Ambil daftar kategori dengan pagination dan pencarian
     */
    getCategories = async (req: Request, res: Response): Promise<void> => {
        try {
            const { deleted, page = "1", limit = "10", search } = req.query;

            const result = await this.categoryService.list({
                deleted: deleted === "true",
                page: parseInt(page as string, 10),
                limit: parseInt(limit as string, 10),
                search: search ? String(search) : undefined,
            });

            res.status(200).json(result);
        } catch (error) {
            handleError(res, error, "Failed to fetch categories");
        }
    };

    /**
     * Endpoint: GET /categories/:id
     * Ambil detail kategori berdasarkan ID
     */
    getCategory = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const category = await this.categoryService.findById(id);

            if (!category) {
                res.status(404).json({ error: "Category not found" });
                return;
            }

            res.status(200).json(category);
        } catch (error) {
            handleError(res, error, "Failed to fetch category");
        }
    };

    /**
     * Endpoint: POST /categories
     * Buat kategori baru
     */
    createCategory = async (req: Request, res: Response): Promise<void> => {
        try {
            const { name, description, isActive = true } = req.body;

            if (!name) {
                res.status(400).json({ error: "Name is required" });
                return;
            }

            // Generate slug
            const slug = req.body.slug || this.slugService.generate(name);

            const category = await this.categoryService.create({
                slug,
                name,
                description: description || null,
                isActive,
                createdBy: req.user!.id,
                ipAddress: getClientIp(req),
                userAgent: req.get("User-Agent") || "",
            });

            res.status(201).json(category);
        } catch (error) {
            handleError(res, error, "Failed to create category", 400);
        }
    };

    /**
     * Endpoint: PUT /categories/:id
     * Update kategori yang sudah ada
     */
    updateCategory = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const { name, description, isActive } = req.body;

            if (!name) {
                res.status(400).json({ error: "Name is required" });
                return;
            }

            // Generate slug
            const slug = req.body.slug || this.slugService.generate(name);

            const category = await this.categoryService.update({
                id,
                slug,
                name,
                description: description || null,
                isActive,
                updatedBy: req.user!.id,
                ipAddress: getClientIp(req),
                userAgent: req.get("User-Agent") || "",
            });

            res.status(200).json(category);
        } catch (error) {
            handleError(res, error, "Failed to update category", 400);
        }
    };

    /**
     * Endpoint: DELETE /categories/:id
     * Soft delete kategori
     */
    deleteCategory = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;

            await this.categoryService.delete({
                id,
                deletedBy: req.user!.id,
                ipAddress: getClientIp(req),
                userAgent: req.get("User-Agent") || "",
            });

            res.status(200).json({ message: "Category deleted successfully" });
        } catch (error) {
            handleError(res, error, "Failed to delete category", 400);
        }
    };

    /**
     * Endpoint: DELETE /categories/:id/hard
     * Hard delete kategori (permanen)
     */
    hardDeleteCategory = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;

            await this.categoryService.hardDelete({
                id,
                deletedBy: req.user!.id,
                ipAddress: getClientIp(req),
                userAgent: req.get("User-Agent") || "",
            });

            res.status(204).end();
        } catch (error) {
            handleError(res, error, "Failed to hard delete category", 400);
        }
    };
}
