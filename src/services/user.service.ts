/**
 * @file UserService – Manajemen pengguna sistem Enerkomp Persada Raya
 * @description
 * Layanan terpusat untuk operasi pengguna:
 * - CRUD pengguna (termasuk soft/hard delete dan restore)
 * - Manajemen avatar (upload, update, hapus)
 * - Integrasi audit log untuk semua operasi
 *
 * @security
 * - Validasi duplikat email sebelum create/update
 * - Hanya role yang valid yang bisa diassign
 * - Avatar default otomatis jika tidak ada
 * - Hapus file avatar lama saat update/hard delete
 *
 * @usage
 * const userService = new UserService(prisma, passwordService, fileService, auditService);
 *
 * const user = await userService.create({
 *   name: 'John Doe',
 *   email: 'john@example.com',
 *   password: 'secret123',
 *   roleId: 'role_123',
 *   createdBy: 'usr_admin'
 * });
 *
 * @dependencies
 * - `@prisma/client`
 * - `PasswordService`, `FileService`, `AuditService`
 */

import { PrismaClient, UserStatus } from "@prisma/client";
import { PasswordService } from "./password.service";
import { FileService } from "./file.service";
import { AuditService } from "./audit.service";
import { appConfig } from "../config/app.config";

export interface CreateUserInput {
    name: string;
    email: string;
    phone: string;
    password: string;
    roleId: string;
    status?: UserStatus;
    createdBy: string;
    ipAddress?: string;
    userAgent?: string;
    avatarFile?: Express.Multer.File;
}

export interface UpdateUserInput {
    id: string;
    name: string;
    email: string;
    phone: string;
    roleId: string;
    status: UserStatus;
    updatedBy: string;
    ipAddress?: string;
    userAgent?: string;
    avatarFile?: Express.Multer.File;
}

export interface DeleteUserInput {
    id: string;
    deletedBy: string;
    ipAddress?: string;
    userAgent?: string;
}

export class UserService {
    private readonly DEFAULT_AVATAR = appConfig.defaultAvatar;

    constructor(
        private prisma: PrismaClient,
        private passwordService: PasswordService,
        private fileService: FileService,
        private auditService: AuditService
    ) {}

    /**
     * Ambil daftar pengguna dengan pagination dan pencarian
     * @param options - Filter dan pagination options
     * @returns Data pengguna dan metadata pagination
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
                { email: { contains: search, mode: "insensitive" } },
                { role: { name: { contains: search, mode: "insensitive" } } },
            ];
        }

        const [users, total] = await Promise.all([
            this.prisma.user.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                include: { role: true },
            }),
            this.prisma.user.count({ where }),
        ]);

        return {
            data: users,
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
     * Ambil pengguna berdasarkan ID
     * @param id - ID pengguna
     * @returns Pengguna dengan role
     */
    async findById(id: string) {
        return this.prisma.user.findUnique({
            where: { id },
            include: { role: true },
        });
    }

