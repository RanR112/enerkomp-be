/**
 * @file FeedbackToClientEmailTemplate – Template balasan otomatis ke klien
 * @description
 * Template untuk mengonfirmasi penerimaan pesan klien dan memberi ekspektasi respons.
 *
 * @dependencies
 * - `BaseEmailTemplate`
 * - `EmailTemplateService`
 */

import { BaseEmailTemplate } from "./base.template";

export interface FeedbackToClientData {
    clientName: string;
    company?: string;
    clientMessage: string;
    agentName?: string;
}

export class FeedbackToClientEmailTemplate extends BaseEmailTemplate {
    getSubject(data: FeedbackToClientData): string {
        return data.company
            ? `Re: Inquiry from ${data.company}`
            : "Re: Your Inquiry to Enerkomp";
    }

    getTitle(): string {
        return "Thank You for Your Message!";
    }

    getContent(data: FeedbackToClientData): string {
        const companyDisplay = data.company || "your organization";
        const messageQuote = this.escape(data.clientMessage)
            .replace(/\n/g, "<br>")
            .replace(/  /g, "&nbsp;&nbsp;");

        const agentSection = data.agentName
            ? `<p><strong>Handled by:</strong> ${this.escape(
                  data.agentName
              )}<br>
         <em>Customer Support Team, Enerkomp</em></p>`
            : `<p>If you have urgent questions, feel free to reply to this email.</p>`;

        return `
    <p>Hello ${this.escape(data.clientName)},</p>
    <p>Thank you for reaching out to Enerkomp. We’ve received your message from <strong>${this.escape(
        companyDisplay
    )}</strong>:</p>
    <blockquote style="border-left: 3px solid #F3994B; padding-left: 16px; margin: 16px 0; color: #4B5563; font-style: italic;">
      “${messageQuote}”
    </blockquote>
    <p>Our team is reviewing your inquiry and will get back to you shortly.</p>
    ${agentSection}
    <p>Best regards,<br>
    <strong>The Enerkomp Team</strong></p>
    `;
    }

    getCta(): { label: string; url: string } {
        return {
            label: "Visit Our Website",
            url: this.templateService.buildUrl("", "https://enerkomp.co.id"),
        };
    }

    getFooterNote(): string | undefined {
        return undefined;
    }

    private escape(str: string): string {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}
