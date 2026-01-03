/**
 * @file GalleryService – Manajemen galeri gambar Enerkomp Persada Raya
 * @description
 * Layanan terpusat untuk operasi galeri:
 * - CRUD gambar galeri (termasuk soft/hard delete)
 * - Manajemen file upload dan penghapusan
 * - Integrasi audit log untuk semua operasi
 *
 * @security
 * - Hapus file fisik saat hard delete
 * - Validasi keberadaan galeri sebelum update/delete
 * - Semua operasi tercatat di audit log
 *
 * @usage
 * const galleryService = new GalleryService(prisma, auditService, fileService);
 *
 * const gallery = await galleryService.create({
 *   imageUrl: '/uploads/galleries/img-123.jpg',
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

export interface CreateGalleryInput {
    imageUrl: string;
    createdBy: string;
    ipAddress?: string;
    userAgent?: string;
}

export interface DeleteGalleryInput {
    id: string;
    deletedBy: string;
    ipAddress?: string;
    userAgent?: string;
}

export class GalleryService {
    constructor(
        private prisma: PrismaClient,
        private auditService: AuditService,
        private fileService: FileService
    ) {}

    /**
     * Ambil daftar galeri dengan pagination
     * @param options - Filter dan pagination options
     * @returns Data galeri dan metadata pagination
     */
    async list(
        options: {
            deleted?: boolean;
            page?: number;
            limit?: number;
        } = {}
    ) {
        const { deleted = false, page = 1, limit = 20 } = options;
        const skip = (page - 1) * limit;

        const where: any = {
            deletedAt: deleted ? { not: null } : null,
        };

        const [galleries, total] = await Promise.all([
            this.prisma.gallery.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "asc" },
            }),
            this.prisma.gallery.count({ where }),
        ]);

        return {
            data: galleries,
            meta: {
                total,
                page,
                lastPage: Math.ceil(total / limit),
                perPage: limit,
            },
        };
    }

    /**
     * Ambil galeri berdasarkan ID
     * @param id - ID galeri
     * @returns Galeri
     */
    async findById(id: string) {
        return this.prisma.gallery.findUnique({
            where: { id, deletedAt: null },
        });
    }

    /**
     * Buat galeri baru
     * @param input - Data galeri
     * @returns Galeri yang dibuat
     */
    async create(input: CreateGalleryInput) {
        const { imageUrl, createdBy, ipAddress, userAgent } = input;

        const gallery = await this.prisma.gallery.create({
            data: { image: imageUrl },
        });

        await this.auditService.log({
            userId: createdBy,
            action: "CREATE_GALLERY",
            tableName: "Gallery",
            recordId: gallery.id,
            newValues: { image: imageUrl },
            details: "Gallery image uploaded",
            ipAddress,
            userAgent,
        });

        return gallery;
    }

    /**
     * Soft delete galeri
     * @param input - Data delete
     */
    async delete(input: DeleteGalleryInput) {
        const { id, deletedBy, ipAddress, userAgent } = input;

        const gallery = await this.prisma.gallery.findUnique({
            where: { id, deletedAt: null },
        });

        if (!gallery) {
            throw new Error("Gallery image not found or already deleted.");
        }

        const result = await this.prisma.gallery.update({
            where: { id },
            data: { deletedAt: new Date() },
        });

        await this.auditService.log({
            userId: deletedBy,
            action: "DELETE_GALLERY",
            tableName: "Gallery",
            recordId: id,
            oldValues: { image: gallery.image },
            newValues: { deletedAt: result.deletedAt },
            details: "Gallery image soft-deleted",
            ipAddress,
            userAgent,
        });

        return result;
    }

    /**
     * Hard delete galeri (permanen)
     * @param input - Data hard delete
     */
    async hardDelete(input: DeleteGalleryInput) {
        const { id, deletedBy, ipAddress, userAgent } = input;

        const gallery = await this.prisma.gallery.findUnique({ where: { id } });
        if (!gallery) {
            throw new Error("Gallery image not found.");
        }

        // Hapus file fisik
        if (gallery.image && gallery.image.startsWith("/uploads/galleries/")) {
            this.fileService.deleteFile(gallery.image);
        }

        await this.prisma.gallery.delete({ where: { id } });

        await this.auditService.log({
            userId: deletedBy,
            action: "HARD_DELETE_GALLERY",
            tableName: "Gallery",
            recordId: id,
            oldValues: gallery,
            details: "Gallery image permanently deleted",
            ipAddress,
            userAgent,
        });

        return { message: "Gallery image permanently deleted", id };
    }
}
