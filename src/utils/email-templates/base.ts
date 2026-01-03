/**
 * @file Base Email Template Adapter – Kompatibilitas dengan fungsi lama
 * @description
 * Menyediakan fungsi `generateEmailTemplate()` seperti versi lama,
 * namun di-backup oleh `EmailTemplateService`.
 */

import { EmailTemplateService } from "../../services/email/email-template.service";

const templateService = new EmailTemplateService({
    companyProfileUrl:
        process.env.COMPANY_PROFILE_URL || "https://enerkomp.co.id",
    frontendUrl: process.env.FRONTEND_URL || "https://enerkomp.co.id",
});

export const generateEmailTemplate = (
    subject: string,
    title: string,
    content: string,
    cta?: { label: string; url: string },
    footerNote?: string
): string => {
    return templateService.generate({
        subject,
        title,
        content,
        cta,
        footerNote,
    });
};
