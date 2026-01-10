/**
 * @file AuthController – Antarmuka HTTP untuk operasi autentikasi dan manajemen sesi
 * @description
 * Controller class-based untuk mengelola:
 * - Login, refresh token, logout
 * - Forgot & reset password
 * - Profile management (getMe)
 *
 * @security
 * - Cookie HttpOnly untuk tokens (hindari XSS)
 * - SameSite=none + Secure di production (dukung cross-origin SPA)
 * - Tidak ada kebocoran informasi user existence di forgot password
 * - Throttling 2 menit untuk forgot password
 *
 * @usage
 * const authController = new AuthController(authService);
 * router.post('/login', authController.login);
 *
 * @dependencies
 * - `AuthService`
 * - Express Request/Response
 */

import { Request, Response } from "express";
import { AuthService } from "../services/auth.service";
import { jwtConfig } from "../config/jwt.config";
import { getClientIp, handleError } from "../utils/http-helper";

export class AuthController {
    constructor(private authService: AuthService) {}

    /**
     * Endpoint: POST /login
     * Autentikasi pengguna dan generate access/refresh token
     */
    login = async (req: Request, res: Response): Promise<void> => {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                res.status(400).json({
                    error: "Email and password are required",
                });
                return;
            }

            const ipAddress = getClientIp(req);
            const userAgent = req.get("User-Agent") || "";

            const result = await this.authService.login(
                email,
                password,
                ipAddress,
                userAgent
            );

            this.setAuthCookies(res, result.accessToken, result.refreshToken);

