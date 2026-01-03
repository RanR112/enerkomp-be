/**
 * @file RoleService – Manajemen role dan permission berbasis RBAC (Role-Based Access Control)
 * @description
 * Layanan untuk mengelola role dalam sistem:
 * - CRUD role (termasuk soft/hard delete dan restore)
 * - Manajemen permission (action + resource)
 * - Integrasi audit log untuk semua operasi
 *
 * @security
 * - Role sistem tidak bisa diubah/dihapus
 * - Role dengan user aktif tidak bisa dihapus
 * - Validasi duplikat nama sebelum create/update
 * - Soft delete default, hard delete opsional dan dilindungi
 *
 * @usage
 * const roleService = new RoleService(prisma, auditService);
 *
 * const role = await roleService.create({
 *   name: 'Manager',
 *   description: 'Operational manager',
 *   permissions: [{ action: 'read', resource: 'product' }],
 *   createdBy: 'usr_123'
 * });
 *
 * @dependencies
 * - `@prisma/client`
 * - `AuditService` (dari `src/services/audit.service.ts`)
 */

import { PrismaClient } from "@prisma/client";
import { AuditService } from "./audit.service";

export type PermissionInput = {
    action: string;
    resource: string;
};

export interface CreateRoleInput {
    name: string;
    description: string | null;
    permissions: PermissionInput[];
    createdBy: string;
    ipAddress?: string;
    userAgent?: string;
}

export interface UpdateRoleInput {
    id: string;
    name: string;
    description: string | null;
    permissions: PermissionInput[];
    updatedBy: string;
    ipAddress?: string;
    userAgent?: string;
}

export interface DeleteRoleInput {
    id: string;
    deletedBy: string;
    ipAddress?: string;
    userAgent?: string;
}

export class RoleService {
    constructor(
        private prisma: PrismaClient,
        private auditService: AuditService
    ) {}

    // Tambahkan di dalam class RoleService
    /**
     * Periksa apakah role memiliki permission tertentu
     * @param roleId - ID role
     * @param resource - Nama resource
     * @param action - Aksi yang diminta
     * @returns true jika permission ditemukan
     */
    async hasPermission(
        roleId: string,
        resource: string,
        action: string
    ): Promise<boolean> {
        const permission = await this.prisma.permission.findFirst({
            where: {
                roleId,
                resource,
                action,
            },
        });
        return permission !== null;
    }

    /**
     * Ambil daftar role dengan pagination dan pencarian
     * @param options - Filter dan pagination options
     * @returns Data role dan metadata pagination
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

        const [roles, total] = await Promise.all([
            this.prisma.role.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                include: {
                    permissions: true,
                    _count: { select: { users: true } },
                },
            }),
            this.prisma.role.count({ where }),
        ]);

        return {
            data: roles,
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
     * Ambil role berdasarkan ID
     * @param id - ID role
     * @returns Role dengan permission dan jumlah user
     */
    async findById(id: string) {
        return this.prisma.role.findUnique({
            where: { id },
            include: {
                permissions: true,
                _count: { select: { users: true } },
            },
        });
    }

    /**
     * Buat role baru atau restore jika sudah ada (soft-deleted)
     * @param input - Data role dan permission
     * @returns Role yang dibuat atau direstore
     */
    async create(input: CreateRoleInput) {
        const {
            name,
            description,
            permissions,
            createdBy,
            ipAddress,
            userAgent,
        } = input;

        // Cek duplikat (aktif atau soft-deleted)
        const existing = await this.prisma.role.findFirst({
            where: { name },
            include: { permissions: true },
        });

        if (existing) {
            if (existing.deletedAt === null) {
                throw new Error(
                    `Role with name "${name}" already exists and is active.`
                );
            }

            // Restore dan update
            const updated = await this.prisma.role.update({
                where: { id: existing.id },
                data: {
                    description,
                    isSystem: false,
                    deletedAt: null,
                    updatedAt: new Date(),
                    permissions: {
                        deleteMany: {},
                        create: permissions.map((p) => ({
                            action: p.action,
                            resource: p.resource,
                        })),
                    },
                },
                include: { permissions: true },
            });

            await this.auditService.log({
                userId: createdBy,
                action: "RESTORE_ROLE",
                tableName: "Role",
                recordId: existing.id,
                oldValues: {
                    deletedAt: existing.deletedAt,
                    description: existing.description,
                },
                newValues: { deletedAt: null, description, permissions },
                details: `Role "${name}" restored and updated`,
                ipAddress,
                userAgent,
            });

            return updated;
        }

        // Buat role baru
        const role = await this.prisma.role.create({
            data: {
                name,
                description,
                isSystem: false,
                permissions: {
                    create: permissions.map((p) => ({
                        action: p.action,
                        resource: p.resource,
                    })),
                },
            },
            include: { permissions: true },
        });

        await this.auditService.log({
            userId: createdBy,
            action: "CREATE_ROLE",
            tableName: "Role",
            recordId: role.id,
            newValues: { name, description, permissions },
            details: `Role "${name}" created`,
            ipAddress,
            userAgent,
        });

        return role;
    }

