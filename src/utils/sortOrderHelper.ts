/**
 * @file SortOrderHelper Adapter – Kompatibilitas dengan fungsi lama
 * @description
 * Menyediakan fungsi lama (`calculateSortOrder`, `resolveSortOrderOnCreate`, dll)
 * namun di-backup oleh `SortOrderService`.
 *
 * @note Prisma client HARUS di-inject (support transaction)
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { SortOrderService } from "../services/sort-order.service";

/**
 * Helper factory (TIDAK singleton)
 */
const getSortOrderService = (
    prisma: PrismaClient | Prisma.TransactionClient
): SortOrderService => {
    return new SortOrderService(prisma);
};

/**
 * Calculate sort order (legacy adapter)
 */
export const calculateSortOrder = async (
    prisma: PrismaClient | Prisma.TransactionClient,
    model: "brand",
    inputSortOrder: number | undefined,
    baseWhere: any = {},
    scopeKey?: string,
    scopeValue?: any
): Promise<number> => {
    const service = getSortOrderService(prisma);

    return service.calculate({
        model,
        inputSortOrder,
        baseWhere,
        scopeKey,
        scopeValue,
    });
};

/**
 * Resolve conflict on create
 */
export const resolveSortOrderOnCreate = async (
    prisma: PrismaClient | Prisma.TransactionClient,
    model: "brand" | "product" | "category" | "blog",
    newSortOrder: number,
    baseWhere: any = {}
): Promise<void> => {
    const service = getSortOrderService(prisma);
    await service.resolveConflictOnCreate({
        model,
        newSortOrder,
        baseWhere,
    });
};

/**
 * Swap sort order (transaction-safe)
 */
export const swapSortOrder = async (
    prisma: PrismaClient | Prisma.TransactionClient,
    model: "product" | "brand" | "category" | "blog",
    id1: string,
    newSortOrder: number,
    oldSortOrder: number | null,
    baseWhere: any = {}
): Promise<boolean> => {
    const service = getSortOrderService(prisma);
    return service.swap({
        model,
        id1,
        newSortOrder,
        oldSortOrder,
        baseWhere,
    });
};

/**
 * Reorder after delete
 */
export const reorderAfterDelete = async (
    prisma: PrismaClient | Prisma.TransactionClient,
    model: "product" | "brand" | "category" | "blog",
    deletedSortOrder: number,
    baseWhere: any = {}
): Promise<void> => {
    const service = getSortOrderService(prisma);
    await service.reorderAfterDelete({
        model,
        deletedSortOrder,
        baseWhere,
    });
};
