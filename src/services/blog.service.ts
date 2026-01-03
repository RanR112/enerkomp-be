/**
 * @file BlogService – Manajemen artikel blog Enerkomp Persada Raya
 * @description
 * Layanan terpusat untuk operasi blog:
 * - CRUD artikel blog (termasuk soft/hard delete dan restore)
 * - Manajemen gambar blog dan terjemahan multi-bahasa
 * - Integrasi audit log untuk semua operasi
 *
 * @security
 * - Validasi author sebelum create/update
 * - Validasi bahasa dan konten terjemahan
 * - Hapus file gambar lama saat update/hard delete
 * - Semua operasi kritis menggunakan transaksi database
 *
 * @usage
 * const blogService = new BlogService(prisma, auditService, fileService, slugService);
 *
 * const blog = await blogService.create({
 *   isPublished: true,
 *   authorId: 'usr_123',
 *   createdBy: 'usr_123'
 * });
 *
 * @dependencies
 * - `@prisma/client`
 * - `AuditService`, `FileService`, `SlugService`
 */

import { PrismaClient, Language, Prisma } from "@prisma/client";
import { AuditService } from "./audit.service";
import { FileService } from "./file.service";
import { SlugService } from "./slug.service";

export interface BlogInput {
    slug?: string;
    image?: string | null;
    isPublished: boolean;
    isFeatured: boolean;
}

export interface TranslationInput {
    language: Language;
    title: string;
    excerpt?: string | null;
    content: string;
    metaTitle?: string | null;
    metaDescription?: string | null;
    metaKeywords?: string | null;
    tags?: string[] | null;
}

export interface CreateBlogInput {
    data: BlogInput;
    translations: TranslationInput[];
    authorId: string;
    createdBy: string;
    ipAddress?: string;
    userAgent?: string;
}

export interface UpdateBlogInput {
    id: string;
    data: BlogInput;
    translations: TranslationInput[];
    authorId: string;
    updatedBy: string;
    ipAddress?: string;
    userAgent?: string;
}

export interface DeleteBlogInput {
    id: string;
    deletedBy: string;
    ipAddress?: string;
    userAgent?: string;
}

export class BlogService {
    constructor(
        private prisma: PrismaClient,
        private auditService: AuditService,
        private fileService: FileService,
        private slugService: SlugService
    ) {}

    /**
     * Ambil daftar blog dengan pagination dan filter
     * @param options - Filter dan pagination options
     * @returns Data blog dan metadata pagination
     */
    async list(
        options: {
            deleted?: boolean;
            page?: number;
            limit?: number;
            published?: boolean;
            search?: string;
        } = {}
    ) {
        const {
            deleted = false,
            page = 1,
            limit = 10,
            published = false,
            search,
        } = options;
        const skip = (page - 1) * limit;

        const where: any = {
            deletedAt: deleted ? { not: null } : null,
        };

        if (published) {
            where.isPublished = published;
            where.publishedAt = { lte: new Date() };
        }

        if (search) {
            where.OR = [
                {
                    translations: {
                        some: {
                            title: { contains: search, mode: "insensitive" },
                        },
                    },
                },
                {
                    translations: {
                        some: {
                            excerpt: { contains: search, mode: "insensitive" },
                        },
                    },
                },
            ];
        }

        const [blogs, total] = await Promise.all([
            this.prisma.blog.findMany({
                where,
                skip,
                take: limit,
                orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
                include: {
                    author: { select: { id: true, name: true, email: true } },
                    translations: true,
                },
            }),
            this.prisma.blog.count({ where }),
        ]);

        return {
            data: blogs,
            meta: {
                total,
                page,
                lastPage: Math.ceil(total / limit),
                perPage: limit,
                published,
                search: search || null,
            },
        };
    }

    /**
     * Ambil blog berdasarkan ID
     * @param id - ID blog
     * @param incrementView - Apakah perlu tambah view count
     * @returns Blog dengan informasi lengkap
     */
    async findById(id: string, incrementView: boolean = false) {
        const blog = await this.prisma.blog.findUnique({
            where: { id, deletedAt: null },
            include: {
                author: { select: { id: true, name: true, email: true } },
                translations: true,
            },
        });

        if (blog && incrementView) {
            await this.prisma.blog.update({
                where: { id },
                data: { viewCount: { increment: 1 } },
            });
        }

        return blog;
    }

