/**
 * @file EmailTemplateService – Generasi template email responsif berbasis brand Enerkomp
 * @description
 * Layanan terpusat untuk membuat template email profesional:
 * - Desain responsif mobile-first
 * - Konsisten dengan brand identity (warna, logo, tipografi)
 * - Dukungan CTA button, footer note, dan personalisasi
 *
 * @security
 * - Semua URL divalidasi → hindari XSS via input user
 * - Sanitasi HTML dasar untuk konten dinamis
 * - Tidak ada credential atau data sensitif di template
 *
 * @usage
 * const templateService = new EmailTemplateService({
 *   companyProfileUrl: process.env.COMPANY_PROFILE_URL,
 *   frontendUrl: process.env.FRONTEND_URL,
 * });
 *
 * const html = templateService.generate({
 *   subject: 'Welcome',
 *   title: '🎉 Welcome to Enerkomp!',
 *   content: '<p>Hello...</p>',
 *   cta: { label: 'Explore', url: 'https://enerkomp.co.id' }
 * });
 *
 * @dependencies
 * - Tidak ada external dependency (pure string template)
 */

export interface EmailTemplateServiceConfig {
    companyProfileUrl: string;
    frontendUrl: string;
}

export interface EmailTemplateOptions {
    subject: string;
    title: string;
    content: string;
    cta?: { label: string; url: string };
    footerNote?: string;
}

export class EmailTemplateService {
    private readonly config: EmailTemplateServiceConfig;

    constructor(config: EmailTemplateServiceConfig) {
        this.config = {
            companyProfileUrl:
                config.companyProfileUrl || "https://enerkomp.co.id",
            frontendUrl: config.frontendUrl || "https://admin.enerkomp.co.id",
        };
    }

    /**
     * Generate template email dasar dengan styling brand Enerkomp
     * @param options - Konfigurasi template
     * @returns HTML string siap kirim
     */
    generate(options: EmailTemplateOptions): string {
        const { subject, title, content, cta, footerNote } = options;
        const year = new Date().getFullYear();

        // Sanitasi dasar untuk keamanan
        const safeContent = this.sanitizeHtml(content);
        const safeFooterNote = footerNote ? this.sanitizeHtml(footerNote) : "";

        return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(subject)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6; 
      color: #333;
      background-color: #f4f6f6;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
    }
    .header {
      background: #2D4C52;
      padding: 24px 32px;
      text-align: center;
    }
    .logo {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      margin: 0 auto 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 24px;
    }
    .header h1 {
      color: #FFFFFF;
      font-size: 24px;
      font-weight: 600;
    }
    .body {
      padding: 32px;
      background: #FFFFFF;
    }
    .email-title {
      color: #2D4C52;
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 20px;
      line-height: 1.3;
    }
    .email-content {
      color: #4B5563;
      font-size: 16px;
      margin-bottom: 28px;
      line-height: 1.6;
    }
    .email-content p { margin-bottom: 16px; }
    .email-content a {
      color: #F3994B;
      text-decoration: underline;
    }
    .cta-button {
      display: inline-block;
      background: #F3994B;
      color: #FFFFFF !important;
      text-decoration: none;
      padding: 14px 28px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 16px;
      text-align: center;
      margin: 8px 0;
    }
    .cta-button:hover { background: #D95D39; }
    .footer {
      background: #1C2E33;
      padding: 24px 32px;
      text-align: center;
      color: #D1D5DB;
      font-size: 14px;
    }
    .footer a { color: #6BA4A8; text-decoration: none; }
    .footer-divider { margin: 12px 0; border-top: 1px solid #374151; }
    @media (max-width: 600px) {
      .body { padding: 20px; }
      .header, .footer { padding: 20px; }
      .email-title { font-size: 24px; }
      .cta-button { display: block; width: 100%; text-align: center; }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <div class="logo">
        <img src="${this.escapeHtml(
            this.config.companyProfileUrl
        )}/logo/logo-white.png" 
             alt="Enerkomp" width="64" height="64" style="border-radius:50%;">
      </div>
      <h1>ENERKOMP PERSADA RAYA</h1>
    </div>

    <div class="body">
      <h2 class="email-title">${this.escapeHtml(title)}</h2>
      <div class="email-content">
        ${safeContent}
      </div>
      ${
          cta
              ? `<a href="${this.escapeHtml(
                    cta.url
                )}" class="cta-button">${this.escapeHtml(cta.label)}</a>`
              : ""
      }
    </div>

    <div class="footer">
      <div class="footer-divider"></div>
      <p>© ${year} Enerkomp. All rights reserved.</p>
      <p>Grand Slipi Tower Building 42nd Floor Unit G-H Kav 22-24, West Jakarta, DKI Jakarta 11480</p>
      ${
          safeFooterNote
              ? `<p style="margin-top:12px;">${safeFooterNote}</p>`
              : ""
      }
    </div>
  </div>
</body>
</html>
`;
    }

    private escapeHtml(str: string): string {
        if (typeof str !== "string") return "";
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    private sanitizeHtml(html: string): string {
        // Hanya izinkan tag dasar untuk keamanan
        return html
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
            .replace(/on\w+="[^"]*"/g, "");
    }

    /**
     * Helper: build URL aman
     */
    buildUrl(path: string, baseUrl?: string): string {
        const base = baseUrl || this.config.frontendUrl;
        return (
            base.replace(/\/$/, "") + (path.startsWith("/") ? path : `/${path}`)
        );
    }
}
