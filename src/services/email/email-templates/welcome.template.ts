/**
 * @file WelcomeEmailTemplate – Template sambutan untuk user baru
 * @description
 * Template untuk menyambut user baru (admin/petugas) ke sistem Enerkomp.
 *
 * @dependencies
 * - `BaseEmailTemplate`
 * - `EmailTemplateService`
 */

import { BaseEmailTemplate } from "./base.template";

export interface WelcomeData {
    userName: string;
}

export class WelcomeEmailTemplate extends BaseEmailTemplate {
    getSubject(): string {
        return "Welcome to Enerkomp";
    }

    getTitle(data: WelcomeData): string {
        return `🎉 Welcome to Enerkomp!`;
    }

    getContent(data: WelcomeData): string {
        return `
    <p>Hello ${this.escape(data.userName)},</p>
    <p>Thank you for joining Enerkomp — your trusted partner in energy solutions.</p>
    <p>We're excited to support your business with reliable products and exceptional service.</p>
    <p>If you have any questions, feel free to contact us.</p>
    `;
    }

    getCta(): { label: string; url: string } {
        return {
            label: "Explore Our Products",
            url: this.templateService.buildUrl("/products"),
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
