/**
 * @file Catalog Routes – Definisi endpoint API untuk manajemen katalog
 * @description
 * Routing Express untuk operasi katalog dengan proteksi role-based:
 * - List & detail: publik (tanpa autentikasi)
 * - Create, update, delete: memerlukan permission 'catalog.manage'
 *
 * @security
 * - Endpoint publik: /catalogs, /catalogs/:id
 * - Endpoint terproteksi: create, update, delete
 * - Upload file menggunakan middleware multer (diatur di controller)
 *
 * @usage
 * const catalogRouter = makeCatalogRouter(catalogService, authMiddleware, permissionMiddleware);
 * app.use('/api/catalogs', catalogRouter);
 */

import { Router } from "express";
import { CatalogService } from "../services/catalog.service";
import { CatalogController } from "../controllers/catalog.controller";
import { AuthMiddleware } from "../middleware/auth.middleware";
import { RequirePermissionMiddleware } from "../middleware/require-permission.middleware";

export function makeCatalogRouter(
    catalogService: CatalogService,
    authMiddleware: AuthMiddleware,
    permissionMiddleware: RequirePermissionMiddleware
): Router {
    const router = Router();
    const controller = new CatalogController(catalogService);

    // Public endpoints (tanpa autentikasi)
    router.get("/", controller.getCatalogs);
    router.get("/:id", controller.getCatalog);

    // Protected endpoints
    router.use(authMiddleware.authenticate());

    router.post(
        "/",
        permissionMiddleware.require("catalog", "manage"),
        controller.createCatalog
    );

    router.put(
        "/:id",
        permissionMiddleware.require("catalog", "manage"),
        controller.updateCatalog
    );

    router.delete(
        "/:id",
        permissionMiddleware.require("catalog", "manage"),
        controller.deleteCatalog
    );

    return router;
}
