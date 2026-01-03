/**
 * @file Blog Routes – Definisi endpoint API untuk manajemen artikel blog
 * @description
 * Routing Express untuk operasi blog dengan proteksi role-based:
 * - List & detail: publik (tanpa autentikasi)
 * - Create, update, delete: memerlukan permission 'blog.manage'
 *
 * @security
 * - Endpoint publik: /blogs, /blogs/:id (dengan increment view opsional)
 * - Endpoint terproteksi: create, update, delete
 * - Upload gambar menggunakan middleware uploadBlogImage
 *
 * @usage
 * const blogRouter = makeBlogRouter(blogService, slugService, authMiddleware, permissionMiddleware);
 * app.use('/api/blogs', blogRouter);
 */

import { Router } from "express";
import { BlogService } from "../services/blog.service";
import { SlugService } from "../services/slug.service";
import { BlogController } from "../controllers/blog.controller";
import { AuthMiddleware } from "../middleware/auth.middleware";
import { RequirePermissionMiddleware } from "../middleware/require-permission.middleware";
import { uploadBlogImage } from "../utils/upload";

export function makeBlogRouter(
    blogService: BlogService,
    slugService: SlugService,
    authMiddleware: AuthMiddleware,
    permissionMiddleware: RequirePermissionMiddleware
): Router {
    const router = Router();
    const controller = new BlogController(blogService, slugService);

    // Public endpoints (tanpa autentikasi)
    router.get("/", controller.getBlogs);
    router.get("/:id", controller.getBlog);

    // Protected endpoints
    router.use(authMiddleware.authenticate());

    router.post(
        "/",
        permissionMiddleware.require("blog", "manage"),
        uploadBlogImage,
        controller.createBlog
    );

    router.put(
        "/:id",
        permissionMiddleware.require("blog", "manage"),
        uploadBlogImage,
        controller.updateBlog
    );

    router.delete(
        "/:id",
        permissionMiddleware.require("blog", "manage"),
        controller.deleteBlog
    );

    router.delete(
        "/:id/hard",
        permissionMiddleware.require("blog", "manage"),
        controller.hardDeleteBlog
    );

    return router;
}
