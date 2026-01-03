/**
 * @file New Client Email Adapter – Kompatibilitas dengan fungsi lama
 * @description
 * Menyediakan fungsi `newClientEmail()` seperti versi lama,
 * namun di-backup oleh `NewClientEmailTemplate`.
 *
 * @usage
 * import { newClientEmail } from '@/utils/email-templates/client';
 * const html = newClientEmail('Admin', 'John Doe', 'john@example.com', 'Contact', 'cli_123');
 */

import { EmailTemplateService } from "../../services/email/email-template.service";
import {
    NewClientEmailTemplate,
    NewClientData,
} from "../../services/email/email-templates/client.template";

const templateService = new EmailTemplateService({
    companyProfileUrl:
        process.env.COMPANY_PROFILE_URL || "https://enerkomp.co.id",
    frontendUrl: process.env.FRONTEND_URL || "https://enerkomp.co.id",
});

const template = new NewClientEmailTemplate(templateService);

export const newClientEmail = (
    recipientName: string,
    clientName: string,
    clientEmail: string,
    formType: string,
    clientId: string
) => {
    const data: NewClientData = {
        recipientName,
        clientName,
        clientEmail,
        formType,
        clientId,
    };
    return template.generate(data);
};
