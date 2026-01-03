/**
 * @file BrandService – Manajemen brand produk dan klien Enerkomp
 * @description
 * Layanan terpusat untuk operasi brand:
 * - CRUD brand (termasuk soft/hard delete dan restore)
 * - Manajemen sortOrder berbasis tipe (PRODUCT, CLIENT)
 * - Integrasi audit log untuk semua operasi
 *
 * @security
 * - Brand dengan produk tidak bisa dihapus (hanya PRODUCT type)
 * - Validasi duplikat slug sebelum create/update
 * - Hapus file logo lama saat update/hard delete
 *
 * @usage
 * const brandService = new BrandService(prisma, auditService, fileService, sortOrderService);
 *
 * const brand = await brandService.create({
 *   name: 'Enerkomp',
 *   type: 'PRODUCT',
 *   createdBy: 'usr_123'
 * });
 *
 * @dependencies
 * - `@prisma/client`
 * - `AuditService`, `FileService`, `SortOrderService`
 */

import { PrismaClient, BrandType } from "@prisma/client";
import { AuditService } from "./audit.service";
import { FileService } from "./file.service";
import { SortOrderService } from "./sort-order.service";

export interface CreateBrandInput {
    slug: string;
    name: string;
    logo?: string | null;
    type: BrandType;
    isActive: boolean;
    sortOrder?: number;
    createdBy: string;
    ipAddress?: string;
    userAgent?: string;
}

export interface UpdateBrandInput {
    id: string;
    slug: string;
    name: string;
    logo?: string | null;
    type: BrandType;
    isActive: boolean;
    sortOrder?: number;
    updatedBy: string;
    ipAddress?: string;
    userAgent?: string;
}

export interface DeleteBrandInput {
    id: string;
    deletedBy: string;
    ipAddress?: string;
    userAgent?: string;
}

export class BrandService {
    constructor(
        private prisma: PrismaClient,
        private auditService: AuditService,
        private fileService: FileService,
        private sortOrderService: SortOrderService
    ) {}

    /**
     * Ambil daftar brand dengan pagination, filter tipe, dan pencarian
     * @param options - Filter dan pagination options
     * @returns Data brand dan metadata pagination
     */
    async list(
        options: {
            deleted?: boolean;
            page?: number;
            limit?: number;
            type?: BrandType;
            search?: string;
        } = {}
    ) {
        const { deleted = false, page = 1, limit = 10, type, search } = options;
        const skip = (page - 1) * limit;

        const where: any = {
            deletedAt: deleted ? { not: null } : null,
        };

        if (type) {
            where.type = type;
        }

        if (search) {
            where.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { slug: { contains: search, mode: "insensitive" } },
            ];
        }

        const [brands, total] = await Promise.all([
            this.prisma.brand.findMany({
                where,
                skip,
                take: limit,
                orderBy: { sortOrder: "asc" },
            }),
            this.prisma.brand.count({ where }),
        ]);

