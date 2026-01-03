/**
 * @file Feedback to Client Email Adapter – Kompatibilitas dengan fungsi lama
 * @description
 * Menyediakan fungsi `feedbackToClientEmail()` seperti versi lama,
 * namun di-backup oleh `FeedbackToClientEmailTemplate`.
 *
 * @usage
 * import { feedbackToClientEmail } from '@/utils/email-templates/feedback-to-client';
 * const html = feedbackToClientEmail('John', 'PT ABC', 'Hello, I need help...');
 */

import { EmailTemplateService } from "../../services/email/email-template.service";
import {
    FeedbackToClientEmailTemplate,
    FeedbackToClientData,
} from "../../services/email/email-templates/feedback-to-client.template";

const templateService = new EmailTemplateService({
    companyProfileUrl:
        process.env.COMPANY_PROFILE_URL || "https://enerkomp.co.id",
    frontendUrl: process.env.FRONTEND_URL || "https://enerkomp.co.id",
});

const template = new FeedbackToClientEmailTemplate(templateService);

export const feedbackToClientEmail = (
    clientName: string,
    company: string,
    clientMessage: string,
    agentName?: string
) => {
    const data: FeedbackToClientData = {
        clientName,
        company,
        clientMessage,
        agentName,
    };
    return template.generate(data);
};
