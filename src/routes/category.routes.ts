/**
 * @file Category Routes – Definisi endpoint API untuk manajemen kategori
 * @description
 * Routing Express untuk operasi kategori dengan proteksi role-based:
 * - List & detail: publik (tanpa autentikasi)
 * - Create, update, delete: memerlukan permission 'category.manage'
 *
 * @security
 * - Endpoint publik: /categories, /categories/:id
 * - Endpoint terproteksi: create, update, delete
 * - Permission checking dilakukan sebelum controller dijalankan
 *
 * @usage
 * const categoryRouter = makeCategoryRouter(categoryService, slugService, authMiddleware, permissionMiddleware);
 * app.use('/api/categories', categoryRouter);
 */

import { Router } from "express";
import { CategoryService } from "../services/category.service";
import { SlugService } from "../services/slug.service";
import { CategoryController } from "../controllers/category.controller";
import { AuthMiddleware } from "../middleware/auth.middleware";
import { RequirePermissionMiddleware } from "../middleware/require-permission.middleware";

export function makeCategoryRouter(
    categoryService: CategoryService,
    slugService: SlugService,
    authMiddleware: AuthMiddleware,
    permissionMiddleware: RequirePermissionMiddleware
): Router {
    const router = Router();
    const controller = new CategoryController(categoryService, slugService);

    // Public endpoints (tanpa autentikasi)
    router.get("/", controller.getCategories);
    router.get("/:id", controller.getCategory);

    // Protected endpoints
    router.use(authMiddleware.authenticate());

    router.post(
        "/",
        permissionMiddleware.require("category", "manage"),
        controller.createCategory
    );

    router.put(
        "/:id",
        permissionMiddleware.require("category", "manage"),
        controller.updateCategory
    );

    router.delete(
        "/:id",
        permissionMiddleware.require("category", "manage"),
        controller.deleteCategory
    );

    router.delete(
        "/:id/hard",
        permissionMiddleware.require("category", "manage"),
        controller.hardDeleteCategory
    );

    return router;
}
