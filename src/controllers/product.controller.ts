/**
 * @file ProductController – Antarmuka HTTP untuk manajemen produk Enerkomp
 * @description
 * Controller class-based untuk mengelola operasi produk:
 * - CRUD produk (termasuk soft/hard delete dan restore)
 * - Manajemen gambar produk (multi-upload)
 * - Manajemen terjemahan produk (multi-bahasa)
 * - Ekspor data ke Excel dan PDF
 *
 * @security
 * - Semua endpoint yang mengubah data memerlukan autentikasi
 * - Permission checking dilakukan di middleware
 * - Validasi input ketat untuk SKU, slug, dan terjemahan
 *
 * @usage
 * const productController = new ProductController(productService, slugService, sortOrderService, exportService);
 * router.get('/products', productController.getProducts);
 *
 * @dependencies
 * - `ProductService`, `SlugService`, `SortOrderService`, `ExportService`
 * - Express Request/Response
 */

import { Request, Response } from "express";
import { Language } from "@prisma/client";
import { ProductService } from "../services/product.service";
import { SlugService } from "../services/slug.service";
import { SortOrderService } from "../services/sort-order.service";
import { ExportService } from "../services/reporting/export.service";

export interface ProductTranslationInput {
    language: Language;
    shortDescription?: string;
    longDescription?: string;
    specifications?: any;
    features?: any;
    metaTitle?: string;
    metaDescription?: string;
    metaKeywords?: string;
}

export class ProductController {
    constructor(
        private productService: ProductService,
        private slugService: SlugService,
        private sortOrderService: SortOrderService,
        private exportService: ExportService
    ) {}

    /**
     * Endpoint: GET /products
     * Ambil daftar produk dengan pagination dan filter
     */
    getProducts = async (req: Request, res: Response): Promise<void> => {
        try {
            const {
                brands,
                categories,
                deleted,
                active,
                page = "1",
                limit = "10",
                search,
            } = req.query;

            const result = await this.productService.list({
                brands: brands ? String(brands) : undefined,
                categories: categories ? String(categories) : undefined,
                deleted: deleted === "true",
                active: active === "true",
                page: parseInt(page as string, 10),
                limit: parseInt(limit as string, 10),
                search: search ? String(search) : undefined,
            });

            res.status(200).json(result);
        } catch (error) {
            this.handleError(res, error, "Failed to fetch products");
        }
    };

    /**
     * Endpoint: GET /products/:id
     * Ambil detail produk berdasarkan ID
     */
    getProduct = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const product = await this.productService.findById(id);

            if (!product) {
                res.status(404).json({ error: "Product not found" });
                return;
            }

