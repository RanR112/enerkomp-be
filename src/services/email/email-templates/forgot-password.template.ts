/**
 * @file ForgotPasswordEmailTemplate – Template reset password
 * @description
 * Template untuk email reset password dengan link berlaku 2 menit.
 *
 * @dependencies
 * - `BaseEmailTemplate`
 * - `EmailTemplateService`
 */

import { BaseEmailTemplate } from "./base.template";

export interface ForgotPasswordData {
    resetUrl: string;
}

export class ForgotPasswordEmailTemplate extends BaseEmailTemplate {
    getSubject(): string {
        return "Reset Your Password";
    }

    getTitle(): string {
        return "🔐 Reset Your Password";
    }

    getContent(): string {
        return `
    <p>Hello,</p>
    <p>We received a request to reset your password for Enerkomp.</p>
    <p>Click the button below to create a new password:</p>
    `;
    }

    getCta(data: ForgotPasswordData): { label: string; url: string } {
        return {
            label: "Reset Password",
            url: data.resetUrl,
        };
    }

    getFooterNote(): string {
        return "This link expires in 2 minutes and can only be used once.";
    }
}