    /**
     * Buat pengguna baru atau restore jika sudah ada (soft-deleted)
     * @param input - Data pengguna
     * @returns Pengguna yang dibuat atau direstore
     */
    async create(input: CreateUserInput) {
        const {
            name,
            email,
            phone,
            password,
            roleId,
            status = UserStatus.ACTIVE,
            createdBy,
            ipAddress,
            userAgent,
            avatarFile,
        } = input;

        const existing = await this.prisma.user.findFirst({ where: { email } });

        if (existing) {
            if (existing.deletedAt === null) {
                throw new Error(`User with email "${email}" already exists.`);
            }

            // Restore user
            const hashedPassword = await this.passwordService.hash(password);
            const avatarUrl = avatarFile
                ? `/uploads/avatars/${avatarFile.filename}`
                : this.DEFAULT_AVATAR;

            const updated = await this.prisma.user.update({
                where: { id: existing.id },
                data: {
                    name,
                    phone,
                    password: hashedPassword,
                    roleId,
                    status,
                    avatar: avatarUrl,
                    deletedAt: null,
                    updatedAt: new Date(),
                },
            });

            await this.auditService.log({
                userId: createdBy,
                action: "RESTORE_USER",
                tableName: "User",
                recordId: existing.id,
                oldValues: { deletedAt: existing.deletedAt },
                newValues: { name, email, roleId, status, avatar: avatarUrl },
                details: `User "${email}" restored`,
                ipAddress,
                userAgent,
            });

            return updated;
        }

        // Create new user
        const hashedPassword = await this.passwordService.hash(password);
        const avatarUrl = avatarFile
            ? `/uploads/avatars/${avatarFile.filename}`
            : this.DEFAULT_AVATAR;

        const user = await this.prisma.user.create({
            data: {
                name,
                email,
                phone,
                password: hashedPassword,
                roleId,
                status,
                avatar: avatarUrl,
            },
        });

        await this.auditService.log({
            userId: createdBy,
            action: "CREATE_USER",
            tableName: "User",
            recordId: user.id,
            newValues: {
                name,
                email,
                phone,
                roleId,
                status,
                avatar: avatarUrl,
            },
            details: `User "${email}" created`,
            ipAddress,
            userAgent,
        });

        return user;
    }

    /**
     * Update pengguna dan avatar-nya
     * @param input - Data update
     * @returns Pengguna yang diupdate
     */
    async update(input: UpdateUserInput) {
        const {
            id,
            name,
            email,
            phone,
            roleId,
            status,
            updatedBy,
            ipAddress,
            userAgent,
            avatarFile,
        } = input;

        const existingUser = await this.prisma.user.findUnique({
            where: { id, deletedAt: null },
            include: { role: true },
        });

        if (!existingUser) {
            throw new Error("User not found");
        }

        // Cek duplikat email
        if (email !== existingUser.email) {
            const duplicate = await this.prisma.user.findUnique({
                where: { email },
            });
            if (duplicate) {
                throw new Error("Email already in use");
            }
        }

        // Cek role valid
        const role = await this.prisma.role.findUnique({
            where: { id: roleId },
        });
        if (!role) {
            throw new Error("Invalid role");
        }

        let avatarUrl = existingUser.avatar;

        // Update avatar jika ada file baru
        if (avatarFile) {
            if (
                existingUser.avatar &&
                !existingUser.avatar.endsWith("default-avatar.png")
            ) {
                this.fileService.deleteFile(existingUser.avatar);
            }
            avatarUrl = `/uploads/avatars/${avatarFile.filename}`;
        }

        const oldValues = {
            name: existingUser.name,
            email: existingUser.email,
            phone: existingUser.phone,
            roleId: existingUser.roleId,
            status: existingUser.status,
            avatar: existingUser.avatar,
        };

        const updatedUser = await this.prisma.user.update({
            where: { id },
            data: { name, email, phone, roleId, status, avatar: avatarUrl },
            include: { role: true },
        });

        await this.auditService.log({
            userId: updatedBy,
            action: "UPDATE_USER",
            tableName: "User",
            recordId: id,
            oldValues,
            newValues: {
                name,
                email,
                phone,
                roleId,
                status,
                avatar: avatarUrl,
            },
            details: `User "${email}" updated`,
            ipAddress,
            userAgent,
        });

        return updatedUser;
    }

    /**
     * Soft delete pengguna
     * @param input - Data delete
     * @returns Pengguna yang di-soft delete
     */
    async delete(input: DeleteUserInput) {
        const { id, deletedBy, ipAddress, userAgent } = input;

        const user = await this.prisma.user.findUnique({
            where: { id, deletedAt: null },
        });

        if (!user) {
            throw new Error("User not found");
        }

        const result = await this.prisma.user.update({
            where: { id },
            data: { deletedAt: new Date() },
        });

        await this.auditService.log({
            userId: deletedBy,
            action: "DELETE_USER",
            tableName: "User",
            recordId: id,
            oldValues: { name: user.name, email: user.email },
            newValues: { deletedAt: result.deletedAt },
            details: `User "${user.email}" deleted`,
            ipAddress,
            userAgent,
        });

        return result;
    }

