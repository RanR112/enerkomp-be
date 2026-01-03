/**
 * @file Upload Adapter - Kompatibilitas dengan kode lama berbasis middleware
 * @description
 * File ini berisi export middleware multer (`uploadUserAvatar`, `uploadBrandLogo`, dll)
 * yang kompatibel dengan struktur lama, namun di-backup oleh `FileService` versi OOP.
 *
 * Tujuan: memungkinkan refactoring bertahap tanpa mengubah controller yang sudah ada.
 *
 * @usage
 * import { uploadBrandLogo } from '@/utils/upload';
 *
 * router.post('/brands', uploadBrandLogo, brandController.create);
 *
 * @note
 * Setelah semua controller dimigrasi ke `FileService.uploadSingle()`, file ini bisa dihapus.
 */

import { appConfig } from "../config/app.config";
import { FileService } from "../services/file.service";

const fileService = new FileService({
    uploadDir: appConfig.uploadDir,
    maxFileSize: appConfig.maxFileSize,
});

export const uploadUserAvatar = fileService.createMulterMiddleware({
    type: "user",
    fieldName: "avatar",
});

export const uploadBrandLogo = fileService.createMulterMiddleware({
    type: "brand",
    fieldName: "logo",
});

export const uploadBlogImage = fileService.createMulterMiddleware({
    type: "blog",
    fieldName: "image",
});

export const uploadProductImages = fileService.createMulterMiddleware({
    type: "product",
    fieldName: "images",
    maxCount: 10,
});

export const uploadGalleryImage = fileService.createMulterMiddleware({
    type: "gallery",
    fieldName: "image",
    maxSize: 5 * 1024 * 1024,
});

export const deleteUploadedFile = (
    filePath: string | null | undefined
): void => {
    fileService.deleteFile(filePath);
};

export const getPublicUrl = (filePath: string): string => {
    return fileService.getPublicUrl(filePath);
};
