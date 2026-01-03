/**
 * @file FileService – Manajemen upload, penyimpanan, dan penghapusan file secara aman
 * @description
 * Layanan terpusat untuk menangani operasi file:
 * - Upload gambar dengan validasi tipe, ukuran (maks 2MB default), dan sanitasi path
 * - Generate nama file unik dan struktur folder berbasis fitur (user, brand, blog, dll)
 * - Hapus file secara aman (hindari path traversal & proteksi file default seperti avatar)
 * - Kompatibel dengan multer middleware untuk integrasi tanpa ubah kode lama
 *
 * @security
 * - Batas ukuran file: 2MB (default), bisa di-override per fitur (e.g., gallery = 5MB)
 * - Hanya terima MIME type `image/*` (JPEG, PNG, JPG, GIF, dll)
 * - Path sanitization ketat via `SanitizedPath` class (blokir `../`, absolute path, dll)
 * - Tidak bisa hapus file di luar direktori `public/uploads/`
 * - Default avatar dilindungi dari penghapusan
 *
 * @usage
 * // 1. Inisialisasi (biasanya di composition root)
 * const fileService = new FileService(appConfig);
 *
 * // 2. Upload single file di controller
 * const logo = await fileService.uploadSingle(req, res, {
 *   type: 'brand',
 *   fieldName: 'logo'
 * });
 *
 * // 3. Hapus file lama saat update
 * fileService.deleteFile(user.avatarUrl);
 *
 * @dependencies
 * - `multer` v1.x+ untuk handling multipart/form-data
 * - `fs`, `path` dari Node.js core
 * - `AppConfig` (dari `src/config/app.config.ts`) untuk:
 *     - `uploadDir`: direktori penyimpanan (default: `./public/uploads`)
 *     - `maxFileSize`: batas ukuran dalam byte (default: 2_097_152 = 2MB)
 */

import { Request, Response, NextFunction } from "express";
import multer, { FileFilterCallback, StorageEngine } from "multer";
import path from "path";
import fs from "fs";
import { AppConfig } from "../config/app.config";

// ─── Types ───────────────────────────────────────────────────────────────
export type UploadType = "user" | "brand" | "blog" | "product" | "gallery";

export interface UploadOptions {
    type: UploadType;
    fieldName: string;
    maxCount?: number;
    maxSize?: number;
}

export interface UploadedFile {
    filename: string;
    path: string;
    publicUrl: string;
    mimetype: string;
    size: number;
}

// ─── Sanitized Path (untuk keamanan) ─────────────────────────────────────
class SanitizedPath {
    private readonly _absolute: string;
    private readonly _relative: string;

    constructor(baseDir: string, userPath: string) {
        const resolved = path.resolve(
            baseDir,
            userPath.replace(/^\/?uploads\//, "")
        );
        const safeBase = path.resolve(baseDir);

        if (!resolved.startsWith(safeBase)) {
            throw new Error(
                "Security error: Invalid file path (path traversal attempt)"
            );
        }

        this._absolute = resolved;
        this._relative = path.relative(safeBase, resolved).replace(/\\/g, "/");
    }

    get absolute(): string {
        return this._absolute;
    }
    get relative(): string {
        return this._relative;
    }
    get publicUrl(): string {
        return `/uploads/${this._relative}`;
    }
}

// ─── FileService: OOP, reusable, testable ────────────────────────────────
export class FileService {
    private readonly uploadBase: string;

    constructor(
        private config: Pick<AppConfig, "uploadDir" | "maxFileSize">,
        private fsModule: typeof fs = fs,
        private pathModule: typeof path = path
    ) {
        this.uploadBase = path.resolve(config.uploadDir);
        this.ensureDir(this.uploadBase);
    }

    uploadSingle(
        req: Request,
        res: Response,
        options: Omit<UploadOptions, "maxCount">
    ): Promise<UploadedFile | null> {
        return this.upload(req, res, { ...options, maxCount: 1 }).then(
            (files) => files[0] || null
        );
    }

    uploadMultiple(
        req: Request,
        res: Response,
        options: UploadOptions
    ): Promise<UploadedFile[]> {
        return this.upload(req, res, options);
    }

