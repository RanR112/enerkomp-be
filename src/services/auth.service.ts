/**
 * @file AuthService – Manajemen autentikasi dan otorisasi pengguna
 * @description
 * Layanan terpusat untuk operasi autentikasi:
 * - Login, refresh token, logout
 * - Forgot & reset password dengan throttling
 * - Profile management (getMe)
 *
 * @security
 * - Throttling 2 menit untuk forgot password
 * - Semua token direvoke setelah reset password
 * - Tidak ada user enumeration (respons sama untuk email valid/tidak)
 * - Avatar default otomatis jika tidak ada
 *
 * @usage
 * const authService = new AuthService(
 *   prisma, passwordService, tokenService, fileService,
 *   auditService, emailService, timezoneService
 * );
 *
 * const result = await authService.login(email, password, ip, ua);
 *
 * @dependencies
 * - `@prisma/client`
 * - `PasswordService`, `TokenService`, `FileService`, `AuditService`
 * - `EmailService`, `TimezoneService`
 */

import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import dayjs from "dayjs";
import { jwtConfig } from "../config/jwt.config";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";
import { FileService } from "./file.service";
import { AuditService } from "./audit.service";
import { EmailService } from "./email.service";
import { TimezoneService } from "./timezone.service";
import { ForgotPasswordEmailTemplate } from "./email/email-templates/forgot-password.template";
import { EmailTemplateService } from "./email/email-template.service";

export type LoginResult = {
    accessToken: string;
    refreshToken: string;
    user: {
        id: string;
        name: string;
        email: string;
        avatar: string;
        role: {
            id: string;
            name: string;
        };
    };
};

export interface AuthenticatedUser {
    id: string;
    email: string;
    roleId: string;
    role: { name: string };
}

export interface AuthServiceConfig {
    accessTokenExpiresIn: number;
    refreshTokenExpiresIn: number;
    forgotPasswordCooldown: number;
    resetTokenExpiresIn: number;
}

export class AuthService {
    private readonly config: AuthServiceConfig;

    constructor(
        private prisma: PrismaClient,
        private passwordService: PasswordService,
        private tokenService: TokenService,
        private fileService: FileService,
        private auditService: AuditService,
        private emailService: EmailService,
        private emailTemplateService: EmailTemplateService,
        private timezoneService: TimezoneService,
        config: Partial<AuthServiceConfig> = {}
    ) {
        this.config = {
            accessTokenExpiresIn: jwtConfig.accessTokenExpiresIn,
            refreshTokenExpiresIn: jwtConfig.refreshTokenExpiresIn,
            forgotPasswordCooldown: jwtConfig.forgotPasswordCooldown,
            resetTokenExpiresIn: jwtConfig.resetTokenExpiresIn,
        };
    }

