/**
 * @file CategoryService – Manajemen kategori produk Enerkomp Persada Raya
 * @description
 * Layanan terpusat untuk operasi kategori:
 * - CRUD kategori (termasuk soft/hard delete dan restore)
 * - Integrasi audit log untuk semua operasi
 *
 * @security
 * - Kategori dengan produk aktif tidak bisa dihapus
 * - Validasi duplikat slug sebelum create/update
 * - Semua operasi tercatat di audit log
 *
 * @usage
 * const categoryService = new CategoryService(prisma, auditService, slugService);
 *
 * const category = await categoryService.create({
 *   name: 'Elektronik',
 *   createdBy: 'usr_123'
 * });
 *
 * @dependencies
 * - `@prisma/client`
 * - `AuditService`, `SlugService`
 */

import { PrismaClient } from "@prisma/client";
import { AuditService } from "./audit.service";
import { SlugService } from "./slug.service";

export interface CreateCategoryInput {
    slug: string;
    name: string;
    description?: string | null;
    isActive?: boolean;
    createdBy: string;
    ipAddress?: string;
    userAgent?: string;
}

export interface UpdateCategoryInput {
    id: string;
    slug: string;
    name: string;
    description?: string | null;
    isActive: boolean;
    updatedBy: string;
    ipAddress?: string;
    userAgent?: string;
}

export interface DeleteCategoryInput {
    id: string;
    deletedBy: string;
    ipAddress?: string;
    userAgent?: string;
}

export class CategoryService {
    constructor(
        private prisma: PrismaClient,
        private auditService: AuditService,
        private slugService: SlugService
    ) {}

    /**
     * Ambil daftar kategori dengan pagination dan pencarian
     * @param options - Filter dan pagination options
     * @returns Data kategori dan metadata pagination
     */
    async list(
        options: {
            deleted?: boolean;
            page?: number;
            limit?: number;
            search?: string;
        } = {}
    ) {
        const { deleted = false, page = 1, limit = 10, search } = options;
        const skip = (page - 1) * limit;

        const where: any = {
            deletedAt: deleted ? { not: null } : null,
        };

        if (search) {
            where.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { slug: { contains: search, mode: "insensitive" } },
            ];
        }

        const [categories, total] = await Promise.all([
            this.prisma.category.findMany({
                where,
                skip,
                take: limit,
                orderBy: { name: "asc" },
            }),
            this.prisma.category.count({ where }),
        ]);

        return {
            data: categories,
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
     * Ambil kategori berdasarkan ID
     * @param id - ID kategori
     * @returns Kategori
     */
    async findById(id: string) {
        return this.prisma.category.findUnique({
            where: { id, deletedAt: null },
        });
    }

    /**
     * Buat kategori baru atau restore jika sudah ada (soft-deleted)
     * @param input - Data kategori
     * @returns Kategori yang dibuat atau direstore
     */
    async create(input: CreateCategoryInput) {
        const {
            slug,
            name,
            description = null,
            isActive = true,
            createdBy,
            ipAddress,
            userAgent,
        } = input;

        const existing = await this.prisma.category.findFirst({
            where: { slug },
        });

        if (existing) {
            if (existing.deletedAt === null) {
                throw new Error(
                    `Category with slug "${slug}" already exists and is active.`
                );
            }

            // Restore category
            const updated = await this.prisma.category.update({
                where: { id: existing.id },
                data: {
                    name,
                    description,
                    isActive,
                    deletedAt: null,
                    updatedAt: new Date(),
                },
            });

            await this.auditService.log({
                userId: createdBy,
                action: "RESTORE_CATEGORY",
                tableName: "Category",
                recordId: existing.id,
                oldValues: { deletedAt: existing.deletedAt },
                newValues: { name, description, isActive, deletedAt: null },
                details: `Category "${slug}" restored and updated`,
                ipAddress,
                userAgent,
            });

            return updated;
        }

        // Create new category
        const category = await this.prisma.category.create({
            data: {
                slug,
                name,
                description,
                isActive,
            },
        });

        await this.auditService.log({
            userId: createdBy,
            action: "CREATE_CATEGORY",
            tableName: "Category",
            recordId: category.id,
            newValues: { slug, name, description, isActive },
            details: `Category "${slug}" created`,
            ipAddress,
            userAgent,
        });

        return category;
    }

    /**
     * Update kategori yang sudah ada
     * @param input - Data update
     * @returns Kategori yang diupdate
     */
    async update(input: UpdateCategoryInput) {
        const {
            id,
            slug,
            name,
            description,
            isActive,
            updatedBy,
            ipAddress,
            userAgent,
        } = input;

        const existing = await this.prisma.category.findUnique({
            where: { id, deletedAt: null },
        });

        if (!existing) {
            throw new Error("Category not found");
        }

        // Cek duplikat slug
        if (slug !== existing.slug) {
            const duplicate = await this.prisma.category.findUnique({
                where: { slug },
            });
            if (duplicate) {
                throw new Error(
                    "Another category with this slug already exists"
                );
            }
        }

        const updatedCategory = await this.prisma.category.update({
            where: { id },
            data: {
                slug,
                name,
                description,
                isActive,
            },
        });

        await this.auditService.log({
            userId: updatedBy,
            action: "UPDATE_CATEGORY",
            tableName: "Category",
            recordId: id,
            oldValues: existing,
            newValues: { slug, name, description, isActive },
            details: `Category "${name}" updated`,
            ipAddress,
            userAgent,
        });

        return updatedCategory;
    }

    /**
     * Soft delete kategori
     * @param input - Data delete
     */
    async delete(input: DeleteCategoryInput) {
        const { id, deletedBy, ipAddress, userAgent } = input;

        const category = await this.prisma.category.findUnique({
            where: { id, deletedAt: null },
        });

        if (!category) {
            throw new Error("Category not found or already deleted.");
        }

        // Cek dependency produk aktif
        const productCount = await this.prisma.product.count({
            where: { categoryId: id, deletedAt: null },
        });

        if (productCount > 0) {
            throw new Error(
                "Cannot delete category that is assigned to active products."
            );
        }

        const result = await this.prisma.category.update({
            where: { id },
            data: { deletedAt: new Date() },
        });

        await this.auditService.log({
            userId: deletedBy,
            action: "DELETE_CATEGORY",
            tableName: "Category",
            recordId: id,
            oldValues: {
                name: category.name,
                description: category.description,
            },
            newValues: { deletedAt: result.deletedAt },
            details: `Category "${category.name}" soft-deleted`,
            ipAddress,
            userAgent,
        });

        return result;
    }

    /**
     * Hard delete kategori (permanen)
     * @param input - Data hard delete
     */
    async hardDelete(input: DeleteCategoryInput) {
        const { id, deletedBy, ipAddress, userAgent } = input;

        const category = await this.prisma.category.findUnique({
            where: { id },
        });
        if (!category) {
            throw new Error("Category not found.");
        }

        // Validasi untuk kategori aktif
        if (category.deletedAt === null) {
            const productCount = await this.prisma.product.count({
                where: { categoryId: id, deletedAt: null },
            });

            if (productCount > 0) {
                throw new Error(
                    "Cannot hard-delete category that is assigned to active products."
                );
            }
        }

        await this.prisma.category.delete({ where: { id } });

        await this.auditService.log({
            userId: deletedBy,
            action: "HARD_DELETE_CATEGORY",
            tableName: "Category",
            recordId: id,
            oldValues: category,
            details: `Category "${category.name}" permanently deleted`,
            ipAddress,
            userAgent,
        });

        return { message: "Category permanently deleted", id };
    }
}
