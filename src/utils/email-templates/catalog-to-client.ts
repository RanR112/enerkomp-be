/**
 * @file CatalogToClient Adapter – Kompatibilitas dengan fungsi lama
 * @description
 * Menyediakan fungsi `catalogToClientEmail()` seperti versi lama.
 */

import { EmailTemplateService } from "../../services/email/email-template.service";
import {
    CatalogToClientEmailTemplate,
    CatalogToClientData,
} from "../../services/email/email-templates/catalog-to-client.template";

const templateService = new EmailTemplateService({
    companyProfileUrl:
        process.env.COMPANY_PROFILE_URL || "https://enerkomp.co.id",
    frontendUrl: process.env.FRONTEND_URL || "https://enerkomp.co.id",
});

const template = new CatalogToClientEmailTemplate(templateService);

export const catalogToClientEmail = (
    clientName: string,
    catalogName: string,
    gdriveLink: string
) => {
    const data: CatalogToClientData = { clientName, catalogName, gdriveLink };
    return template.generate(data);
};
