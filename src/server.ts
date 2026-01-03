/**
 * @file Server – Entry point aplikasi backend Enerkomp Persada Raya
 * @description
 * Inisialisasi dan konfigurasi server Express:
 * - Setup middleware (CORS, cookie parser, JSON parser)
 * - Dependency injection untuk semua service
 * - Registrasi route dengan factory function
 * - Health check endpoint
 *
 * @security
 * - CORS dikonfigurasi secara ketat berdasarkan environment
 * - Cookie parser untuk autentikasi yang aman
 * - Semua route dilindungi oleh middleware yang sesuai
 *
 * @usage
 * npm run dev
 *
 * @dependencies
 * - express, cors, cookie-parser, dotenv
 * - Semua service yang telah di-refactor ke OOP
 */

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "path";
import { PrismaClient } from "@prisma/client";

// Load environment variables
dotenv.config();

// Import Config
import { appConfig } from "./config/app.config";
import { jwtConfig } from "./config/jwt.config";

// Import services
import { PasswordService } from "./services/password.service";
import { TokenService } from "./services/token.service";
import { FileService } from "./services/file.service";
import { AuditService } from "./services/audit.service";
import { EmailService } from "./services/email.service";
import { TimezoneService } from "./services/timezone.service";
import { UtmService } from "./services/utm.service";
import { SlugService } from "./services/slug.service";
import { SortOrderService } from "./services/sort-order.service";
import { SummaryService } from "./services/reporting/summary.service";
import { ExportService } from "./services/reporting/export.service";
import { EmailTemplateService } from "./services/email/email-template.service";

// Import business services
import { AuthService } from "./services/auth.service";
import { RoleService } from "./services/role.service";
import { UserService } from "./services/user.service";
import { BrandService } from "./services/brand.service";
import { CategoryService } from "./services/category.service";
import { ProductService } from "./services/product.service";
import { GalleryService } from "./services/gallery.service";
import { ClientService } from "./services/client.service";
import { CatalogService } from "./services/catalog.service";
import { BlogService } from "./services/blog.service";
import { NotificationService } from "./services/notification.service";
import { AnalyticsService } from "./services/analytics.service";

// Import middleware
import { AuthMiddleware } from "./middleware/auth.middleware";
import { RequirePermissionMiddleware } from "./middleware/require-permission.middleware";

// Import route factories
import { makeAuthRouter } from "./routes/auth.routes";
import { makeRoleRouter } from "./routes/role.routes";
import { makeUserRouter } from "./routes/user.routes";
import { makeBrandRouter } from "./routes/brand.routes";
import { makeCategoryRouter } from "./routes/category.routes";
import { makeProductRouter } from "./routes/product.routes";
import { makeGalleryRouter } from "./routes/gallery.routes";
import { makeClientRouter } from "./routes/client.routes";
import { makeCatalogRouter } from "./routes/catalog.routes";
import { makeBlogRouter } from "./routes/blog.routes";
import { makeAnalyticsRouter } from "./routes/analytics.routes";
import { makeNotificationRouter } from "./routes/notification.routes";
import { makeAuditLogRouter } from "./routes/audit.routes";

const app = express();
const PORT = process.env.PORT || 3000;

// Setup CORS
const allowedOrigins = process.env.CORS_ORIGINS?.split(",") || [];

app.use(
    cors({
        origin: function (origin, callback) {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error("Not allowed by CORS"));
            }
        },
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "x-api-key",
            "Accept",
            "Origin",
            "X-Requested-With",
            "X-Refresh-Token",
        ],
        credentials: true,
        maxAge: 86400, // 24 hours
        preflightContinue: false,
        optionsSuccessStatus: 200,
    })
);

// Setup middleware
app.use(cookieParser());
app.use(express.json());

// Setup Prisma Client (composition root)
const prisma = new PrismaClient();