    /**
     * Autentikasi pengguna dan generate access/refresh token
     * @param email - Email pengguna
     * @param password - Password plaintext
     * @param ipAddress - IP address untuk audit
     * @param userAgent - User agent untuk audit
     * @returns Token dan data user
     */
    async login(
        email: string,
        password: string,
        ipAddress?: string,
        userAgent?: string
    ): Promise<LoginResult> {
        const user = await this.prisma.user.findUnique({
            where: { email, status: "ACTIVE", deletedAt: null },
            include: { role: true },
        });

        if (!user) {
            throw new Error("Invalid email or password");
        }

        const isPasswordValid = await this.passwordService.verify(
            password,
            user.password
        );
        if (!isPasswordValid) {
            throw new Error("Invalid email or password");
        }

        await this.prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
        });

        const avatarUrl = user.avatar || "/uploads/avatars/default-avatar.png";
        const payload = { id: user.id, email: user.email, roleId: user.roleId };

        const accessToken = this.tokenService.generateAccessToken(payload);
        const refreshToken = this.tokenService.generateRefreshToken(payload);

        await Promise.all([
            this.prisma.token.create({
                data: {
                    token: accessToken,
                    type: "access_token",
                    userId: user.id,
                    expiresAt: new Date(
                        Date.now() + this.config.accessTokenExpiresIn
                    ),
                    isRevoked: false,
                },
            }),
            this.prisma.token.create({
                data: {
                    token: refreshToken,
                    type: "refresh_token",
                    userId: user.id,
                    expiresAt: new Date(
                        Date.now() + this.config.refreshTokenExpiresIn
                    ),
                    isRevoked: false,
                },
            }),
        ]);

        await this.auditService.log({
            userId: user.id,
            action: "LOGIN",
            tableName: "User",
            recordId: user.id,
            details: "User logged in successfully",
            ipAddress,
            userAgent,
        });

        return {
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                avatar: avatarUrl,
                role: {
                    id: user.role.id,
                    name: user.role.name,
                },
            },
        };
    }

    /**
     * Validasi access token dan return user yang terautentikasi
     * @param token - Access token dari request
     * @returns User yang terautentikasi
     * @throws Error jika token tidak valid, user tidak ditemukan, atau tidak aktif
     */
    async validateAccessToken(token: string): Promise<AuthenticatedUser> {
        // Verifikasi JWT
        let payload: any;
        try {
            payload = this.tokenService.verifyToken(token, false);
        } catch (error) {
            throw new Error("Invalid or expired access token");
        }

        // Validasi struktur payload
        if (!payload || typeof payload.id !== "string") {
            throw new Error("Invalid token payload");
        }

        // Cek token di DB
        const tokenRecord = await this.prisma.token.findFirst({
            where: {
                token,
                type: "access_token",
                isRevoked: false,
                expiresAt: { gt: new Date() },
            },
        });

        if (!tokenRecord) {
            throw new Error("Invalid or revoked access token");
        }

        // Cek user
        const user = await this.prisma.user.findUnique({
            where: {
                id: payload.id,
                status: "ACTIVE",
                deletedAt: null,
            },
            include: { role: true },
        });

        if (!user || !user.role) {
            throw new Error("User not found or inactive");
        }

        return {
            id: user.id,
            email: user.email,
            roleId: user.roleId,
            role: { name: user.role.name },
        };
    }

    /**
     * Generate access token baru menggunakan refresh token
     * @param refreshToken - Refresh token yang valid
     * @param ipAddress - IP address untuk audit
     * @param userAgent - User agent untuk audit
     * @returns Access token baru
     */
    async refreshAccessToken(
        refreshToken: string,
        ipAddress?: string,
        userAgent?: string
    ): Promise<string> {
        let payload: any;
        try {
            payload = this.tokenService.verifyToken(refreshToken, true);
        } catch (error) {
            throw new Error("Invalid or expired refresh token");
        }

        const refreshTokenRecord = await this.prisma.token.findFirst({
            where: {
                token: refreshToken,
                userId: payload.id,
                type: "refresh_token",
                isRevoked: false,
                expiresAt: { gt: new Date() },
            },
        });

        if (!refreshTokenRecord) {
            throw new Error("Refresh token not found or already revoked");
        }

        await this.prisma.token.updateMany({
            where: {
                userId: payload.id,
                type: "access_token",
                isRevoked: false,
            },
            data: { isRevoked: true },
        });

        const newAccessToken = this.tokenService.generateAccessToken({
            id: payload.id,
            email: payload.email,
            roleId: payload.roleId,
        });

        await this.prisma.token.create({
            data: {
                userId: payload.id,
                token: newAccessToken,
                type: "access_token",
                expiresAt: new Date(
                    Date.now() + this.config.accessTokenExpiresIn
                ),
                isRevoked: false,
                ipAddress: ipAddress || null,
                userAgent: userAgent || null,
            },
        });

        return newAccessToken;
    }

    /**
     * Logout pengguna dan revoke semua token
     * @param refreshToken - Refresh token untuk identifikasi user
     * @param ipAddress - IP address untuk audit
     * @param userAgent - User agent untuk audit
     */
    async logout(
        refreshToken: string,
        ipAddress?: string,
        userAgent?: string
    ): Promise<void> {
        const tokenRecord = await this.prisma.token.findFirst({
            where: {
                token: refreshToken,
                type: "refresh_token",
                isRevoked: false,
            },
        });

        if (!tokenRecord) {
            throw new Error("Invalid refresh token");
        }

        await this.prisma.token.updateMany({
            where: { userId: tokenRecord.userId, isRevoked: false },
            data: { isRevoked: true },
        });

        await this.auditService.log({
            userId: tokenRecord.userId,
            action: "LOGOUT",
            tableName: "User",
            recordId: tokenRecord.userId,
            details: "User logged out",
            ipAddress,
            userAgent,
        });
    }

    /**
     * Proses forgot password dengan throttling
     * @param email - Email pengguna
     * @param ipAddress - IP address untuk audit
     * @param userAgent - User agent untuk audit
     * @returns Status cooldown
     */
    async forgotPassword(
        email: string,
        ipAddress?: string,
        userAgent?: string
    ): Promise<{ active: boolean; activeDate?: string }> {
        const user = await this.prisma.user.findUnique({
            where: { email, status: "ACTIVE", deletedAt: null },
        });

        if (!user) {
            await this.auditService.log({
                action: "FORGOT_PASSWORD_ATTEMPT",
                tableName: "User",
                details: `Attempt for non-existent email: ${email}`,
                ipAddress,
                userAgent,
            });
            return { active: false };
        }

        const cooldownEnd = user.lastForgotAt
            ? new Date(
                  user.lastForgotAt.getTime() +
                      this.config.forgotPasswordCooldown
              )
            : null;
        const now = new Date();

        if (cooldownEnd && now < cooldownEnd) {
            const localDate = this.timezoneService.toLocalISOString(
                cooldownEnd,
                "Asia/Jakarta"
            );
            return {
                active: true,
                activeDate: dayjs(localDate).format(),
            };
        }

        const resetToken = uuidv4();
        const expiresAt = new Date(
            Date.now() + this.config.resetTokenExpiresIn
        );

        await this.prisma.$transaction([
            this.prisma.token.create({
                data: {
                    token: resetToken,
                    type: "reset_password",
                    userId: user.id,
                    expiresAt,
                    isRevoked: false,
                    usedAt: null,
                    ipAddress,
                    userAgent,
                },
            }),
            this.prisma.user.update({
                where: { id: user.id },
                data: { lastForgotAt: now },
            }),
        ]);

        await this.auditService.log({
            userId: user.id,
            action: "FORGOT_PASSWORD",
            tableName: "Token",
            recordId: resetToken,
            details: "Password reset token generated",
            ipAddress,
            userAgent,
        });

        const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

        if (process.env.NODE_ENV === "development") {
            console.log(
                `[DEV] Forgot password link for ${email}: ${resetLink}`
            );
        } else {
            const template = new ForgotPasswordEmailTemplate(
                this.emailTemplateService
            );
            const html = template.generate({ resetUrl: resetLink });

            await this.emailService.send({
                to: email,
                subject: "Reset Password Request",
                html,
            });
        }

        return { active: false };
    }

    /**
     * Reset password menggunakan token
     * @param token - Token reset password
     * @param newPassword - Password baru
     * @param ipAddress - IP address untuk audit
     * @param userAgent - User agent untuk audit
     */
    async resetPassword(
        token: string,
        newPassword: string,
        ipAddress?: string,
        userAgent?: string
    ): Promise<void> {
        const tokenRecord = await this.prisma.token.findFirst({
            where: {
                token,
                type: "reset_password",
                isRevoked: false,
                usedAt: null,
                expiresAt: { gt: new Date() },
            },
            include: { user: true },
        });

        if (!tokenRecord) {
            throw new Error("Invalid or expired reset token");
        }

        const hashedPassword = await this.passwordService.hash(newPassword);

        await Promise.all([
            this.prisma.user.update({
                where: { id: tokenRecord.userId },
                data: { password: hashedPassword },
            }),
            this.prisma.token.update({
                where: { id: tokenRecord.id },
                data: { usedAt: new Date(), isRevoked: true },
            }),
            this.prisma.token.updateMany({
                where: {
                    userId: tokenRecord.userId,
                    type: { in: ["refresh_token", "access_token"] },
                },
                data: { isRevoked: true },
            }),
        ]);

        await this.auditService.log({
            userId: tokenRecord.userId,
            action: "RESET_PASSWORD",
            tableName: "User",
            recordId: tokenRecord.userId,
            details: "Password successfully reset",
            ipAddress,
            userAgent,
        });
    }

    /**
     * Ambil profil pengguna saat ini
     * @param userId - ID pengguna
     * @returns Data profil lengkap
     */
    async getMe(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId, deletedAt: null },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                status: true,
                avatar: true,
                lastLoginAt: true,
                createdAt: true,
                updatedAt: true,
                role: {
                    select: {
                        id: true,
                        name: true,
                        description: true,
                        isSystem: true,
                        permissions: {
                            select: { action: true, resource: true },
                        },
                    },
                },
            },
        });

        if (!user) {
            throw new Error("User not found");
        }

        const avatarUrl = user.avatar || "/uploads/avatars/default-avatar.png";

        return {
            ...user,
            avatar: avatarUrl,
        };
    }

    /**
     * Update avatar pengguna saat ini
     * @param userId - ID pengguna
     * @param avatarFile - File avatar baru
     * @param ipAddress - IP address untuk audit
     * @param userAgent - User agent untuk audit
     * @returns URL avatar baru
     */
    async updateOwnAvatar(
        userId: string,
        avatarFile: Express.Multer.File,
        ipAddress?: string,
        userAgent?: string
    ): Promise<string> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) throw new Error("User not found");

        // Hapus avatar lama
        if (user.avatar && !user.avatar.endsWith("default-avatar.png")) {
            await this.fileService.deleteFile(user.avatar);
        }

        const avatarUrl = `/uploads/avatars/${avatarFile.filename}`;

        await this.prisma.user.update({
            where: { id: userId },
            data: { avatar: avatarUrl },
        });

        await this.auditService.log({
            userId,
            action: "UPDATE_AVATAR",
            tableName: "User",
            recordId: userId,
            oldValues: { avatar: user.avatar },
            newValues: { avatar: avatarUrl },
            details: "User avatar updated",
            ipAddress,
            userAgent,
        });

        return avatarUrl;
    }

    /**
     * Hapus avatar pengguna saat ini (kembali ke default)
     * @param userId - ID pengguna
     * @param ipAddress - IP address untuk audit
     * @param userAgent - User agent untuk audit
     * @returns null (avatar default)
     */
    async deleteOwnAvatar(
        userId: string,
        ipAddress?: string,
        userAgent?: string
    ): Promise<null> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) throw new Error("User not found");
        if (!user.avatar) throw new Error("User does not have a custom avatar");

        await this.fileService.deleteFile(user.avatar);

        await this.prisma.user.update({
            where: { id: userId },
            data: { avatar: null },
        });

        await this.auditService.log({
            userId,
            action: "DELETE_AVATAR",
            tableName: "User",
            recordId: userId,
            oldValues: { avatar: user.avatar },
            newValues: { avatar: null },
            details: "User avatar deleted",
            ipAddress,
            userAgent,
        });

        return null;
    }
}
