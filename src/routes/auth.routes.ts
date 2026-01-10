/**
 * @file Auth Routes – Definisi endpoint API untuk autentikasi dan manajemen sesi
 * @description
 * Routing Express untuk operasi autentikasi pengguna Enerkomp:
 * - Public endpoints: login, refresh, forgot/reset password
 * - Protected endpoints: get profile (/me), logout
 *
 * @security
 * - Hanya endpoint publik yang tidak memerlukan autentikasi
 * - Endpoint /me dan /logout dilindungi oleh middleware authenticate
 * - Semua endpoint menggunakan AuthController class-based
 *
 * @usage
 * const authRouter = makeAuthRouter(authService);
 * app.use('/api/auth', authRouter);
 *
 * @dependencies
 * - `AuthService`
 * - `AuthController`
 * - `AuthMiddleware`
 */

import { Router } from "express";
import { AuthService } from "../services/auth.service";
import { AuthController } from "../controllers/auth.controller";
import { AuthMiddleware } from "../middleware/auth.middleware";

/**
 * Factory function untuk membuat router autentikasi
 * @param authService - Instance AuthService yang sudah di-DI
 * @returns Express Router dengan semua endpoint autentikasi
 */
export function makeAuthRouter(authService: AuthService): Router {
    const router = Router();
    const controller = new AuthController(authService);
    const authMiddleware = new AuthMiddleware(authService);

    // Public endpoints (tidak perlu autentikasi)
    router.post("/login", controller.login);
    router.post("/refresh", controller.refresh);
    router.post("/logout", controller.logout);
    router.post("/forgot-password", controller.forgotPassword);
    router.post("/reset-password", controller.resetPassword);

    // Protected endpoints (memerlukan autentikasi)
    router.use(authMiddleware.authenticate());
    router.get("/me", controller.getMe);
    router.put("/me", controller.updateMe);
    router.patch("/me/avatar", controller.updateOwnAvatar);
    router.delete("/me/avatar", controller.deleteOwnAvatar);

    return router;
}
