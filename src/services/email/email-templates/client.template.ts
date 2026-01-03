/**
 * @file NewClientEmailTemplate – Template notifikasi admin untuk pesan klien baru
 * @description
 * Template email internal untuk tim Enerkomp saat ada klien baru mengisi form.
 *
 * @dependencies
 * - `BaseEmailTemplate`
 * - `EmailTemplateService`
 */

import { BaseEmailTemplate } from "./base.template";

export interface NewClientData {
    recipientName: string;
    clientName: string;
    clientEmail: string;
    formType: string;
    clientId: string;
}

export class NewClientEmailTemplate extends BaseEmailTemplate {
    getSubject(): string {
        return "New Client Message";
    }

    getTitle(): string {
        return "📩 New Client Message";
    }

    getContent(data: NewClientData): string {
        return `
    <p>Hello, ${this.escape(data.recipientName)}</p>
    <p>A new message has been submitted via the <strong>${this.escape(
        data.formType
    )}</strong> form:</p>
    <ul>
      <li><strong>Name:</strong> ${this.escape(data.clientName)}</li>
      <li><strong>Email:</strong> <a href="mailto:${this.escape(
          data.clientEmail
      )}">${this.escape(data.clientEmail)}</a></li>
      <li><strong>Form Type:</strong> ${this.escape(data.formType)}</li>
    </ul>
    <p>Please review and respond accordingly.</p>
    `;
    }

    getCta(data: NewClientData): { label: string; url: string } {
        return {
            label: "View in Dashboard",
            url: `${this.templateService.buildUrl(
                `/admin/clients/${data.clientId}`
            )}`,
        };
    }

    getFooterNote(): string | undefined {
        return undefined;
    }

    private escape(str: string): string {
        return str.replace(
            /[<>&"']/g,
            (c) =>
                ({
                    "<": "&lt;",
                    ">": "&gt;",
                    "&": "&amp;",
                    '"': "&quot;",
                    "'": "&#039;",
                }[c] || c)
        );
    }
}
