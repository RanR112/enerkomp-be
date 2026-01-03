/**
 * @file SortOrderService – Manajemen sortOrder untuk entitas berurut
 * @description
 * Layanan untuk mengelola logika pengurutan (sortOrder) pada entitas seperti:
 * - Brand, Product, Category, Blog
 *
 * Mendukung:
 * - Perhitungan sortOrder otomatis (auto-increment)
 * - Resolusi konflik saat CREATE (geser entitas lama ke belakang)
 * - Swap saat UPDATE (tukar posisi dua entitas)
 * - Reorder otomatis setelah DELETE (turunkan yang di atas)
 *
 * @security
 * - Semua operasi DB menggunakan Prisma → aman dari SQL injection
 * - Validasi model sebelum eksekusi
 * - Didesain untuk dipakai dalam transaksi
 *
 * @usage
 * const sortOrderService = new SortOrderService(prisma);
 *
 * // Hitung sortOrder baru
 * const sortOrder = await sortOrderService.calculate({
 *   model: 'brand',
 *   inputSortOrder: 5,
 *   baseWhere: { type: 'PRODUCT', deletedAt: null }
 * });
 *
 * @dependencies
 * - `@prisma/client`
 */

import { Prisma, PrismaClient } from "@prisma/client";

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

export type SortOrderModel = "brand" | "product" | "category" | "blog";

interface CalculateOptions {
    model: SortOrderModel;
    inputSortOrder?: number;
    baseWhere?: any;
    scopeKey?: string;
    scopeValue?: any;
}

interface ResolveConflictOptions {
    model: SortOrderModel;
    newSortOrder: number;
    baseWhere?: any;
}

export class SortOrderService {
    private readonly modelMap: Record<SortOrderModel, any>;

    constructor(private readonly prisma: PrismaExecutor) {
        this.modelMap = {
            product: prisma.product,
            brand: prisma.brand,
            category: prisma.category,
            blog: prisma.blog,
        };
    }

    /**
     * Hitung sortOrder akhir berdasarkan input dan kondisi saat ini
     */
    async calculate({
        model,
        inputSortOrder,
        baseWhere = {},
        scopeKey,
        scopeValue,
    }: CalculateOptions): Promise<number> {
        const prismaModel = this.getModel(model);
        const where = {
            ...baseWhere,
            ...(scopeKey && scopeValue !== undefined
                ? { [scopeKey]: scopeValue }
                : {}),
        };

        const maxResult = await prismaModel.aggregate({
            _max: { sortOrder: true },
            where,
        });
        const maxVal = maxResult._max.sortOrder || 0;

        if (inputSortOrder == null || inputSortOrder <= 0) {
            return maxVal + 1;
        }

        if (inputSortOrder > maxVal + 1) {
            return maxVal + 1;
        }

        return inputSortOrder;
    }

    /**
     * Resolve konflik saat CREATE: geser entitas lama ke posisi paling belakang
     */
    async resolveConflictOnCreate({
        model,
        newSortOrder,
        baseWhere = {},
    }: ResolveConflictOptions): Promise<void> {
        const prismaModel = this.getModel(model);

        const conflict = await prismaModel.findFirst({
            where: {
                ...baseWhere,
                sortOrder: newSortOrder,
            },
        });

        if (!conflict) return;

        const maxResult = await prismaModel.aggregate({
            _max: { sortOrder: true },
            where: baseWhere,
        });
        const maxVal = maxResult._max.sortOrder || 0;

        await prismaModel.update({
            where: { id: conflict.id },
            data: { sortOrder: maxVal + 1 },
        });
    }

    /**
     * Lakukan swap sortOrder antara dua entitas (untuk UPDATE)
     */
    async swap({
        model,
        id1,
        newSortOrder,
        oldSortOrder,
        baseWhere = {},
    }: {
        model: SortOrderModel;
        id1: string;
        newSortOrder: number;
        oldSortOrder: number | null;
        baseWhere?: any;
    }): Promise<boolean> {
        if (oldSortOrder == null) return false;

        const prismaModel = this.getModel(model);

        const conflict = await prismaModel.findFirst({
            where: {
                ...baseWhere,
                sortOrder: newSortOrder,
                NOT: { id: id1 },
            },
        });

        if (!conflict) return false;

        // Lakukan swap dalam satu transaksi jika diperlukan
        await prismaModel.update({
            where: { id: conflict.id },
            data: { sortOrder: oldSortOrder },
        });

        await prismaModel.update({
            where: { id: id1 },
            data: { sortOrder: newSortOrder },
        });

        return true;
    }

    /**
     * Turunkan sortOrder semua entitas di atas posisi yang dihapus
     */
    async reorderAfterDelete({
        model,
        deletedSortOrder,
        baseWhere = {},
    }: {
        model: SortOrderModel;
        deletedSortOrder: number;
        baseWhere?: any;
    }): Promise<void> {
        const prismaModel = this.getModel(model);

        await prismaModel.updateMany({
            where: {
                ...baseWhere,
                sortOrder: { gt: deletedSortOrder },
            },
            data: { sortOrder: { decrement: 1 } },
        });
    }

    private getModel(model: SortOrderModel) {
        const prismaModel = this.modelMap[model];
        if (!prismaModel) {
            throw new Error(`Unsupported model: ${model}`);
        }
        return prismaModel;
    }

    /**
     * Parse input sortOrder ke number valid
     * - Input bisa string (form-data) atau number (JSON)
     * - Kembalikan 0 jika invalid (sesuai logika lama)
     * - Hanya terima integer ≥ 0
     */
    parse(value: any): number {
        if (value == null || value === "") {
            return 0;
        }

        const num = typeof value === "string" ? Number(value) : value;

        if (
            typeof num !== "number" ||
            isNaN(num) ||
            !Number.isInteger(num) ||
            num < 0
        ) {
            return 0;
        }

        return num;
    }
}
