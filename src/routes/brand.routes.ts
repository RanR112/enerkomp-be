/**
 * @file Brand Routes – Definisi endpoint API untuk manajemen brand
 * @description
 * Routing Express untuk operasi brand dengan proteksi role-based:
 * - List & detail: publik (tanpa autentikasi)
 * - Create, update, delete: memerlukan permission 'brand.manage'
 * - Export: memerlukan permission 'user.read'
 *
 * @security
 * - Endpoint publik: /brands, /brands/:id
 * - Endpoint terproteksi: create, update, delete, export
 * - Upload logo menggunakan middleware uploadBrandLogo
 *
 * @usage
 * const brandRouter = makeBrandRouter(brandService, slugService, sortOrderService, exportService, authMiddleware, permissionMiddleware);
 * app.use('/api/brands', brandRouter);
 */

import { Router } from "express";
import { BrandService } from "../services/brand.service";
import { SlugService } from "../services/slug.service";
import { SortOrderService } from "../services/sort-order.service";
import { ExportService } from "../services/reporting/export.service";
import { BrandController } from "../controllers/brand.controller";
import { AuthMiddleware } from "../middleware/auth.middleware";
import { RequirePermissionMiddleware } from "../middleware/require-permission.middleware";
import { uploadBrandLogo } from "../utils/upload";

export function makeBrandRouter(
    brandService: BrandService,
    slugService: SlugService,
    sortOrderService: SortOrderService,
    exportService: ExportService,
    authMiddleware: AuthMiddleware,
    permissionMiddleware: RequirePermissionMiddleware
): Router {
    const router = Router();
    const controller = new BrandController(
        brandService,
        slugService,
        sortOrderService,
        exportService
    );

    // Public endpoints (tanpa autentikasi)
    router.get("/", controller.getBrands);
    router.get("/:id", controller.getBrand);

    // Protected endpoints
    router.use(authMiddleware.authenticate());

    // Create
    router.post(
        "/",
        permissionMiddleware.require("brand", "manage"),
        uploadBrandLogo,
        controller.createBrand
    );

    // Update
    router.put(
        "/:id",
        permissionMiddleware.require("brand", "manage"),
        uploadBrandLogo,
        controller.updateBrand
    );

    // Delete
    router.delete(
        "/:id",
        permissionMiddleware.require("brand", "manage"),
        controller.deleteBrand
    );
    router.delete(
        "/:id/hard",
        permissionMiddleware.require("brand", "manage"),
        controller.hardDeleteBrand
    );

    // Export
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
