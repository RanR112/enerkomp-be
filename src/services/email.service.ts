/**
 * @file EmailService – Pengiriman email dengan templating dan konfigurasi fleksibel
 * @description
 * Layanan terpusat untuk mengirim email:
 * - Dukungan transporter (SMTP, SendGrid, dll via adapter)
 * - Format email dengan header tracking
 * - Proteksi terhadap error pengiriman
 *
 * @security
 * - Credential SMTP dari environment (tidak hardcoded)
 * - Header `X-Entity-Ref-ID` untuk audit
 * - Error handling jelas tanpa leak credential
 *
 * @usage
 * const emailService = new EmailService({
 *   host: process.env.SMTP_HOST,
 *   port: parseInt(process.env.SMTP_PORT || '465'),
 *   secure: process.env.SMTP_SECURE === 'true',
 *   auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
 *   from: process.env.EMAIL_FROM || 'noreply@enerkomp.co.id',
 * });
 *
 * await emailService.send({
 *   to: 'user@example.com',
 *   subject: 'Welcome',
 *   html: '<h1>Hello</h1>',
 * });
 *
 * @dependencies
 * - `nodemailer` v6+
 */

import nodemailer, { Transporter, SendMailOptions } from "nodemailer";

export interface EmailAuthConfig {
    user: string;
    pass: string;
}

export interface EmailServiceConfig {
    host: string;
    port: number;
    secure: boolean;
    auth: EmailAuthConfig
    from: string;
}

export class EmailService {
    private transporter: Transporter;
    private defaultFrom: string;

    constructor(config: EmailServiceConfig) {
        this.transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: config.auth,
        });
        this.defaultFrom = `"Enerkomp" <${config.from}>`;
    }

    /**
     * Kirim email dengan opsi lengkap
     * @param options - Opsi pengiriman
     * @throws Error jika pengiriman gagal
     */
    async send(options: {
        to: string | string[];
        subject: string;
        html: string;
        from?: string;
        bcc?: string[];
    }): Promise<void> {
        const mailOptions: SendMailOptions = {
            from: options.from || this.defaultFrom,
            to: options.to,
            bcc: options.bcc,
            subject: options.subject,
            html: options.html,
            headers: {
                "X-Entity-Ref-ID": `email-${Date.now()}`,
            },
        };

        try {
            await this.transporter.sendMail(mailOptions);
        } catch (error) {
            console.error("Email sending failed:", error);
            throw new Error(
                `Failed to send email to ${
                    Array.isArray(options.to)
                        ? options.to.join(", ")
                        : options.to
                }`
            );
        }
    }
}
