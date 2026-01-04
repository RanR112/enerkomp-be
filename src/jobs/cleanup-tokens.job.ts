// src/jobs/cleanup-tokens.job.ts
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma/client";

/**
 * Hapus token yang:
 * - Sudah kadaluarsa (> 15 menit untuk access_token, > 7 hari untuk refresh_token)
 * - Atau tidak dipakai dalam 30 hari (untuk jaga-jaga)
 */
export const cleanupExpiredTokens = async (): Promise<void> => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 1. Hapus token yang benar-benar sudah expired
    const expiredCount = await prisma.token.deleteMany({
        where: {
            OR: [
                // Access token: kadaluarsa 15 menit
                {
                    type: "access_token",
                    expiresAt: { lt: now },
                },
                // Refresh token: kadaluarsa 7 hari
                {
                    type: "refresh_token",
                    expiresAt: { lt: now },
                },
            ],
        },
    });

    // 2. Hapus token yang tidak dipakai dalam 30 hari (fallback)
    const unusedCount = await prisma.token.deleteMany({
        where: {
            updatedAt: { lt: thirtyDaysAgo },
            isRevoked: true, // hanya yang sudah direvoke
        },
    });

    console.log(
        `✅ Cleanup tokens: ${expiredCount.count} expired + ${
            unusedCount.count
        } unused = ${expiredCount.count + unusedCount.count} total`
    );
};