            res.status(200).json({
                message: "Login successful",
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
                user: result.user,
            });
        } catch (error) {
            handleError(res, error, "Authentication failed", 401);
        }
    };

    /**
     * Endpoint: POST /refresh
     * Generate access token baru menggunakan refresh token
     */
    refresh = async (req: Request, res: Response): Promise<void> => {
        try {
            const refreshToken = this.extractRefreshToken(req);
            if (!refreshToken) {
                res.status(400).json({
                    error: "Refresh token required in X-Refresh-Token header or cookie",
                });
                return;
            }

            const ipAddress = getClientIp(req);
            const userAgent = req.get("User-Agent") || "";

            const newAccessToken = await this.authService.refreshAccessToken(
                refreshToken,
                ipAddress,
                userAgent
            );

            res.cookie("access_token", newAccessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "none",
                maxAge: jwtConfig.accessTokenExpiresIn, // 15 menit
            });

            res.status(200).json({ accessToken: newAccessToken });
        } catch (error) {
            handleError(res, error, "Invalid refresh token", 401);
        }
    };

    /**
     * Endpoint: POST /logout
     * Logout pengguna dan revoke semua token
     */
    logout = async (req: Request, res: Response): Promise<void> => {
        try {
            const refreshToken = this.extractRefreshToken(req);
            if (!refreshToken) {
                res.status(400).json({
                    error: "Refresh token required in X-Refresh-Token header or cookie",
                });
                return;
            }

            const ipAddress = getClientIp(req);
            const userAgent = req.get("User-Agent") || "";

            await this.authService.logout(refreshToken, ipAddress, userAgent);

            this.clearAuthCookies(res);

            res.status(200).json({ message: "Logged out successfully" });
        } catch (error) {
            handleError(res, error, "Logout failed", 400);
        }
    };

    /**
     * Endpoint: POST /forgot-password
     * Proses forgot password dengan throttling
     */
    forgotPassword = async (req: Request, res: Response): Promise<void> => {
        try {
            const { email } = req.body;
            if (!email || typeof email !== "string") {
                res.status(400).json({ error: "Email is required" });
                return;
            }

            const ipAddress = getClientIp(req);
            const userAgent = req.get("User-Agent") || "";

            const cooldownStatus = await this.authService.forgotPassword(
                email,
                ipAddress,
                userAgent
            );

            // ✅ Tetap kirim 200 (keamanan: tidak leak info user existence)
            res.status(200).json({
                ...cooldownStatus,
                message:
                    "If your email is registered, you will receive a password reset link.",
            });
        } catch (error) {
            // Log error untuk debugging, tapi respons tetap aman
            console.error("Forgot password error:", error);
            res.status(200).json({
                active: false,
                message:
                    "If your email is registered, you will receive a password reset link.",
            });
        }
    };

    /**
     * Endpoint: POST /reset-password
     * Reset password menggunakan token
     */
    resetPassword = async (req: Request, res: Response): Promise<void> => {
        try {
            const { token, password } = req.body;
            if (!token || !password) {
                res.status(400).json({
                    error: "Token and new password are required",
                });
                return;
            }
            if (password.length < 6) {
                res.status(400).json({
                    error: "Password must be at least 6 characters",
                });
                return;
            }

            const ipAddress = getClientIp(req);
            const userAgent = req.get("User-Agent") || "";

            await this.authService.resetPassword(
                token,
                password,
                ipAddress,
                userAgent
            );

            res.status(200).json({
                message: "Password has been reset successfully",
            });
        } catch (error) {
            handleError(res, error, "Invalid reset token", 400);
        }
    };

    /**
     * Endpoint: GET /me
     * Ambil profil pengguna saat ini
     */
    getMe = async (req: Request, res: Response): Promise<void> => {
        try {
            if (!req.user) {
                res.status(401).json({ error: "Unauthorized" });
                return;
            }

            const user = await this.authService.getMe(req.user.id);
            res.status(200).json(user);
        } catch (error) {
            handleError(res, error, "Failed to fetch user profile", 400);
        }
    };

    /**
     * Endpoint: PUT /me
     * Update profil pengguna saat ini
     */
    updateMe = async (req: Request, res: Response): Promise<void> => {
        try {
            if (!req.user) {
                res.status(401).json({ error: "Unauthorized" });
                return;
            }

            const { name, email, phone } = req.body;

            const ipAddress = getClientIp(req);
            const userAgent = req.get("User-Agent") || "";

            const updatedUser = await this.authService.updateMe(
                req.user.id,
                { name, email, phone },
                ipAddress,
                userAgent
            );

            res.status(200).json({
                message: "Profile updated successfully",
                data: updatedUser,
            });
        } catch (error) {
            handleError(res, error, "Failed to update profile", 400);
        }
    };

    /**
     * Endpoint: PATCH /me/avatar
     * Update avatar pengguna saat ini
     */
    updateOwnAvatar = async (req: Request, res: Response): Promise<void> => {
        try {
            if (!req.user) {
                res.status(401).json({ error: "Unauthorized" });
                return;
            }

            if (!req.file) {
                res.status(400).json({ error: "Avatar file is required" });
                return;
            }

            const avatarUrl = await this.authService.updateOwnAvatar(
                req.user.id,
                req.file,
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
     * Endpoint: DELETE /me/avatar
     * Hapus avatar pengguna saat ini (kembali ke default)
     */
    deleteOwnAvatar = async (req: Request, res: Response): Promise<void> => {
        try {
            if (!req.user) {
                res.status(401).json({ error: "Unauthorized" });
                return;
            }

            await this.authService.deleteOwnAvatar(
                req.user.id,
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

    // Helper methods
    private setAuthCookies(
        res: Response,
        accessToken: string,
        refreshToken: string
    ): void {
        res.cookie("access_token", accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "none",
            maxAge: jwtConfig.accessTokenExpiresIn,
        });

        res.cookie("refresh_token", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "none",
            maxAge: jwtConfig.refreshTokenExpiresIn,
        });
    }

    private clearAuthCookies(res: Response): void {
        res.clearCookie("access_token", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "none",
        });

        res.clearCookie("refresh_token", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "none",
        });
    }

    private extractRefreshToken(req: Request): string | null {
        return (
            req.cookies?.refresh_token ||
            (req.headers["x-refresh-token"] as string | null)
        );
    }
}
