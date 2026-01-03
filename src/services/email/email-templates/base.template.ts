/**
 * @file BaseEmailTemplate – Template dasar untuk semua email Enerkomp
 * @description
 * Template abstrak yang menyediakan struktur dasar.
 * Template spesifik mewarisi dan mengimplementasikan `buildContent()`.
 *
 * @dependencies
 * - `EmailTemplateService`
 */

import { EmailTemplateService } from "../email-template.service";

export abstract class BaseEmailTemplate {
    constructor(protected templateService: EmailTemplateService) {}

    abstract getSubject(data: any): string;
    abstract getTitle(data: any): string;
    abstract getContent(data: any): string;
    abstract getCta(data: any): { label: string; url: string } | undefined;
    abstract getFooterNote(data: any): string | undefined;

    generate(data: any): string {
        return this.templateService.generate({
            subject: this.getSubject(data),
            title: this.getTitle(data),
            content: this.getContent(data),
            cta: this.getCta(data),
            footerNote: this.getFooterNote(data),
        });
    }
}
