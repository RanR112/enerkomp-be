/**
 * @file UserController – Antarmuka HTTP untuk manajemen pengguna
 * @description
 * Controller class-based untuk mengelola operasi pengguna Enerkomp:
 * - CRUD pengguna (termasuk soft/hard delete dan restore)
 * - Manajemen avatar (upload, update)
 * - Ekspor data ke Excel dan PDF
 *
 * @security
 * - Semua endpoint memerlukan autentikasi (req.user tersedia)
 * - Permission checking dilakukan di middleware
 * - Validasi input dasar di level controller
 *
 * @usage
 * const userController = new UserController(userService, exportService);
 * router.get('/users', userController.getUsers);
 *
 * @dependencies
 * - `UserService`, `ExportService`
 * - Express Request/Response
 */

import { Request, Response } from "express";
import { UserStatus } from "@prisma/client";
import { UserService } from "../services/user.service";
import { ExportService } from "../services/reporting/export.service";
import { getClientIp, handleError } from "../utils/http-helper";

export class UserController {
    constructor(
        private userService: UserService,
        private exportService: ExportService
    ) {}

    /**
     * Endpoint: GET /users
     * Ambil daftar pengguna dengan pagination dan pencarian
     */
    getUsers = async (req: Request, res: Response): Promise<void> => {
        try {
            const { deleted, page = "1", limit = "10", search } = req.query;

            const result = await this.userService.list({
                deleted: deleted === "true",
                page: parseInt(page as string, 10),
                limit: parseInt(limit as string, 10),
                search: search ? String(search) : undefined,
            });

            res.status(200).json(result);
        } catch (error) {
            handleError(res, error, "Failed to fetch users");
        }
    };

    /**
     * Endpoint: GET /users/:id
     * Ambil detail pengguna berdasarkan ID
     */
    getUser = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const user = await this.userService.findById(id);

            if (!user) {
                res.status(404).json({ error: "User not found" });
                return;
            }

            res.status(200).json(user);
        } catch (error) {
            handleError(res, error, "Failed to fetch user");
        }
    };

    /**
     * Endpoint: POST /users
     * Buat pengguna baru
     */
    createUser = async (req: Request, res: Response): Promise<void> => {
        try {
            const { name, email, phone, password, roleId, status } = req.body;

            if (!name || !email || !password || !roleId) {
                res.status(400).json({
                    error: "Name, email, password, and role are required",
                });
                return;
            }

            const user = await this.userService.create({
                name,
                email,
                phone,
                password,
                roleId,
                status: status as UserStatus,
                createdBy: req.user!.id,
                ipAddress: getClientIp(req),
                userAgent: req.get("User-Agent") || "",
                avatarFile: req.file,
            });

            res.status(201).json(user);
        } catch (error) {
            handleError(res, error, "Failed to create user", 400);
        }
    };

    /**
     * Endpoint: PUT /users/:id
     * Update pengguna yang sudah ada
     */
    updateUser = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const { name, email, phone, roleId, status } = req.body;

            if (!name || !email || !roleId) {
                res.status(400).json({
                    error: "Name, email, and role are required",
                });
                return;
            }

            const user = await this.userService.update({
                id,
                name,
                email,
                phone,
                roleId,
                status: status as UserStatus,
                updatedBy: req.user!.id,
                ipAddress: getClientIp(req),
                userAgent: req.get("User-Agent") || "",
                avatarFile: req.file,
            });

            res.status(200).json(user);
        } catch (error) {
            handleError(res, error, "Failed to update user", 400);
        }
    };

    /**
     * Endpoint: DELETE /users/:id
     * Soft delete pengguna
     */
    deleteUser = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;

            await this.userService.delete({
                id,
                deletedBy: req.user!.id,
                ipAddress: getClientIp(req),
                userAgent: req.get("User-Agent") || "",
            });

            res.status(200).json({ message: "User deleted successfully" });
        } catch (error) {
            handleError(res, error, "Failed to delete user", 400);
        }
    };

    /**
     * Endpoint: DELETE /users/:id/hard
     * Hard delete pengguna (permanen)
     */
    hardDeleteUser = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;

            await this.userService.hardDelete({
                id,
                deletedBy: req.user!.id,
                ipAddress: getClientIp(req),
                userAgent: req.get("User-Agent") || "",
            });

            res.status(204).end();
        } catch (error) {
            handleError(res, error, "Failed to hard delete user", 400);
        }
    };

    /**
     * Endpoint: PATCH /users/:id/avatar
     * Update avatar pengguna lain
     */
    updateAvatar = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id: targetUserId } = req.params;

            if (!req.file) {
                res.status(400).json({ error: "Avatar file is required" });
                return;
            }

            const avatarUrl = await this.userService.updateAvatar(
                targetUserId,
                req.file,
                req.user!.id,
                getClientIp(req),
                req.get("User-Agent") || ""
            );

            res.status(200).json({
                message: "Avatar updated successfully",
                avatar: avatarUrl,
            });
        } catch (error) {
            handleError(res, error, "Failed to update avatar", 400);
        }
    };

    /**
     * Endpoint: DELETE /users/:id/avatar
     * Hapus avatar pengguna lain
     */
    deleteAvatar = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id: targetUserId } = req.params;

            await this.userService.deleteAvatar(
                targetUserId,
                req.user!.id,
                getClientIp(req),
                req.get("User-Agent") || ""
            );

            res.status(200).json({
                message: "Avatar deleted successfully",
                avatar: "/uploads/avatars/default-avatar.png",
            });
        } catch (error) {
            handleError(res, error, "Failed to delete avatar", 400);
        }
    };

    /**
     * Endpoint: GET /users/export/excel
     * Ekspor data pengguna ke Excel
     */
    exportExcel = async (req: Request, res: Response): Promise<void> => {
        try {
            const users = await this.userService.list({
                deleted: false,
                page: 1,
                limit: 1000, // Ambil semua untuk export
            });

            const rows = (users.data || []).map((item) => ({
                ID: item.id,
                Name: item.name,
                Email: item.email,
                Phone: item.phone,
                Status: item.status,
                Role: item.role?.name || "",
                "Created At": item.createdAt
                    ? item.createdAt.toISOString().split("T")[0]
                    : "",
            }));

            const sheets = [
                {
                    name: "Users",
                    headers: rows.length > 0 ? Object.keys(rows[0]) : [],
                    rows,
                },
            ];

            await this.exportService.toExcel(sheets, "users-report", res);
        } catch (error) {
            handleError(res, error, "Export to Excel failed");
        }
    };

    /**
     * Endpoint: GET /users/export/pdf
     * Ekspor data pengguna ke PDF
     */
    exportPdf = async (req: Request, res: Response): Promise<void> => {
        try {
            const users = await this.userService.list({
                deleted: false,
                page: 1,
                limit: 1000, // Ambil semua untuk export
            });

            const exportData = (users.data || []).map((item) => ({
                Name: item.name,
                Email: item.email,
                Phone: item.phone,
                Status: item.status,
                Role: item.role?.name || "",
                "Created At": item.createdAt
                    ? item.createdAt.toISOString().split("T")[0]
                    : "",
            }));

            this.exportService.toPdf(
                exportData,
                "users-report",
                "User List",
                res
            );
        } catch (error) {
            handleError(res, error, "Export to PDF failed");
        }
    };
}