    /**
     * Buat blog baru atau restore jika sudah ada (soft-deleted)
     * @param input - Data blog dan terjemahan
     * @returns Blog yang dibuat atau direstore
     */
    async create(input: CreateBlogInput) {
        const {
            data: { slug, image, isPublished = false, isFeatured = false },
            translations,
            authorId,
            createdBy,
            ipAddress,
            userAgent,
        } = input;

        // Validasi author
        const author = await this.prisma.user.findUnique({
            where: { id: authorId },
        });
        if (!author) throw new Error("Author not found");

        // Validasi translations
        if (translations.length === 0) {
            throw new Error("At least one translation is required");
        }
        for (const t of translations) {
            if (!Object.values(Language).includes(t.language)) {
                throw new Error(`Invalid language: ${t.language}`);
            }
            if (!t.title || !t.content) {
                throw new Error(
                    "Title and content are required in each translation"
                );
            }
        }

        // Generate slug
        let finalSlug = slug;
        if (!finalSlug) {
            const enTitle = translations.find(
                (t) => t.language === "EN"
            )?.title;
            const idTitle = translations.find(
                (t) => t.language === "ID"
            )?.title;
            const titleForSlug = enTitle || idTitle || "untitled-blog";
            finalSlug = this.slugService.generate(titleForSlug);
        }

        // Cek duplikat
        const existing = await this.prisma.blog.findFirst({
            where: { slug: finalSlug },
        });

        if (existing && existing.deletedAt === null) {
            throw new Error(
                `Blog with slug "${finalSlug}" already exists and is active.`
            );
        }

        if (existing) {
            // Restore blog
            return this.prisma.$transaction(async (tx) => {
                // Hapus file gambar lama
                if (
                    existing.image &&
                    existing.image.startsWith("/uploads/blogs/")
                ) {
                    this.fileService.deleteFile(existing.image);
                }

                const blog = await tx.blog.update({
                    where: { id: existing.id },
                    data: {
                        image,
                        isPublished,
                        isFeatured,
                        authorId,
                        deletedAt: null,
                        updatedAt: new Date(),
                        publishedAt:
                            isPublished && !existing.isPublished
                                ? new Date()
                                : existing.publishedAt,
                    },
                });

                // Update terjemahan
                await tx.blogTranslation.deleteMany({
                    where: { blogId: existing.id },
                });
                if (translations.length > 0) {
                    await tx.blogTranslation.createMany({
                        data: translations.map((t) => ({
                            ...t,
                            blogId: existing.id,
                            tags: t.tags ?? Prisma.JsonNull,
                        })),
                    });
                }

                await this.auditService.log({
                    userId: createdBy,
                    action: "RESTORE_BLOG",
                    tableName: "Blog",
                    recordId: existing.id,
                    oldValues: { deletedAt: existing.deletedAt },
                    newValues: {
                        slug: finalSlug,
                        image,
                        isPublished,
                        translations,
                    },
                    details: `Blog "${finalSlug}" restored and updated`,
                    ipAddress,
                    userAgent,
                });

                return blog;
            });
        }

        // Create blog baru
        return this.prisma.$transaction(async (tx) => {
            const newBlog = await tx.blog.create({
                data: {
                    slug: finalSlug,
                    image,
                    isPublished,
                    isFeatured,
                    authorId,
                    publishedAt: isPublished ? new Date() : null,
                },
            });

            if (translations.length > 0) {
                await tx.blogTranslation.createMany({
                    data: translations.map((t) => ({
                        ...t,
                        blogId: newBlog.id,
                        tags: t.tags ?? Prisma.JsonNull,
                    })),
                });
            }

            await this.auditService.log({
                userId: createdBy,
                action: "CREATE_BLOG",
                tableName: "Blog",
                recordId: newBlog.id,
                newValues: {
                    slug: finalSlug,
                    image,
                    isPublished,
                    translations,
                },
                details: `Blog "${finalSlug}" created`,
                ipAddress,
                userAgent,
            });

            return newBlog;
        });
    }

