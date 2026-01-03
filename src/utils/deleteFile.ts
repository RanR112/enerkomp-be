/**
 * @file DeleteFile Adapter – Kompatibilitas dengan fungsi lama
 * @description
 * Menyediakan fungsi `deleteFile()` seperti versi lama,
 * namun di-backup oleh `FileService`.
 *
 * @usage
 * import { deleteFile } from '@/utils/deleteFile';
 * deleteFile('/uploads/brands/logo-123.jpg');
 */

import { appConfig } from "../config/app.config";
import { FileService } from "../services/file.service";

const fileService = new FileService({
    uploadDir: appConfig.uploadDir,
    maxFileSize: appConfig.maxFileSize,
});

export const deleteFile = (filePath: string): void => {
    fileService.deleteFile(filePath);
};
