/**
 * @file Product Routes – Definisi endpoint API untuk manajemen produk
 * @description
 * Routing Express untuk operasi produk dengan proteksi role-based:
 * - List & detail: publik (tanpa autentikasi)
 * - Create, update, delete: memerlukan permission 'product.manage'
 * - Export: memerlukan permission 'user.read'
 *
 * @security
 * - Endpoint publik: /products, /products/:id
 * - Endpoint terproteksi: create, update, delete, export
 * - Upload gambar menggunakan middleware uploadProductImages
 *
 * @usage
 * const productRouter = makeProductRouter(productService, slugService, sortOrderService, exportService, authMiddleware, permissionMiddleware);
 * app.use('/api/products', productRouter);
 */

import { Router } from "express";
import { ProductService } from "../services/product.service";
import { SlugService } from "../services/slug.service";
import { SortOrderService } from "../services/sort-order.service";
import { ExportService } from "../services/reporting/export.service";
import { ProductController } from "../controllers/product.controller";
import { AuthMiddleware } from "../middleware/auth.middleware";
import { RequirePermissionMiddleware } from "../middleware/require-permission.middleware";
import { uploadProductImages } from "../utils/upload";

export function makeProductRouter(
    productService: ProductService,
    slugService: SlugService,
    sortOrderService: SortOrderService,
    exportService: ExportService,
    authMiddleware: AuthMiddleware,
    permissionMiddleware: RequirePermissionMiddleware
): Router {
    const router = Router();
    const controller = new ProductController(
        productService,
        slugService,
        sortOrderService,
        exportService
    );

    // Public endpoints (tanpa autentikasi)
    router.get("/", controller.getProducts);
    router.get("/:id", controller.getProduct);

    // Protected endpoints
    router.use(authMiddleware.authenticate());

    router.post(
        "/",
        permissionMiddleware.require("product", "manage"),
        uploadProductImages,
        controller.createProduct
    );

    router.put(
        "/:id",
        permissionMiddleware.require("product", "manage"),
        uploadProductImages,
        controller.updateProduct
    );

    router.delete(
        "/:id",
        permissionMiddleware.require("product", "manage"),
        controller.deleteProduct
    );

    router.delete(
        "/:id/hard",
        permissionMiddleware.require("product", "manage"),
        controller.hardDeleteProduct
    );

    // Export endpoints
    router.get(
        "/export/excel",
        permissionMiddleware.require("user", "read"),
        controller.exportExcel
    );
    router.get(
        "/export/pdf",
        permissionMiddleware.require("user", "read"),
        controller.exportPdf
    );

    return router;
}