    /**
     * Hard delete pengguna (permanen)
     * @param input - Data hard delete
     * @returns Konfirmasi penghapusan
     */
    async hardDelete(input: DeleteUserInput) {
        const { id, deletedBy, ipAddress, userAgent } = input;

        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user) {
            throw new Error("User not found");
        }

        // Hapus avatar
        if (user.avatar && !user.avatar.endsWith("default-avatar.png")) {
            this.fileService.deleteFile(user.avatar);
        }

        await this.prisma.user.delete({ where: { id } });

        await this.auditService.log({
            userId: deletedBy,
            action: "HARD_DELETE_USER",
            tableName: "User",
            recordId: id,
            oldValues: user,
            details: `User "${user.email}" hard deleted`,
            ipAddress,
            userAgent,
        });

        return { message: "User permanently deleted", id };
    }

    /**
     * Ambil profil pengguna
     * @param userId - ID pengguna
     * @returns Data profil lengkap
     */
    async getProfile(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { role: true },
        });

        if (!user) {
            throw new Error("User not found");
        }

        return {
            ...user,
            avatar: user.avatar || this.DEFAULT_AVATAR,
        };
    }

    /**
     * Update avatar pengguna lain (hanya untuk admin)
     * @param targetUserId - ID pengguna yang diubah
     * @param avatarFile - File avatar baru
     * @param updatedBy - ID pengguna yang melakukan perubahan
     * @param ipAddress - IP address untuk audit
     * @param userAgent - User agent untuk audit
     * @returns URL avatar baru
     */
    async updateAvatar(
        targetUserId: string,
        avatarFile: Express.Multer.File,
        updatedBy: string,
        ipAddress?: string,
        userAgent?: string
    ): Promise<string> {
        const user = await this.prisma.user.findUnique({
            where: { id: targetUserId },
        });
        if (!user) throw new Error("User not found");

        // Hapus avatar lama
        if (user.avatar && !user.avatar.endsWith("default-avatar.png")) {
            this.fileService.deleteFile(user.avatar);
        }

        const avatarUrl = `/uploads/avatars/${avatarFile.filename}`;

        await this.prisma.user.update({
            where: { id: targetUserId },
            data: { avatar: avatarUrl },
        });

        await this.auditService.log({
            userId: updatedBy,
            action: "UPDATE_AVATAR",
            tableName: "User",
            recordId: targetUserId,
            oldValues: { avatar: user.avatar },
            newValues: { avatar: avatarUrl },
            details: `Avatar updated for user ${user.email}`,
            ipAddress,
            userAgent,
        });

        return avatarUrl;
    }

    /**
     * Hapus avatar pengguna lain (hanya untuk admin)
     * @param targetUserId - ID pengguna yang diubah
     * @param deletedBy - ID pengguna yang melakukan perubahan
     * @param ipAddress - IP address untuk audit
     * @param userAgent - User agent untuk audit
     * @returns null (avatar default)
     */
    async deleteAvatar(
        targetUserId: string,
        deletedBy: string,
        ipAddress?: string,
        userAgent?: string
    ): Promise<null> {
        const user = await this.prisma.user.findUnique({
            where: { id: targetUserId },
        });
        if (!user) throw new Error("User not found");
        if (!user.avatar) throw new Error("User does not have a custom avatar");

        this.fileService.deleteFile(user.avatar);

        await this.prisma.user.update({
            where: { id: targetUserId },
            data: { avatar: null },
        });

        await this.auditService.log({
            userId: deletedBy,
            action: "DELETE_AVATAR",
            tableName: "User",
            recordId: targetUserId,
            oldValues: { avatar: user.avatar },
            newValues: { avatar: null },
            details: `Avatar deleted for user ${user.email}`,
            ipAddress,
            userAgent,
        });

        return null;
    }
}
