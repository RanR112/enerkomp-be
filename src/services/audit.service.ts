/**
 * @file AuditService – Logging aktivitas sistem untuk keperluan audit dan keamanan
 * @description
 * Layanan terpusat untuk mencatat semua operasi penting:
 * - Create, update, delete, restore data
 * - Autentikasi dan otorisasi
 * - Akses sistem kritis
 *
 * @security
 * - Semua nilai di-serialize ke JSON → hindari leak object internal
 * - IP address dan user agent disimpan untuk forensik
 * - Tidak ada filtering log → semua aktivitas terekam
 *
 * @usage
 * const auditService = new AuditService(prisma);
 *
 * await auditService.log({
 *   userId: 'usr_123',
 *   action: 'CREATE_ROLE',
 *   tableName: 'Role',
 *   recordId: 'role_456',
 *   details: 'Role "Manager" created',
 *   ipAddress: '192.168.1.1'
 * });
 *
 * @dependencies
 * - `@prisma/client`
 */

import { Prisma, PrismaClient } from "@prisma/client";

export interface AuditLogInput {
    userId?: string;
    action: string;
    tableName: string;
    recordId?: string;
    oldValues?: Record<string, any> | null;
    newValues?: Record<string, any> | null;
    details?: string;
    ipAddress?: string;
    userAgent?: string;
}

export interface GetAuditLogsOptions {
    page?: number;
    limit?: number;
    search?: string;
    action?: string;
    tableName?: string;
    startDate?: string;
    endDate?: string;
}

export class AuditService {
    constructor(private prisma: PrismaClient) {}

    /**
     * Ambil daftar log audit dengan filter dan pagination
     * @param options - Opsi filter dan pagination
     * @returns Data log dan metadata pagination
     */
    async getLogs(options: GetAuditLogsOptions = {}) {
        const {
            page = 1,
            limit = 20,
            search,
            action,
            tableName,
            startDate,
            endDate,
        } = options;
        const skip = (page - 1) * limit;

        const where: Prisma.AuditLogWhereInput = {};

        if (search) {
            where.OR = [
                { userId: { contains: search } },
                { recordId: { contains: search } },
                { details: { contains: search } },
                { tableName: { contains: search } },
                { action: { contains: search } },
            ];
        }

        if (action) where.action = action;
        if (tableName) where.tableName = tableName;

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }

        const [logs, total] = await Promise.all([
            this.prisma.auditLog.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: { select: { name: true } },
                        },
                    },
                },
            }),
            this.prisma.auditLog.count({ where }),
        ]);

        return {
            data: logs,
            meta: {
                total,
                page,
                lastPage: Math.ceil(total / limit),
                perPage: limit,
                search: search || null,
                action: action || null,
                tableName: tableName || null,
                startDate: startDate || null,
                endDate: endDate || null,
            },
        };
    }

    /**
     * Catat aktivitas ke dalam log audit
     * @param input - Data aktivitas untuk di-log
     */
    async log({
        userId,
        action,
        tableName,
        recordId,
        oldValues,
        newValues,
        details,
        ipAddress,
        userAgent,
    }: AuditLogInput): Promise<void> {
        // Serialisasi nilai untuk keamanan (hindari circular ref, function, dll)
        const safeOldValues = oldValues
            ? this.sanitizeForStorage(oldValues)
            : null;
        const safeNewValues = newValues
            ? this.sanitizeForStorage(newValues)
            : null;

        await this.prisma.auditLog.create({
            data: {
                userId,
                action,
                tableName,
                recordId,
                oldValues: safeOldValues as any,
                newValues: safeNewValues as any,
                details,
                ipAddress,
                userAgent,
            },
        });
    }

    private sanitizeForStorage(
        obj: Record<string, any>
    ): Record<string, any> | null {
        try {
            // Clone & serialisasi aman
            return JSON.parse(JSON.stringify(obj));
        } catch {
            // Jika gagal, kirim sebagai string
            return { error: "Failed to serialize values", raw: String(obj) };
        }
    }
}
