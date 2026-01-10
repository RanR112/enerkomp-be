/**
 * @file BlogController – Antarmuka HTTP untuk manajemen artikel blog
 * @description
 * Controller class-based untuk mengelola operasi blog:
 * - CRUD artikel blog (termasuk soft/hard delete dan restore)
 * - Manajemen gambar blog dan terjemahan multi-bahasa
 * - Increment view count untuk artikel publik
 *
 * @security
 * - Endpoint publik: /blogs, /blogs/:id (dengan increment view opsional)
 * - Endpoint admin: memerlukan autentikasi dan permission
 * - Validasi input ketat untuk terjemahan dan bahasa
 *
 * @usage
 * const blogController = new BlogController(blogService, slugService);
 * router.get('/blogs', blogController.getBlogs);
 *
 * @dependencies
 * - `BlogService`, `SlugService`
 * - Express Request/Response
 */

import { Request, Response } from "express";
import { Language } from "@prisma/client";
import { BlogService } from "../services/blog.service";
import { SlugService } from "../services/slug.service";
import { getClientIp, handleError } from "../utils/http-helper";

export interface BlogTranslation {
    language: Language;
    title: string;
    excerpt?: string | null;
    content: string;
    metaTitle?: string | null;
    metaDescription?: string | null;
    metaKeywords?: string | null;
    tags?: string[] | null;
}

export class BlogController {
    constructor(
        private blogService: BlogService,
        private slugService: SlugService
    ) {}

    /**
     * Endpoint: GET /blogs
     * Ambil daftar blog dengan pagination dan filter
     */
    getBlogs = async (req: Request, res: Response): Promise<void> => {
        try {
            const {
                deleted,
                page = "1",
                limit = "10",
                published,
                search,
            } = req.query;

            const result = await this.blogService.list({
                deleted: deleted === "true",
                page: parseInt(page as string, 10),
                limit: parseInt(limit as string, 10),
                published: published === "true",
                search: search ? String(search) : undefined,
            });

            res.status(200).json(result);
        } catch (error) {
            handleError(res, error, "Failed to fetch blogs");
        }
    };

    /**
     * Endpoint: GET /blogs/:id
     * Ambil detail blog berdasarkan ID
     */
    getBlog = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const incrementView = req.query.increment === "true";

            const blog = await this.blogService.findById(id, incrementView);

            if (!blog) {
                res.status(404).json({ error: "Blog not found" });
                return;
            }

            res.status(200).json(blog);
        } catch (error) {
            handleError(res, error, "Failed to fetch blog");
        }
    };

    /**
     * Endpoint: POST /blogs
     * Buat blog baru
     */
    createBlog = async (req: Request, res: Response): Promise<void> => {
        try {
            const {
                slug: providedSlug,
                isPublished: isPublishedRaw = "false",
                isFeatured: isFeaturedRaw = "false",
                translations: translationsString,
            } = req.body;

            // Konversi boolean
            const isPublished =
                isPublishedRaw === "true" || isPublishedRaw === "1";
            const isFeatured =
                isFeaturedRaw === "true" || isFeaturedRaw === "1";

            // Ambil URL gambar dari upload
            const imageUrl = req.file
                ? `/uploads/blogs/${req.file.filename}`
                : null;

            // Parse translations
            let translations: BlogTranslation[] = [];
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
                        if (!t.title || !t.content) {
                            res.status(400).json({
                                error: "Title and content are required in each translation",
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
            let slug = providedSlug;
            if (!slug) {
                const enTitle = translations.find(
                    (t) => t.language === "EN"
                )?.title;
                const idTitle = translations.find(
                    (t) => t.language === "ID"
                )?.title;
                const titleForSlug = enTitle || idTitle || "untitled-blog";
                slug = this.slugService.generate(titleForSlug);
            }

            const blog = await this.blogService.create({
                data: {
                    slug,
                    image: imageUrl,
                    isPublished,
                    isFeatured,
                },
                translations,
                authorId: req.user!.id,
                createdBy: req.user!.id,
                ipAddress: getClientIp(req),
                userAgent: req.get("User-Agent") || "",
            });

            res.status(201).json(blog);
        } catch (error) {
            handleError(res, error, "Failed to create blog", 400);
        }
    };

    /**
     * Endpoint: PUT /blogs/:id
     * Update blog yang sudah ada
     */
    updateBlog = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const {
                slug: providedSlug,
                image,
                isPublished,
                isFeatured,
                translations = [],
            } = req.body;

            // Parse translations
            let parsedTranslations: BlogTranslation[] = [];
            try {
                parsedTranslations =
                    typeof translations === "string"
                        ? JSON.parse(translations)
                        : translations;
            } catch {
                res.status(400).json({ error: "Invalid translations format" });
                return;
            }

            // Validasi translations
            for (const t of parsedTranslations) {
                if (!Object.values(Language).includes(t.language)) {
                    res.status(400).json({
                        error: "Invalid language in translation",
                    });
                    return;
                }
                if (!t.title || !t.content) {
                    res.status(400).json({
                        error: "Title and content are required in each translation",
                    });
                    return;
                }
            }

            // Parse boolean
            const parseBoolean = (value: any): boolean => {
                if (typeof value === "boolean") return value;
                if (typeof value === "string") {
                    return value.toLowerCase() === "true";
                }
                return false;
            };

            const parsedIsPublished = parseBoolean(isPublished);
            const parsedIsFeatured = parseBoolean(isFeatured);

            // Ambil URL gambar dari upload atau existing
            const imageUrl = req.file
                ? `/uploads/blogs/${req.file.filename}`
                : image;

            // Generate slug
            let slug = providedSlug;
            if (!slug) {
                const enTitle = parsedTranslations.find(
                    (t) => t.language === "EN"
                )?.title;
                const idTitle = parsedTranslations.find(
                    (t) => t.language === "ID"
                )?.title;
                const titleForSlug = enTitle || idTitle || "untitled-blog";
                slug = this.slugService.generate(titleForSlug);
            }

            const blog = await this.blogService.update({
                id,
                data: {
                    slug,
                    image: imageUrl,
                    isPublished: parsedIsPublished,
                    isFeatured: parsedIsFeatured,
                },
                translations: parsedTranslations,
                authorId: req.user!.id,
                updatedBy: req.user!.id,
                ipAddress: getClientIp(req),
                userAgent: req.get("User-Agent") || "",
            });

            res.status(200).json(blog);
        } catch (error) {
            handleError(res, error, "Failed to update blog", 400);
        }
    };

    /**
     * Endpoint: DELETE /blogs/:id
     * Soft delete blog
     */
    deleteBlog = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;

            await this.blogService.delete({
                id,
                deletedBy: req.user!.id,
                ipAddress: getClientIp(req),
                userAgent: req.get("User-Agent") || "",
            });

            res.status(200).json({ message: "Blog deleted successfully" });
        } catch (error) {
            handleError(res, error, "Failed to delete blog", 400);
        }
    };

    /**
     * Endpoint: DELETE /blogs/:id/hard
     * Hard delete blog (permanen)
     */
    hardDeleteBlog = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;

            await this.blogService.hardDelete({
                id,
                deletedBy: req.user!.id,
                ipAddress: getClientIp(req),
                userAgent: req.get("User-Agent") || "",
            });

            res.status(204).end();
        } catch (error) {
            handleError(res, error, "Failed to hard delete blog", 400);
        }
    };
}
