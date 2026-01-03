/**
 * @file ProductService – Manajemen produk Enerkomp Persada Raya
 * @description
 * Layanan terpusat untuk operasi produk:
 * - CRUD produk (termasuk soft/hard delete dan restore)
 * - Manajemen gambar produk (multi-upload)
 * - Manajemen sortOrder dan terjemahan produk
 * - Integrasi audit log untuk semua operasi
 *
 * @security
 * - Validasi brand (hanya tipe PRODUCT yang bisa assign ke produk)
 * - Validasi duplikat slug/SKU sebelum create/update
 * - Hapus file gambar lama saat update/hard delete
 * - Semua operasi kritis menggunakan transaksi database
 *
 * @usage
 * const productService = new ProductService(prisma, auditService, fileService, sortOrderService);
 *
 * const product = await productService.create({
 *   name: 'Inverter Solar',
 *   brandId: 'brand_123',
 *   categoryId: 'cat_456',
 *   createdBy: 'usr_123'
 * });
 *
 * @dependencies
 * - `@prisma/client`
 * - `AuditService`, `FileService`, `SortOrderService`
 */

import { PrismaClient, Language, Prisma } from "@prisma/client";
import { AuditService } from "./audit.service";
import { FileService } from "./file.service";
import { SortOrderService } from "./sort-order.service";

export interface ProductInput {
    slug: string;
    sku?: string | null;
    name: string;
    categoryId: string;
    brandId: string;
    images?: string[] | null;
    isActive: boolean;
    isFeatured: boolean;
    sortOrder?: number;
}

export interface TranslationInput {
    language: Language;
    shortDescription?: string | null;
    longDescription?: string | null;
    specifications?: Record<string, any> | null;
    features?: string[] | null;
    metaTitle?: string | null;
    metaDescription?: string | null;
    metaKeywords?: string | null;
}

export interface CreateProductInput {
    data: ProductInput;
    translations: TranslationInput[];
    createdBy: string;
    ipAddress?: string;
    userAgent?: string;
}

export interface UpdateProductInput {
    id: string;
    data: {
        slug: string;
        sku?: string | null;
        name: string;
        categoryId: string;
        brandId: string;
        images?: string[] | null;
        isActive?: boolean;
        isFeatured?: boolean;
        sortOrder?: number;
    };
    translations: TranslationInput[];
    updatedBy: string;
    ipAddress?: string;
    userAgent?: string;
}

export interface DeleteProductInput {
    id: string;
    deletedBy: string;
    ipAddress?: string;
    userAgent?: string;
}

export class ProductService {
    constructor(
        private prisma: PrismaClient,
        private auditService: AuditService,
        private fileService: FileService,
        private sortOrderService: SortOrderService
    ) {}

    /**
     * Ambil daftar produk dengan pagination dan filter
     * @param options - Filter dan pagination options
     * @returns Data produk dan metadata pagination
     */
    async list(
        options: {
            brands?: string;
            categories?: string;
            deleted?: boolean;
            active?: boolean;
            page?: number;
            limit?: number;
            search?: string;
        } = {}
    ) {
        const {
            brands,
            categories,
            deleted = false,
            active = true,
            page = 1,
            limit = 10,
            search,
        } = options;
        const skip = (page - 1) * limit;

        const where: any = {
            deletedAt: deleted ? { not: null } : null,
        };

        if (active) {
            where.isActive = active;
        }

        if (brands) {
            where.brandId = brands;
        }

        if (categories) {
            where.categoryId = categories;
        }

        if (search) {
            where.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { slug: { contains: search, mode: "insensitive" } },
            ];
        }

        const [products, total] = await Promise.all([
            this.prisma.product.findMany({
                where,
                skip,
                take: limit,
                orderBy: { sortOrder: "asc" },
                include: {
                    category: true,
                    brand: true,
                    translations: true,
                },
            }),
            this.prisma.product.count({ where }),
        ]);