    /**
     * Hapus file secara aman
     * - Hindari path traversal
     * - Lindungi file default (e.g., default-avatar.png)
     * - Fail-silent jika file tidak ditemukan
     */
    deleteFile(filePath: string | null | undefined): void {
        if (!filePath || typeof filePath !== "string") return;

        // Lindungi default avatar
        if (filePath.includes("default-avatar.png")) return;

        try {
            const safePath = new SanitizedPath(this.uploadBase, filePath);
            if (this.fsModule.existsSync(safePath.absolute)) {
                this.fsModule.unlinkSync(safePath.absolute);
            }
        } catch (error) {
            console.warn("Failed to delete file:", filePath, error);
        }
    }

    getPublicUrl(filePath: string): string {
        try {
            return new SanitizedPath(this.uploadBase, filePath).publicUrl;
        } catch {
            return `/uploads/${filePath.replace(/^\/?uploads\//, "")}`;
        }
    }

    createMulterMiddleware(
        options: UploadOptions
    ): (req: Request, res: Response, next: NextFunction) => void {
        const storage = this.createStorageEngine(options.type);
        const maxSize = options.maxSize ?? this.config.maxFileSize;

        const upload =
            options.maxCount === 1 || !options.maxCount
                ? multer({
                      storage,
                      fileFilter: this.imageFileFilter,
                      limits: { fileSize: maxSize },
                  }).single(options.fieldName)
                : multer({
                      storage,
                      fileFilter: this.imageFileFilter,
                      limits: { fileSize: maxSize },
                  }).array(options.fieldName, options.maxCount);

        return (req, res, next) => {
            upload(req, res, (err) => {
                if (err instanceof multer.MulterError) {
                    if (err.code === "LIMIT_FILE_SIZE") {
                        return res
                            .status(400)
                            .json({
                                error: `File too large. Max size: ${
                                    maxSize / 1024 / 1024
                                }MB`,
                            });
                    }
                }
                if (err) {
                    return res
                        .status(400)
                        .json({ error: err.message || "Upload failed" });
                }
                next();
            });
        };
    }

    private async upload(
        req: Request,
        res: Response,
        options: UploadOptions
    ): Promise<UploadedFile[]> {
        return new Promise((resolve) => {
            const middleware = this.createMulterMiddleware(options);
            middleware(req, res, () => {
                const files = this.extractFiles(req, options);
                resolve(files);
            });
        });
    }

    private extractFiles(
        req: Express.Request,
        options: UploadOptions
    ): UploadedFile[] {
        const field = req.files || (req as any)[options.fieldName];
        if (!field) return [];
        const files = Array.isArray(field) ? field : [field];
        return files.map((file) => ({
            filename: file.filename,
            path: this.buildRelativePath(options.type, file.filename),
            publicUrl: this.getPublicUrl(
                this.buildRelativePath(options.type, file.filename)
            ),
            mimetype: file.mimetype,
            size: file.size,
        }));
    }

    private createStorageEngine(type: UploadType): StorageEngine {
        const uploadDir = this.getUploadDir(type);
        return multer.diskStorage({
            destination: (req, file, cb) => cb(null, uploadDir),
            filename: (req, file, cb) =>
                cb(null, this.generateFilename(type, file.originalname)),
        });
    }

    private getUploadDir(type: UploadType): string {
        const dirMap: Record<UploadType, string> = {
            user: "avatars",
            brand: "brands",
            blog: "blogs",
            product: "products",
            gallery: "galleries",
        };
        const dir = path.join(this.uploadBase, dirMap[type]);
        this.ensureDir(dir);
        return dir;
    }

    private generateFilename(type: UploadType, originalName: string): string {
        const timestamp = Date.now();
        const random = Math.round(Math.random() * 1e9);
        const ext = path.extname(originalName).toLowerCase();
        const prefix = type === "user" ? "avatar" : type;
        return `${prefix}-${timestamp}-${random}${ext}`;
    }

    private imageFileFilter(
        req: Express.Request,
        file: Express.Multer.File,
        cb: FileFilterCallback
    ): void {
        if (file.mimetype.startsWith("image/")) {
            cb(null, true);
        } else {
            cb(
                new Error(
                    "Only image files (JPEG, PNG, JPG, etc.) are allowed!"
                )
            );
        }
    }

    private ensureDir(dir: string): void {
        if (!this.fsModule.existsSync(dir)) {
            this.fsModule.mkdirSync(dir, { recursive: true });
        }
    }

    private buildRelativePath(type: UploadType, filename: string): string {
        const dirMap: Record<UploadType, string> = {
            user: "avatars",
            brand: "brands",
            blog: "blogs",
            product: "products",
            gallery: "galleries",
        };
        return `uploads/${dirMap[type]}/${filename}`;
    }
}
