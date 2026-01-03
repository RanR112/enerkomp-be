/**
 * @file RoleController – Antarmuka HTTP untuk manajemen role
 * @description
 * Controller class-based untuk mengelola operasi role melalui API:
 * - List, detail, create, update, delete (soft & hard)
 * - Integrasi otomatis dengan RoleService dan AuditService
 *
 * @security
 * - Semua endpoint memerlukan autentikasi (req.user tersedia)
 * - IP address dan user agent otomatis dilog untuk audit
 * - Validasi input dasar di level controller
 *
 * @usage
 * const roleController = new RoleController(roleService);
 * router.get('/roles', roleController.getRoles.bind(roleController));
 *
 * @dependencies
 * - `RoleService`
 * - Express Request/Response
 */

import { Request, Response } from "express";
import { RoleService } from "../services/role.service";

export class RoleController {
    constructor(private roleService: RoleService) {}

    /**
     * Endpoint: GET /roles
     * Ambil daftar role dengan pagination dan pencarian
     */
    getRoles = async (req: Request, res: Response): Promise<void> => {
        try {
            const { deleted, page = "1", limit = "10", search } = req.query;

            const result = await this.roleService.list({
                deleted: deleted === "true",
                page: parseInt(page as string, 10),
                limit: parseInt(limit as string, 10),
                search: search ? String(search) : undefined,
            });

            res.status(200).json(result);
        } catch (error) {
            this.handleError(res, error, "Failed to fetch roles");
        }
    };

    /**
     * Endpoint: GET /roles/:id
     * Ambil detail role berdasarkan ID
     */
    getRole = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const role = await this.roleService.findById(id);

            if (!role) {
                res.status(404).json({ error: "Role not found" });
                return;
            }

            res.status(200).json(role);
        } catch (error) {
            this.handleError(res, error, "Failed to fetch role");
        }
    };

    /**
     * Endpoint: POST /roles
     * Buat role baru
     */
    createRole = async (req: Request, res: Response): Promise<void> => {
        try {
            const { name, description, permissions } = req.body;

            if (!name || typeof name !== "string" || name.trim().length === 0) {
                res.status(400).json({
                    error: "Role name is required and must be a non-empty string",
                });
                return;
            }

            const role = await this.roleService.create({
                name: name.trim(),
                description: description || null,
                permissions: permissions || [],
                createdBy: req.user!.id,
                ipAddress: req.ip || "",
                userAgent: req.get("User-Agent") || "",
            });

            res.status(201).json(role);
        } catch (error) {
            this.handleError(res, error, "Failed to create role", 400);
        }
    };

    /**
     * Endpoint: PUT /roles/:id
     * Update role yang sudah ada
     */
    updateRole = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const { name, description, permissions } = req.body;

            if (!name || typeof name !== "string" || name.trim().length === 0) {
                res.status(400).json({
                    error: "Role name is required and must be a non-empty string",
                });
                return;
            }

            const updated = await this.roleService.update({
                id,
                name: name.trim(),
                description: description || null,
                permissions: permissions || [],
                updatedBy: req.user!.id,
                ipAddress: req.ip || "",
                userAgent: req.get("User-Agent") || "",
            });

            res.status(200).json(updated);
        } catch (error) {
            this.handleError(res, error, "Failed to update role", 400);
        }
    };

    /**
     * Endpoint: DELETE /roles/:id
     * Soft delete role
     */
    deleteRole = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;

            await this.roleService.delete({
                id,
                deletedBy: req.user!.id,
                ipAddress: req.ip || "",
                userAgent: req.get("User-Agent") || "",
            });

            res.status(200).json({ message: "Role deleted successfully" });
        } catch (error) {
            this.handleError(res, error, "Failed to delete role", 400);
        }
    };

    /**
     * Endpoint: DELETE /roles/:id/hard
     * Hard delete role (permanen)
     */
    hardDeleteRole = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;

            await this.roleService.hardDelete({
                id,
                deletedBy: req.user!.id,
                ipAddress: req.ip || "",
                userAgent: req.get("User-Agent") || "",
            });

            res.status(204).end();
        } catch (error) {
            this.handleError(res, error, "Failed to hard delete role", 400);
        }
    };

    // Helper untuk penanganan error konsisten
    private handleError(
        res: Response,
        error: unknown,
        defaultMessage: string,
        statusCode: number = 500
    ): void {
        const message = error instanceof Error ? error.message : defaultMessage;
        res.status(statusCode).json({ error: message });
    }
}