    /**
     * Update blog yang sudah ada
     * @param input - Data update dan terjemahan
     * @returns Blog yang diupdate
     */
    async update(input: UpdateBlogInput) {
        const {
            id,
            data: { slug, image, isPublished, isFeatured },
            translations,
            authorId,
            updatedBy,
            ipAddress,
            userAgent,
        } = input;

        const existing = await this.prisma.blog.findUnique({
            where: { id, deletedAt: null },
            include: { translations: true },
        });

        if (!existing) {
            throw new Error("Blog not found");
        }

        const author = await this.prisma.user.findUnique({
            where: { id: authorId },
        });
        if (!author) {
            throw new Error("Author not found");
        }

        // Cek duplikat slug
        if (slug !== existing.slug) {
            const duplicate = await this.prisma.blog.findUnique({
                where: { slug },
            });
            if (duplicate) {
                throw new Error("Another blog with this slug already exists");
            }
        }

        // Update blog dalam transaksi
        const updatedBlog = await this.prisma.$transaction(async (tx) => {
            // Hapus gambar lama jika diganti
            if (
                existing.image &&
                existing.image !== image &&
                existing.image.startsWith("/uploads/blogs/")
            ) {
                this.fileService.deleteFile(existing.image);
            }

            // Update blog
            const blog = await tx.blog.update({
                where: { id },
                data: {
                    slug,
                    image,
                    authorId,
                    isPublished,
                    isFeatured,
                    publishedAt:
                        isPublished && !existing.isPublished
                            ? new Date()
                            : existing.publishedAt,
                },
            });

            // Ganti terjemahan
            await tx.blogTranslation.deleteMany({ where: { blogId: id } });
            if (translations.length > 0) {
                await tx.blogTranslation.createMany({
                    data: translations.map((t) => ({
                        ...t,
                        blogId: id,
                        tags: t.tags ?? Prisma.JsonNull,
                    })),
                });
            }

            return blog;
        });

        // Audit log
        const title =
            translations.find((t) => t.language === "EN")?.title ||
            translations[0].title;
        await this.auditService.log({
            userId: updatedBy,
            action: "UPDATE_BLOG",
            tableName: "Blog",
            recordId: id,
            oldValues: existing,
            newValues: { ...input.data, translations, authorId },
            details: `Blog "${title}" updated`,
            ipAddress,
            userAgent,
        });

        return updatedBlog;
    }

    /**
     * Soft delete blog
     * @param input - Data delete
     */
    async delete(input: DeleteBlogInput) {
        const { id, deletedBy, ipAddress, userAgent } = input;

        const blog = await this.prisma.blog.findUnique({
            where: { id, deletedAt: null },
            include: { translations: true },
        });

        if (!blog) {
            throw new Error("Blog not found or already deleted.");
        }

        const result = await this.prisma.blog.update({
            where: { id },
            data: { deletedAt: new Date() },
        });

        await this.auditService.log({
            userId: deletedBy,
            action: "DELETE_BLOG",
            tableName: "Blog",
            recordId: id,
            oldValues: { slug: blog.slug, isPublished: blog.isPublished },
            newValues: { deletedAt: result.deletedAt },
            details: `Blog "${blog.slug}" soft-deleted`,
            ipAddress,
            userAgent,
        });

        return result;
    }

    /**
     * Hard delete blog (permanen)
     * @param input - Data hard delete
     */
    async hardDelete(input: DeleteBlogInput) {
        const { id, deletedBy, ipAddress, userAgent } = input;

        const blog = await this.prisma.blog.findUnique({ where: { id } });
        if (!blog) {
            throw new Error("Blog not found.");
        }

        // Hapus file gambar
        if (blog.image && blog.image.startsWith("/uploads/blogs/")) {
            this.fileService.deleteFile(blog.image);
        }

        await this.prisma.$transaction([
            this.prisma.blogTranslation.deleteMany({ where: { blogId: id } }),
            this.prisma.blog.delete({ where: { id } }),
        ]);

        await this.auditService.log({
            userId: deletedBy,
            action: "HARD_DELETE_BLOG",
            tableName: "Blog",
            recordId: id,
            oldValues: blog,
            details: `Blog "${blog.slug}" permanently deleted`,
            ipAddress,
            userAgent,
        });

        return { message: "Blog permanently deleted", id };
    }
}
