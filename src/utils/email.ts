/**
 * @file Email Adapter – Kompatibilitas dengan fungsi lama
 * @description
 * Menyediakan fungsi `sendTemplatedEmail()` seperti versi lama,
 * namun di-backup oleh `EmailService`.
 *
 * @usage
 * import { sendTemplatedEmail } from '@/utils/email';
 * await sendTemplatedEmail('user@example.com', 'Subject', '<h1>Body</h1>');
 */

import dotenv from "dotenv";
import { EmailService } from "../services/email.service";

dotenv.config();

const emailService = new EmailService({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "465", 10),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || "",
    },
    from: process.env.EMAIL_FROM || "noreply@enerkomp.co.id",
});

export const sendTemplatedEmail = async (
    to: string | string[],
    subject: string,
    html: string,
    bcc?: string[]
): Promise<void> => {
    await emailService.send({ to, subject, html, bcc });
};