// Setup shared services
const passwordService = new PasswordService();
const tokenService = new TokenService({
    accessTokenSecret: jwtConfig.accessTokenSecret,
        refreshTokenSecret: jwtConfig.refreshTokenSecret,
        accessTokenExpiresIn: jwtConfig.accessTokenExpiresIn,
        refreshTokenExpiresIn: jwtConfig.refreshTokenExpiresIn,
});
const fileService = new FileService({
    uploadDir: appConfig.uploadDir,
    maxFileSize: appConfig.maxFileSize,
});
const auditService = new AuditService(prisma);
const emailService = new EmailService({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "465", 10),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || "",
    },
    from: process.env.EMAIL_FROM || "noreply@enerkomp.co.id",
});
const timezoneService = new TimezoneService({
    defaultTimezone: "Asia/Jakarta",
});
const utmService = new UtmService();
const slugService = new SlugService();
const sortOrderService = new SortOrderService(prisma);
const summaryService = new SummaryService();
const exportService = new ExportService(summaryService);
const emailTemplateService = new EmailTemplateService({
    companyProfileUrl:
        process.env.COMPANY_PROFILE_URL || "https://enerkomp.co.id",
    frontendUrl: process.env.FRONTEND_URL || "https://enerkomp.co.id",
});

// Setup business services
const authService = new AuthService(
    prisma,
    passwordService,
    tokenService,
    fileService,
    auditService,
    emailService,
    emailTemplateService,
    timezoneService
);
const roleService = new RoleService(prisma, auditService);
const userService = new UserService(
    prisma,
    passwordService,
    fileService,
    auditService
);
const brandService = new BrandService(
    prisma,
    auditService,
    fileService,
    sortOrderService
);
const categoryService = new CategoryService(prisma, auditService, slugService);
const productService = new ProductService(
    prisma,
    auditService,
    fileService,
    sortOrderService
);
const galleryService = new GalleryService(prisma, auditService, fileService);
const notificationService = new NotificationService(
    prisma,
    auditService,
    emailService,
    emailTemplateService
);
const clientService = new ClientService(
    prisma,
    auditService,
    notificationService,
    emailService,
    emailTemplateService
);
const catalogService = new CatalogService(prisma, auditService, fileService);
const blogService = new BlogService(
    prisma,
    auditService,
    fileService,
    slugService
);
const analyticsService = new AnalyticsService(
    prisma,
    utmService,
    timezoneService
);

// Setup middleware
const authMiddleware = new AuthMiddleware(authService);
const permissionMiddleware = new RequirePermissionMiddleware(roleService);

// Setup routes
app.use("/api/auth", makeAuthRouter(authService));
app.use("/api/roles", makeRoleRouter(roleService, authMiddleware));
app.use(
    "/api/users",
    makeUserRouter(
        userService,
        exportService,
        authMiddleware,
        permissionMiddleware
    )
);
app.use(
    "/api/brands",
    makeBrandRouter(
        brandService,
        slugService,
        sortOrderService,
        exportService,
        authMiddleware,
        permissionMiddleware
    )
);
app.use(
    "/api/categories",
    makeCategoryRouter(
        categoryService,
        slugService,
        authMiddleware,
        permissionMiddleware
    )
);
app.use(
    "/api/products",
    makeProductRouter(
        productService,
        slugService,
        sortOrderService,
        exportService,
        authMiddleware,
        permissionMiddleware
    )
);
app.use(
    "/api/galleries",
    makeGalleryRouter(galleryService, authMiddleware, permissionMiddleware)
);
app.use(
    "/api/clients",
    makeClientRouter(
        clientService,
        notificationService,
        exportService,
        timezoneService,
        authMiddleware,
        permissionMiddleware
    )
);
app.use(
    "/api/catalogs",
    makeCatalogRouter(catalogService, authMiddleware, permissionMiddleware)
);
app.use(
    "/api/blogs",
    makeBlogRouter(
        blogService,
        slugService,
        authMiddleware,
        permissionMiddleware
    )
);
app.use(
    "/api/analytics",
    makeAnalyticsRouter(
        analyticsService,
        utmService,
        timezoneService,
        exportService,
        authMiddleware,
        permissionMiddleware
    )
);
app.use(
    "/api/notifications",
    makeNotificationRouter(notificationService, authMiddleware)
);
app.use(
    "/api/audit-logs",
    makeAuditLogRouter(auditService, authMiddleware, permissionMiddleware)
);

// Static files
app.use("/uploads", express.static(appConfig.uploadDir));

// Health check
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "views", "status.html"));
});

// Error handling middleware
app.use(
    (
        error: any,
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
    ) => {
        console.error("Unhandled error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
);

// Start server
app.listen(PORT, () => {
    console.log(`✅ Server Running on http://localhost:${PORT}`);
});
