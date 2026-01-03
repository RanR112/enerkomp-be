/**
 * @file Forgot Password Email Adapter – Kompatibilitas dengan fungsi lama
 * @description
 * Menyediakan fungsi `forgotPasswordEmail()` seperti versi lama,
 * namun di-backup oleh `ForgotPasswordEmailTemplate`.
 *
 * @usage
 * import { forgotPasswordEmail } from '@/utils/email-templates/forgot-password';
 * const html = forgotPasswordEmail('https://enerkomp.co.id/reset?token=abc');
 */

import { EmailTemplateService } from "../../services/email/email-template.service";
import {
    ForgotPasswordEmailTemplate,
    ForgotPasswordData,
} from "../../services/email/email-templates/forgot-password.template";

const templateService = new EmailTemplateService({
    companyProfileUrl:
        process.env.COMPANY_PROFILE_URL || "https://enerkomp.co.id",
    frontendUrl: process.env.FRONTEND_URL || "https://enerkomp.co.id",
});

const template = new ForgotPasswordEmailTemplate(templateService);

export const forgotPasswordEmail = (resetUrl: string) => {
    const data: ForgotPasswordData = { resetUrl };
    return template.generate(data);
};
