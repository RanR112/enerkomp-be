/**
 * @file CatalogService – Manajemen dokumen katalog produk Enerkomp
 * @description
 * Layanan terpusat untuk operasi katalog:
 * - CRUD dokumen katalog (PDF, Excel, dll)
 * - Manajemen file upload dan penghapusan
 * - Integrasi audit log untuk semua operasi
 *
 * @security
 * - Hapus file lama saat update katalog
 * - Validasi keberadaan katalog sebelum update/delete
 * - Semua operasi tercatat di audit log
 *
 * @usage
 * const catalogService = new CatalogService(prisma, auditService, fileService);
 *
 * const catalog = await catalogService.create({
 *   name: 'Katalog Produk 2025',
 *   fileUrl: '/uploads/catalogs/katalog-2025.pdf',
 *   createdBy: 'usr_123'
 * });
 *
 * @dependencies
 * - `@prisma/client`
 * - `AuditService`, `FileService`
 */

import { PrismaClient } from "@prisma/client";
import { AuditService } from "./audit.service";
import { FileService } from "./file.service";

export interface CreateCatalogInput {
    name: string;
    description?: string | null;
    fileUrl: string;
    createdBy: string;
    ipAddress?: string;
    userAgent?: string;
}

export interface UpdateCatalogInput {
    id: string;
    name: string;
    description?: string | null;
    fileUrl: string;
    updatedBy: string;
    ipAddress?: string;
    userAgent?: string;
}

export interface DeleteCatalogInput {
    id: string;
    deletedBy: string;
    ipAddress?: string;
    userAgent?: string;
}

export class CatalogService {
    constructor(
        private prisma: PrismaClient,
        private auditService: AuditService,
        private fileService: FileService
    ) {}

    /**
     * Ambil daftar katalog dengan pagination dan pencarian
     * @param options - Filter dan pagination options
     * @returns Data katalog dan metadata pagination
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
                { description: { contains: search, mode: "insensitive" } },
            ];
        }

        const [catalogs, total] = await Promise.all([
            this.prisma.catalog.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
            }),
            this.prisma.catalog.count({ where }),
        ]);

        return {
            data: catalogs,
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
     * Ambil katalog berdasarkan ID
     * @param id - ID katalog
     * @returns Katalog
     */
    async findById(id: string) {
        return this.prisma.catalog.findUnique({
            where: { id, deletedAt: null },
        });
    }

    /**
     * Buat katalog baru
     * @param input - Data katalog
     * @returns Katalog yang dibuat
     */
    async create(input: CreateCatalogInput) {
        const { name, description, fileUrl, createdBy, ipAddress, userAgent } =
            input;

        const catalog = await this.prisma.catalog.create({
            data: {
                name,
                description,
                file: fileUrl,
            },
        });

        await this.auditService.log({
            userId: createdBy,
            action: "CREATE_CATALOG",
            tableName: "Catalog",
            recordId: catalog.id,
            newValues: { name, description, file: fileUrl },
            details: `Catalog document "${name}" uploaded`,
            ipAddress,
            userAgent,
        });

        return catalog;
    }

    /**
     * Update katalog yang sudah ada
     * @param input - Data update
     * @returns Katalog yang diupdate
     */
    async update(input: UpdateCatalogInput) {
        const {
            id,
            name,
            description,
            fileUrl,
            updatedBy,
            ipAddress,
            userAgent,
        } = input;

        const existing = await this.prisma.catalog.findUnique({
            where: { id, deletedAt: null },
        });

        if (!existing) {
            throw new Error("Catalog not found");
        }

        // Hapus file lama jika berbeda
        if (existing.file && existing.file !== fileUrl) {
            this.fileService.deleteFile(existing.file);
        }

        const updatedCatalog = await this.prisma.catalog.update({
            where: { id },
            data: {
                name,
                description,
                file: fileUrl,
            },
        });

        await this.auditService.log({
            userId: updatedBy,
            action: "UPDATE_CATALOG",
            tableName: "Catalog",
            recordId: id,
            oldValues: {
                name: existing.name,
                description: existing.description,
                file: existing.file,
            },
            newValues: { name, description, file: fileUrl },
            details: `Catalog document "${name}" updated`,
            ipAddress,
            userAgent,
        });

        return updatedCatalog;
    }

    /**
     * Soft delete katalog
     * @param input - Data delete
     */
    async delete(input: DeleteCatalogInput) {
        const { id, deletedBy, ipAddress, userAgent } = input;

        const catalog = await this.prisma.catalog.findUnique({
            where: { id, deletedAt: null },
        });

        if (!catalog) {
            throw new Error("Catalog not found");
        }

        await this.prisma.catalog.update({
            where: { id },
            data: { deletedAt: new Date() },
        });

        await this.auditService.log({
            userId: deletedBy,
            action: "DELETE_CATALOG",
            tableName: "Catalog",
            recordId: id,
            oldValues: { name: catalog.name },
            details: `Catalog document "${catalog.name}" deleted`,
            ipAddress,
            userAgent,
        });
    }
}
