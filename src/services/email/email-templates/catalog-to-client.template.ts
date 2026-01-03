/**
 * @file CatalogToClientEmailTemplate – Template email pengiriman katalog ke klien
 * @description
 * Template untuk mengirim link Google Drive katalog setelah permintaan klien.
 *
 * @dependencies
 * - `BaseEmailTemplate`
 * - `EmailTemplateService`
 */

import { BaseEmailTemplate } from "./base.template";

export interface CatalogToClientData {
    clientName: string;
    catalogName: string;
    gdriveLink: string;
}

export class CatalogToClientEmailTemplate extends BaseEmailTemplate {
    getSubject(): string {
        return "Your Enerkomp Catalog";
    }

    getTitle(data: CatalogToClientData): string {
        return `📁 Your Requested Catalog: ${data.catalogName}`;
    }

    getContent(data: CatalogToClientData): string {
        return `
    <p>Hello ${this.escape(data.clientName)},</p>
    <p>Thank you for your interest in Enerkomp products.</p>
    <p>As requested, here is the link to download our latest catalog:</p>
    <div style="background: #F4F6F6; padding: 16px; border-radius: 6px; margin: 16px 0; text-align: center;">
      <div style="font-size: 24px; margin-bottom: 8px;">📁</div>
      <strong>${data.catalogName}</strong><br>
      <small>(Google Drive)</small>
    </div>
    <p>Click the button below to access the catalog:</p>
    `;
    }

    getCta(data: CatalogToClientData): { label: string; url: string } {
        return {
            label: "Download Catalog",
            url: data.gdriveLink,
        };
    }

    getFooterNote(data: CatalogToClientData): string {
        return `
    ⚠️ <strong>Note:</strong> If the link doesn't work, please copy and paste it into your browser:<br>
    <code style="background: #E5E7EB; padding: 2px 6px; border-radius: 4px; word-break: break-all;">
      ${this.escape(data.gdriveLink)}
    </code>
    `;
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
