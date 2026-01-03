/**
 * @file Welcome Email Adapter – Kompatibilitas dengan fungsi lama
 * @description
 * Menyediakan fungsi `welcomeEmail()` seperti versi lama,
 * namun di-backup oleh `WelcomeEmailTemplate`.
 *
 * @usage
 * import { welcomeEmail } from '@/utils/email-templates/welcome';
 * const html = welcomeEmail('Admin');
 */

import { EmailTemplateService } from "../../services/email/email-template.service";
import {
    WelcomeEmailTemplate,
    WelcomeData,
} from "../../services/email/email-templates/welcome.template";

const templateService = new EmailTemplateService({
    companyProfileUrl:
        process.env.COMPANY_PROFILE_URL || "https://enerkomp.co.id",
    frontendUrl: process.env.FRONTEND_URL || "https://enerkomp.co.id",
});

const template = new WelcomeEmailTemplate(templateService);

export const welcomeEmail = (userName: string) => {
    const data: WelcomeData = { userName };
    return template.generate(data);
};