            res.status(200).json(product);
        } catch (error) {
            this.handleError(res, error, "Failed to fetch product");
        }
    };

    /**
     * Endpoint: POST /products
     * Buat produk baru
     */
    createProduct = async (req: Request, res: Response): Promise<void> => {
        try {
            const {
                slug: providedSlug,
                sku,
                name,
                categoryId,
                brandId,
                isActive: isActiveRaw = "true",
                isFeatured: isFeaturedRaw = "false",
                translations: translationsString,
                sortOrder: sortOrderRaw,
            } = req.body;

            if (!name || !categoryId || !brandId) {
                res.status(400).json({
                    error: "Name, category, and brand are required",
                });
                return;
            }

            // Konversi boolean
            const isActive = isActiveRaw === "true" || isActiveRaw === "1";
            const isFeatured =
                isFeaturedRaw === "true" || isFeaturedRaw === "1";

            // Parse sortOrder
            const sortOrder = this.sortOrderService.parse(sortOrderRaw);

            // Ambil URL gambar dari upload
            const imageUrls = Array.isArray(req.files)
                ? req.files.map((file) => `/uploads/products/${file.filename}`)
                : [];

            // Parse translations
            let translations: ProductTranslationInput[] = [];
            if (translationsString) {
                try {
                    translations = JSON.parse(translationsString);

                    // Validasi translations
                    for (const t of translations) {
                        if (!Object.values(Language).includes(t.language)) {
                            res.status(400).json({
                                error: "Invalid language in translation",
                            });
                            return;
                        }
                        if (!t.shortDescription || !t.longDescription) {
                            res.status(400).json({
                                error: "shortDescription and longDescription are required in each translation",
                            });
                            return;
                        }
                    }
                } catch (e) {
                    res.status(400).json({
                        error: "Invalid JSON format for translations",
                    });
                    return;
                }
            }

            // Generate slug
            const slug = providedSlug || this.slugService.generate(name);

            const product = await this.productService.create({
                data: {
                    slug,
                    sku: sku || null,
                    name,
                    categoryId,
                    brandId,
                    images: imageUrls,
                    isActive,
                    isFeatured,
                    sortOrder,
                },
                translations,
                createdBy: req.user!.id,
                ipAddress: this.getClientIp(req),
                userAgent: req.get("User-Agent") || "",
            });

            res.status(201).json(product);
        } catch (error) {
            this.handleError(res, error, "Failed to create product", 400);
        }
    };

    /**
     * Endpoint: PUT /products/:id
     * Update produk yang sudah ada
     */
    updateProduct = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const {
                sku,
                name,
                categoryId,
                brandId,
                isActive: isActiveRaw,
                isFeatured: isFeaturedRaw,
                sortOrder: sortOrderRaw,
                translations: translationsString,
            } = req.body;

            if (!name || !categoryId || !brandId) {
                res.status(400).json({
                    error: "Name, category, and brand are required",
                });
                return;
            }

            // Konversi boolean
            const isActive =
                isActiveRaw === "true" ||
                isActiveRaw === "1" ||
                isActiveRaw === true;
            const isFeatured =
                isFeaturedRaw === "true" ||
                isFeaturedRaw === "1" ||
                isFeaturedRaw === true;

            // Parse sortOrder
            const sortOrder = this.sortOrderService.parse(sortOrderRaw);

            // Ambil URL gambar dari upload atau existing
            let imageUrls: string[] = [];

            // Dari existing images di body
            if (req.body.images) {
                try {
                    imageUrls =
                        typeof req.body.images === "string"
                            ? JSON.parse(req.body.images)
                            : Array.isArray(req.body.images)
                            ? req.body.images
                            : [];
                } catch (e) {
                    // Ignore parsing error, use empty array
                }
            }

            // Dari upload file
            if (Array.isArray(req.files) && req.files.length > 0) {
                const newImageUrls = req.files.map(
                    (file) => `/uploads/products/${file.filename}`
                );
                imageUrls = [...imageUrls, ...newImageUrls];
            }

            // Parse translations
            let translations: ProductTranslationInput[] = [];
            if (translationsString) {
                try {
                    translations = JSON.parse(translationsString);

                    // Validasi translations
                    for (const t of translations) {
                        if (!Object.values(Language).includes(t.language)) {
                            res.status(400).json({
                                error: "Invalid language in translation",
                            });
                            return;
                        }
                        if (!t.shortDescription || !t.longDescription) {
                            res.status(400).json({
                                error: "shortDescription and longDescription are required in each translation",
                            });
                            return;
                        }
                    }
                } catch (e) {
                    res.status(400).json({
                        error: "Invalid JSON format for translations",
                    });
                    return;
                }
            }

            // Generate slug
            const slug = req.body.slug || this.slugService.generate(name);

            const product = await this.productService.update({
                id,
                data: {
                    slug,
                    sku: sku || null,
                    name,
                    categoryId,
                    brandId,
                    images: imageUrls,
                    isActive,
                    isFeatured,
                    sortOrder,
                },
                translations,
                updatedBy: req.user!.id,
                ipAddress: this.getClientIp(req),
                userAgent: req.get("User-Agent") || "",
            });

            res.status(200).json(product);
        } catch (error) {
            this.handleError(res, error, "Failed to update product", 400);
        }
    };

    /**
     * Endpoint: DELETE /products/:id
     * Soft delete produk
     */
    deleteProduct = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;

            await this.productService.delete({
                id,
                deletedBy: req.user!.id,
                ipAddress: this.getClientIp(req),
                userAgent: req.get("User-Agent") || "",
            });

            res.status(200).json({ message: "Product deleted successfully" });
        } catch (error) {
            this.handleError(res, error, "Failed to delete product", 400);
        }
    };

    /**
     * Endpoint: DELETE /products/:id/hard
     * Hard delete produk (permanen)
     */
    hardDeleteProduct = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;

            await this.productService.hardDelete({
                id,
                deletedBy: req.user!.id,
                ipAddress: this.getClientIp(req),
                userAgent: req.get("User-Agent") || "",
            });

            res.status(204).end();
        } catch (error) {
            this.handleError(res, error, "Failed to hard delete product", 400);
        }
    };

    /**
     * Endpoint: GET /products/export/excel
     * Ekspor data produk ke Excel
     */
    exportExcel = async (req: Request, res: Response): Promise<void> => {
        try {
            const products = await this.productService.list({
                deleted: false,
                page: 1,
                limit: 1000, // Ambil semua untuk export
            });

            const rows = (products.data || []).map((item) => ({
                Name: item.name,
                SKU: item.sku || "",
                Category: item.category?.name || "",
                Brand: item.brand?.name || "",
                "Is Active": item.isActive,
                "Created At": item.createdAt
                    ? item.createdAt.toISOString().split("T")[0]
                    : "",
            }));

            const sheets = [
                {
                    name: "Products",
                    headers: rows.length > 0 ? Object.keys(rows[0]) : [],
                    rows,
                },
            ];

            await this.exportService.toExcel(sheets, "products-report", res);
        } catch (error) {
            this.handleError(res, error, "Export to Excel failed");
        }
    };

    /**
     * Endpoint: GET /products/export/pdf
     * Ekspor data produk ke PDF
     */
    exportPdf = async (req: Request, res: Response): Promise<void> => {
        try {
            const products = await this.productService.list({
                deleted: false,
                page: 1,
                limit: 1000, // Ambil semua untuk export
            });

            const exportData = (products.data || []).map((item) => ({
                Name: item.name,
                SKU: item.sku || "",
                Category: item.category?.name || "",
                Brand: item.brand?.name || "",
                "Is Active": item.isActive,
                "Created At": item.createdAt
                    ? item.createdAt.toISOString().split("T")[0]
                    : "",
            }));

            this.exportService.toPdf(
                exportData,
                "products-report",
                "Product List",
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
