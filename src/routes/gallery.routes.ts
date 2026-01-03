/**
 * @file Gallery Routes – Definisi endpoint API untuk manajemen galeri gambar
 * @description
 * Routing Express untuk operasi galeri dengan proteksi role-based:
 * - List & detail: publik (tanpa autentikasi)
 * - Create, delete: memerlukan permission 'gallery.manage'
 *
 * @security
 * - Endpoint publik: /galleries, /galleries/:id
 * - Endpoint terproteksi: create, delete
 * - Upload gambar menggunakan middleware uploadGalleryImage
 *
 * @usage
 * const galleryRouter = makeGalleryRouter(galleryService, authMiddleware, permissionMiddleware);
 * app.use('/api/galleries', galleryRouter);
 */

import { Router } from "express";
import { GalleryService } from "../services/gallery.service";
import { GalleryController } from "../controllers/gallery.controller";
import { AuthMiddleware } from "../middleware/auth.middleware";
import { RequirePermissionMiddleware } from "../middleware/require-permission.middleware";
import { uploadGalleryImage } from "../utils/upload";

export function makeGalleryRouter(
    galleryService: GalleryService,
    authMiddleware: AuthMiddleware,
    permissionMiddleware: RequirePermissionMiddleware
): Router {
    const router = Router();
    const controller = new GalleryController(galleryService);

    // Public endpoints (tanpa autentikasi)
    router.get("/", controller.getGalleries);
    router.get("/:id", controller.getGallery);

    // Protected endpoints
    router.use(authMiddleware.authenticate());

    router.post(
        "/",
        uploadGalleryImage,
        permissionMiddleware.require("gallery", "manage"),
        controller.createGallery
    );

    router.delete(
        "/:id",
        permissionMiddleware.require("gallery", "manage"),
        controller.deleteGallery
    );

    router.delete(
        "/:id/hard",
        permissionMiddleware.require("gallery", "manage"),
        controller.hardDeleteGallery
    );

    return router;
}
