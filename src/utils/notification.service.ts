/**
 * @file Notification Service Adapter – Kompatibilitas dengan fungsi lama
 * @description
 * Menyediakan fungsi lama (`notifyByPermission`, `markAsRead`, dll) namun di-backup oleh `NotificationService`.
 */

import { PrismaClient } from "@prisma/client";
import { AuditService } from "../services/audit.service";
import { EmailService } from "../services/email.service";
import { EmailTemplateService } from "../services/email/email-template.service";
import { NotificationService } from "../services/notification.service";

const prisma = new PrismaClient();
const auditService = new AuditService(prisma);
const emailService = new EmailService({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "465"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || "",
    },
    from: process.env.EMAIL_FROM || "noreply@enerkomp.co.id",
});
const emailTemplateService = new EmailTemplateService({
    companyProfileUrl:
        process.env.COMPANY_PROFILE_URL || "https://enerkomp.co.id",
    frontendUrl: process.env.FRONTEND_URL || "https://enerkomp.co.id",
});
const notificationService = new NotificationService(
    prisma,
    auditService,
    emailService,
    emailTemplateService
);

export const notifyByPermission =
    notificationService.notifyByPermission.bind(notificationService);
export const markAsRead =
    notificationService.markAsRead.bind(notificationService);
export const getUnreadCount =
    notificationService.getUnreadCount.bind(notificationService);
export const getNotifications =
    notificationService.getNotifications.bind(notificationService);
export const notifyNewClientByEmail =
    notificationService.notifyNewClientByEmail.bind(notificationService);
