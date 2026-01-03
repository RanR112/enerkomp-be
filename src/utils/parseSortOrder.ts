/**
 * @file ParseSortOrder Adapter – Kompatibilitas dengan fungsi lama
 * @description
 * Menyediakan fungsi `parseSortOrder()` seperti versi lama,
 * namun di-backup oleh `SortOrderService`.
 *
 * @usage
 * import { parseSortOrder } from '@/utils/parseSortOrder';
 * const sortOrder = parseSortOrder("5"); // → 5
 */

import { PrismaClient } from "@prisma/client";
import { SortOrderService } from "../services/sort-order.service";

let sortOrderService: SortOrderService | null = null;

const getSortOrderService = (): SortOrderService => {
    if (!sortOrderService) {
        // Gunakan dummy PrismaClient untuk parsing (tidak perlu koneksi DB)
        const dummyPrisma = {
            product: {},
            brand: {},
            category: {},
            blog: {},
        } as any as PrismaClient;
        sortOrderService = new SortOrderService(dummyPrisma);
    }
    return sortOrderService;
};

export const parseSortOrder = (value: any): number | undefined => {
    return getSortOrderService().parse(value);
};