        return {
            data: brands,
            meta: {
                total,
                page,
                lastPage: Math.ceil(total / limit),
                perPage: limit,
                type: type || null,
                search: search || null,
                deleted,
            },
        };
    }

    /**
     * Ambil brand berdasarkan ID
     * @param id - ID brand
     * @returns Brand
     */
    async findById(id: string) {
        return this.prisma.brand.findUnique({
            where: { id, deletedAt: null },
        });
    }

    /**
     * Buat brand baru atau restore jika sudah ada (soft-deleted)
     * @param input - Data brand
     * @returns Brand yang dibuat atau direstore
     */
    async create(input: CreateBrandInput) {
        const {
            slug,
            name,
            logo,
            type,
            isActive,
            sortOrder,
            createdBy,
            ipAddress,
            userAgent,
        } = input;

        const existing = await this.prisma.brand.findFirst({ where: { slug } });

        // Hitung sortOrder akhir
        const finalSortOrder = await this.sortOrderService.calculate({
            model: "brand",
            inputSortOrder: sortOrder,
            baseWhere: { deletedAt: null },
            scopeKey: "type",
            scopeValue: type,
        });

        // Resolve konflik sortOrder
        await this.sortOrderService.resolveConflictOnCreate({
            model: "brand",
            newSortOrder: finalSortOrder,
            baseWhere: { type, deletedAt: null },
        });

        if (existing) {
            if (existing.deletedAt === null) {
                throw new Error(
                    `Brand with slug "${slug}" already exists and is active`
                );
            }

            // Restore brand
            const updated = await this.prisma.brand.update({
                where: { id: existing.id },
                data: {
                    name,
                    type,
                    logo,
                    isActive,
                    sortOrder: finalSortOrder,
                    deletedAt: null,
                    updatedAt: new Date(),
                },
            });

            await this.auditService.log({
                userId: createdBy,
                action: "RESTORE_BRAND",
                tableName: "Brand",
                recordId: existing.id,
                oldValues: { deletedAt: existing.deletedAt },
                newValues: { deletedAt: null, name, type, logo, isActive },
                details: `Brand "${slug}" restored and updated`,
                ipAddress,
                userAgent,
            });

            return updated;
        }

        // Create new brand
        const brand = await this.prisma.brand.create({
            data: {
                slug,
                name,
                logo,
                type,
                isActive,
                sortOrder: finalSortOrder,
            },
        });

        await this.auditService.log({
            userId: createdBy,
            action: "CREATE_BRAND",
            tableName: "Brand",
            recordId: brand.id,
            newValues: brand,
            details: `Brand "${slug}" created`,
            ipAddress,
            userAgent,
        });

        return brand;
    }

    /**
     * Update brand yang sudah ada
     * @param input - Data update
     * @returns Brand yang diupdate
     */
    async update(input: UpdateBrandInput) {
        const {
            id,
            slug,
            name,
            logo,
            type,
            isActive,
            sortOrder,
            updatedBy,
            ipAddress,
            userAgent,
        } = input;

        const existing = await this.prisma.brand.findUnique({
            where: { id, deletedAt: null },
        });

        if (!existing) {
            throw new Error("Brand not found");
        }

        // Cek duplikat slug
        if (slug !== existing.slug) {
            const duplicate = await this.prisma.brand.findUnique({
                where: { slug },
            });
            if (duplicate) {
                throw new Error("Another brand with this slug already exists");
            }
        }

        let finalSortOrder = existing.sortOrder;

        // Handle perubahan sortOrder
        if (sortOrder !== undefined && sortOrder !== existing.sortOrder) {
            const swapped = await this.sortOrderService.swap({
                model: "brand",
                id1: id,
                newSortOrder: sortOrder,
                oldSortOrder: existing.sortOrder,
                baseWhere: { type: existing.type, deletedAt: null },
            });

            finalSortOrder = swapped ? sortOrder : existing.sortOrder;
        }

        const updatedBrand = await this.prisma.brand.update({
            where: { id },
            data: {
                slug,
                name,
                logo,
                type,
                isActive,
                sortOrder: finalSortOrder,
            },
        });

        await this.auditService.log({
            userId: updatedBy,
            action: "UPDATE_BRAND",
            tableName: "Brand",
            recordId: id,
            oldValues: existing,
            newValues: {
                slug,
                name,
                logo,
                type,
                isActive,
                sortOrder: finalSortOrder,
            },
            details: `Brand "${name}" updated`,
            ipAddress,
            userAgent,
        });

        return updatedBrand;
    }

    /**
     * Soft delete brand
     * @param input - Data delete
     */
    async delete(input: DeleteBrandInput) {
        const { id, deletedBy, ipAddress, userAgent } = input;

        const brand = await this.prisma.brand.findUnique({
            where: { id, deletedAt: null },
        });

        if (!brand) {
            throw new Error("Brand not found");
        }

        // Cek dependency untuk PRODUCT brand
        if (brand.type === "PRODUCT") {
            const productCount = await this.prisma.product.count({
                where: { brandId: id, deletedAt: null },
            });
            if (productCount > 0) {
                throw new Error(
                    "Cannot delete brand that is assigned to products"
                );
            }
        }

        await this.prisma.brand.update({
            where: { id },
            data: { deletedAt: new Date() },
        });

        // Reorder setelah delete
        await this.sortOrderService.reorderAfterDelete({
            model: "brand",
            deletedSortOrder: brand.sortOrder || 0,
            baseWhere: { type: brand.type, deletedAt: null },
        });

        await this.auditService.log({
            userId: deletedBy,
            action: "DELETE_BRAND",
            tableName: "Brand",
            recordId: id,
            oldValues: { name: brand.name, type: brand.type },
            details: `Brand "${brand.name}" deleted`,
            ipAddress,
            userAgent,
        });
    }

    /**
     * Hard delete brand (permanen)
     * @param input - Data hard delete
     */
    async hardDelete(input: DeleteBrandInput) {
        const { id, deletedBy, ipAddress, userAgent } = input;

        const brand = await this.prisma.brand.findUnique({ where: { id } });
        if (!brand) {
            throw new Error("Brand not found");
        }

        // Hapus file logo
        if (brand.logo && !brand.logo.includes("default")) {
            this.fileService.deleteFile(brand.logo);
        }

        await this.prisma.brand.delete({ where: { id } });

        // Reorder setelah delete
        await this.sortOrderService.reorderAfterDelete({
            model: "brand",
            deletedSortOrder: brand.sortOrder || 0,
            baseWhere: { type: brand.type, deletedAt: null },
        });

        await this.auditService.log({
            userId: deletedBy,
            action: "HARD_DELETE_BRAND",
            tableName: "Brand",
            recordId: id,
            oldValues: brand,
            details: `Brand "${brand.slug}" permanently deleted`,
            ipAddress,
            userAgent,
        });
    }
}