    /**
     * Update role dan permission-nya
     * @param input - Data update
     * @returns Role yang diupdate
     */
    async update(input: UpdateRoleInput) {
        const {
            id,
            name,
            description,
            permissions,
            updatedBy,
            ipAddress,
            userAgent,
        } = input;

        const existingRole = await this.prisma.role.findUnique({
            where: { id },
            include: { permissions: true },
        });

        if (!existingRole) {
            throw new Error("Role not found");
        }

        if (existingRole.isSystem) {
            throw new Error("Cannot modify system role");
        }

        // Cek duplikat nama (kecuali diri sendiri)
        const duplicate = await this.prisma.role.findFirst({
            where: { name, NOT: { id } },
        });
        if (duplicate) {
            throw new Error("Another role with this name already exists");
        }

        const oldValues = {
            name: existingRole.name,
            description: existingRole.description,
            permissions: existingRole.permissions,
        };

        // Update role
        const updatedRole = await this.prisma.role.update({
            where: { id },
            data: { name, description },
        });

        // Ganti permission
        await this.prisma.permission.deleteMany({ where: { roleId: id } });
        if (permissions.length > 0) {
            await this.prisma.permission.createMany({
                data: permissions.map((p) => ({
                    action: p.action,
                    resource: p.resource,
                    roleId: id,
                })),
            });
        }

        await this.auditService.log({
            userId: updatedBy,
            action: "UPDATE_ROLE",
            tableName: "Role",
            recordId: id,
            oldValues,
            newValues: { name, description, permissions },
            details: `Role "${name}" updated`,
            ipAddress,
            userAgent,
        });

        return updatedRole;
    }

    /**
     * Soft delete role
     * @param input - Data delete
     */
    async delete(input: DeleteRoleInput) {
        const { id, deletedBy, ipAddress, userAgent } = input;

        const role = await this.prisma.role.findUnique({
            where: { id },
            include: { users: true },
        });

        if (!role) {
            throw new Error("Role not found");
        }

        if (role.isSystem) {
            throw new Error("Cannot delete system role");
        }

        if (role.users.length > 0) {
            throw new Error("Cannot delete role that is assigned to users");
        }

        await this.prisma.role.update({
            where: { id },
            data: { deletedAt: new Date() },
        });

        await this.auditService.log({
            userId: deletedBy,
            action: "DELETE_ROLE",
            tableName: "Role",
            recordId: id,
            oldValues: { name: role.name, description: role.description },
            details: `Role "${role.name}" deleted`,
            ipAddress,
            userAgent,
        });
    }

    /**
     * Hard delete role (permanen)
     * @param input - Data hard delete
     */
    async hardDelete(input: DeleteRoleInput) {
        const { id, deletedBy, ipAddress, userAgent } = input;

        const role = await this.prisma.role.findUnique({ where: { id } });
        if (!role) {
            throw new Error("Role not found");
        }

        if (role.deletedAt === null) {
            if (role.isSystem) {
                throw new Error("Cannot hard-delete system role.");
            }
            const userCount = await this.prisma.user.count({
                where: { roleId: id, deletedAt: null },
            });
            if (userCount > 0) {
                throw new Error(
                    "Cannot hard-delete role that is assigned to active users."
                );
            }
        }

        await this.prisma.role.delete({ where: { id } });

        await this.auditService.log({
            userId: deletedBy,
            action: "HARD_DELETE_ROLE",
            tableName: "Role",
            recordId: id,
            oldValues: role,
            details: `Role "${role.name}" permanently deleted`,
            ipAddress,
            userAgent,
        });
    }
}