        return {
            data: products,
            meta: {
                total,
                page,
                lastPage: Math.ceil(total / limit),
                perPage: limit,
                search: search || null,
            },
        };
    }

    /**
     * Ambil produk berdasarkan ID
     * @param id - ID produk
     * @returns Produk dengan informasi lengkap
     */
    async findById(id: string) {
        return this.prisma.product.findUnique({
            where: { id, deletedAt: null },
            include: {
                category: true,
                brand: true,
                translations: true,
            },
        });
    }

    /**
     * Buat produk baru atau restore jika sudah ada (soft-deleted)
     * @param input - Data produk dan terjemahan
     * @returns Produk yang dibuat atau direstore
     */
    async create(input: CreateProductInput) {
        const {
            data: {
                slug,
                sku = null,
                name,
                categoryId,
                brandId,
                images = [],
                isActive = true,
                isFeatured = false,
                sortOrder,
            },
            translations,
            createdBy,
            ipAddress,
            userAgent,
        } = input;

        // Validasi brand dan category
        const brand = await this.prisma.brand.findUnique({
            where: { id: brandId },
        });
        if (!brand) throw new Error("Brand not found");
        if (brand.type !== "PRODUCT") {
            throw new Error("Selected brand is not a product brand");
        }

        const category = await this.prisma.category.findUnique({
            where: { id: categoryId },
        });
        if (!category) throw new Error("Category not found");

        // Cek duplikat
        const existingBySlug = await this.prisma.product.findFirst({
            where: { slug },
        });
        const existingBySku = sku
            ? await this.prisma.product.findFirst({ where: { sku } })
            : null;

        const existing = existingBySlug || existingBySku;
        if (existing && existing.deletedAt === null) {
            throw new Error(
                `Product with ${existingBySlug ? "slug" : "sku"} "${
                    existingBySlug?.slug || existingBySku?.sku
                }" already exists and is active.`
            );
        }

        if (existing) {
            // Restore produk
            return this.prisma.$transaction(async (tx) => {
                // Hapus file gambar lama
                if (Array.isArray(existing.images)) {
                    existing.images.forEach((imgUrl) => {
                        if (
                            typeof imgUrl === "string" &&
                            imgUrl.startsWith("/uploads/products/")
                        ) {
                            this.fileService.deleteFile(imgUrl);
                        }
                    });
                }

                // Handle sortOrder
                let finalSortOrder = existing.sortOrder;
                if (sortOrder != null && sortOrder !== existing.sortOrder) {
                    const swapped = await this.sortOrderService.swap({
                        model: "product",
                        id1: existing.id,
                        newSortOrder: sortOrder,
                        oldSortOrder: existing.sortOrder,
                        baseWhere: { deletedAt: null },
                    });
                    if (!swapped) {
                        finalSortOrder = sortOrder;
                    }
                }

                const updatedProduct = await tx.product.update({
                    where: { id: existing.id },
                    data: {
                        name,
                        categoryId,
                        brandId,
                        images: images as any,
                        isActive,
                        isFeatured,
                        sortOrder: finalSortOrder,
                        deletedAt: null,
                        updatedAt: new Date(),
                    },
                });

                // Update terjemahan
                await tx.productTranslation.deleteMany({
                    where: { productId: existing.id },
                });
                if (translations.length > 0) {
                    await tx.productTranslation.createMany({
                        data: translations.map((t) => ({
                            ...t,
                            productId: existing.id,
                            specifications: this.fixJson(t.specifications),
                            features: this.fixJson(t.features),
                        })),
                    });
                }

                await this.auditService.log({
                    userId: createdBy,
                    action: "RESTORE_PRODUCT",
                    tableName: "Product",
                    recordId: existing.id,
                    oldValues: {
                        deletedAt: existing.deletedAt,
                        sortOrder: existing.sortOrder,
                    },
                    newValues: {
                        ...input.data,
                        sortOrder: finalSortOrder,
                        translations,
                    },
                    details: `Product "${slug}" restored and updated`,
                    ipAddress,
                    userAgent,
                });

                return updatedProduct;
            });
        }

        // Create produk baru
        return this.prisma.$transaction(async (tx) => {
            const finalSortOrder = await this.sortOrderService.calculate({
                model: "product",
                inputSortOrder: sortOrder,
                baseWhere: { deletedAt: null },
            });

            const newProduct = await tx.product.create({
                data: {
                    slug,
                    sku,
                    name,
                    categoryId,
                    brandId,
                    images: images as any,
                    isActive,
                    isFeatured,
                    sortOrder: finalSortOrder,
                },
            });

            // Simpan terjemahan
            if (translations.length > 0) {
                await tx.productTranslation.createMany({
                    data: translations.map((t) => ({
                        ...t,
                        productId: newProduct.id,
                        specifications: this.fixJson(t.specifications),
                        features: this.fixJson(t.features),
                    })),
                });
            }

            await this.auditService.log({
                userId: createdBy,
                action: "CREATE_PRODUCT",
                tableName: "Product",
                recordId: newProduct.id,
                newValues: {
                    ...input.data,
                    sortOrder: finalSortOrder,
                    translations,
                },
                details: `Product "${slug}" created`,
                ipAddress,
                userAgent,
            });

            return newProduct;
        });
    }

    /**
     * Update produk yang sudah ada
     * @param input - Data update dan terjemahan
     * @returns Produk yang diupdate
     */
    async update(input: UpdateProductInput) {
        const {
            id,
            data: {
                slug,
                sku,
                name,
                categoryId,
                brandId,
                images,
                isActive,
                isFeatured,
                sortOrder,
            },
            translations,
            updatedBy,
            ipAddress,
            userAgent,
        } = input;

        const existing = await this.prisma.product.findUnique({
            where: { id, deletedAt: null },
            include: { translations: true },
        });
        if (!existing) throw new Error("Product not found");

        // Validasi brand dan category
        const brand = await this.prisma.brand.findUnique({
            where: { id: brandId },
        });
        if (!brand || brand.type !== "PRODUCT") {
            throw new Error("Invalid brand");
        }

        const category = await this.prisma.category.findUnique({
            where: { id: categoryId },
        });
        if (!category) throw new Error("Invalid category");

        // Cek duplikat slug
        if (slug !== existing.slug) {
            const dup = await this.prisma.product.findUnique({
                where: { slug },
            });
            if (dup && dup.deletedAt === null && dup.id !== id) {
                throw new Error("Slug already used");
            }
        }

        // Cek duplikat SKU
        if (sku && sku !== existing.sku) {
            const dupSku = await this.prisma.product.findUnique({
                where: { sku },
            });
            if (dupSku && dupSku.deletedAt === null && dupSku.id !== id) {
                throw new Error("SKU already used");
            }
        }

        // Update produk dalam transaksi
        const updatedProduct = await this.prisma.$transaction(async (tx) => {
            let finalSortOrder = existing.sortOrder;

            // Handle sortOrder
            if (sortOrder != null && sortOrder !== existing.sortOrder) {
                const swapped = await this.sortOrderService.swap({
                    model: "product",
                    id1: id,
                    newSortOrder: sortOrder,
                    oldSortOrder: existing.sortOrder,
                    baseWhere: { deletedAt: null },
                });

                if (!swapped) {
                    finalSortOrder = sortOrder;
                }
            }

            // Hapus gambar lama jika diganti
            if (
                Array.isArray(existing.images) &&
                Array.isArray(images) &&
                JSON.stringify(existing.images) !== JSON.stringify(images)
            ) {
                existing.images.forEach((img) => {
                    if (
                        typeof img === "string" &&
                        img.startsWith("/uploads/products/")
                    ) {
                        this.fileService.deleteFile(img);
                    }
                });
            }

            // Update produk
            const updated = await tx.product.update({
                where: { id },
                data: {
                    slug,
                    sku: sku ?? null,
                    name,
                    categoryId,
                    brandId,
                    images: images as any,
                    isActive,
                    isFeatured,
                    sortOrder: finalSortOrder,
                },
            });

            // Ganti terjemahan
            await tx.productTranslation.deleteMany({
                where: { productId: id },
            });

            if (translations.length > 0) {
                await tx.productTranslation.createMany({
                    data: translations.map((t) => ({
                        ...t,
                        productId: id,
                        specifications: this.fixJson(t.specifications),
                        features: this.fixJson(t.features),
                    })),
                });
            }

            return updated;
        });

        // Audit log
        await this.auditService.log({
            userId: updatedBy,
            action: "UPDATE_PRODUCT",
            tableName: "Product",
            recordId: id,
            oldValues: existing,
            newValues: {
                ...input.data,
                sortOrder: updatedProduct.sortOrder,
                translations,
            },
            details: `Product "${name}" updated`,
            ipAddress,
            userAgent,
        });

        return updatedProduct;
    }

    /**
     * Soft delete produk
     * @param input - Data delete
     */
    async delete(input: DeleteProductInput) {
        const { id, deletedBy, ipAddress, userAgent } = input;

        const product = await this.prisma.product.findUnique({
            where: { id, deletedAt: null },
        });
        if (!product) throw new Error("Product not found or already deleted.");

        const deleted = await this.prisma.product.update({
            where: { id },
            data: { deletedAt: new Date() },
        });

        // Reorder setelah delete
        await this.sortOrderService.reorderAfterDelete({
            model: "product",
            deletedSortOrder: product.sortOrder || 0,
            baseWhere: { deletedAt: null },
        });

        await this.auditService.log({
            userId: deletedBy,
            action: "DELETE_PRODUCT",
            tableName: "Product",
            recordId: id,
            oldValues: { name: product.name, slug: product.slug },
            newValues: { deletedAt: deleted.deletedAt },
            details: `Product "${product.name}" soft-deleted`,
            ipAddress,
            userAgent,
        });

        return deleted;
    }

    /**
     * Hard delete produk (permanen)
     * @param input - Data hard delete
     */
    async hardDelete(input: DeleteProductInput) {
        const { id, deletedBy, ipAddress, userAgent } = input;

        const product = await this.prisma.product.findUnique({ where: { id } });
        if (!product) throw new Error("Product not found.");

        // Hapus file gambar
        if (Array.isArray(product.images)) {
            product.images.forEach((img) => {
                if (
                    typeof img === "string" &&
                    img.startsWith("/uploads/products/")
                ) {
                    this.fileService.deleteFile(img);
                }
            });
        }

        await this.prisma.$transaction([
            this.prisma.productTranslation.deleteMany({
                where: { productId: id },
            }),
            this.prisma.product.delete({ where: { id } }),
        ]);

        // Reorder setelah delete
        await this.sortOrderService.reorderAfterDelete({
            model: "product",
            deletedSortOrder: product.sortOrder || 0,
            baseWhere: { deletedAt: null },
        });

        await this.auditService.log({
            userId: deletedBy,
            action: "HARD_DELETE_PRODUCT",
            tableName: "Product",
            recordId: id,
            oldValues: product,
            details: `Product "${product.name}" permanently deleted`,
            ipAddress,
            userAgent,
        });

        return { message: "Product permanently deleted", id };
    }

    // Helper methods
    private fixJson(value: any): any {
        if (value == null || value === "") {
            return Prisma.DbNull;
        }

        if (typeof value === "string") {
            try {
                const parsed = JSON.parse(value);
                return parsed === null ? Prisma.DbNull : parsed;
            } catch {
                return Prisma.DbNull;
            }
        }

        return value;
    }
}
