/**
 * @file Konfigurasi aplikasi inti
 * @description
 * Menyediakan nilai konfigurasi yang digunakan di seluruh aplikasi:
 * - Direktori upload
 * - Batas ukuran file (default 2MB)
 *
 * @usage
 * import { appConfig } from '@/config/app.config';
 * const uploadDir = appConfig.uploadDir;
 */

import path from "path";

export interface AppConfig {
    uploadDir: string;
    maxFileSize: number; // dalam byte
    defaultAvatar: string;
}

export const appConfig: AppConfig = {
    uploadDir: process.env.UPLOAD_DIR
        ? path.resolve(process.env.UPLOAD_DIR)
        : path.resolve(__dirname, "../../public/uploads"),

    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || "2097152", 10), // 2MB default
    defaultAvatar: process.env.DEFAULT_AVATAR ?? "/uploads/avatars/default-avatar.png",
};
