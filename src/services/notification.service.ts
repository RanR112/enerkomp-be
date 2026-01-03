/**
 * @file NotificationService – Manajemen notifikasi sistem Enerkomp Persada Raya
 * @description
 * Layanan terpusat untuk mengelola:
 * - Notifikasi internal ke pengguna berdasarkan permission
 * - Email notifikasi otomatis
 * - Manajemen status notifikasi (baca/belum baca)
 *
 * @security
 * - Deduplikasi penerima berdasarkan email
 * - Hanya kirim ke user aktif dengan permission yang sesuai
 * - Semua aktivitas tercatat di audit log
 *
 * @usage
 * const notificationService = new NotificationService(prisma, auditService, emailService, emailTemplateService);
 *
 * await notificationService.notifyByPermission('client', 'new_client', {...}, 'clients', clientId);
 *
 * @dependencies
 * - `@prisma/client`
 * - `AuditService`, `EmailService`, `EmailTemplateService`
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { AuditService } from "./audit.service";
import { EmailService } from "./email.service";
import { EmailTemplateService } from "./email/email-template.service";
import {
    NewClientEmailTemplate,
    NewClientData,
} from "./email/email-templates/client.template";

export interface NotificationTemplate {
    title: string;
    message: string;
}

export interface NotificationData {
    [key: string]: any;
}

export class NotificationService {
    private readonly templates: Record<
        string,
        (data: NotificationData) => NotificationTemplate
    > = {
        new_client: (data) => ({
            title: "📩 New Client Message",
            message: `A new message from ${data.name} (${data.email}) via ${data.formType} form.`,
        }),
        visitor_summary: (data) => ({
            title: "📊 Daily Visitor Summary",
            message: `${data.visitor} visitors, ${data.uniqueVisitor} unique, bounce rate: ${data.bounceRate}%`,
        }),
        high_traffic: (data) => ({
            title: "🚀 Traffic Spike Detected",
            message: `Visitor count (+${data.percentIncrease}%) exceeds daily average.`,
        }),
        security_alert: (data) => ({
            title: "⚠️ Security Alert",
            message: `Unusual activity: ${data.event} from ${
                data.country
            } at ${new Date(data.timestamp).toLocaleString()}`,
        }),
        export_ready: (data) => ({
            title: "📤 Export Completed",
            message: `${data.count} ${data.resource} exported successfully.`,
        }),
        new_blog: (data) => ({
            title: "✍️ New Blog Post",
            message: `Blog "${data.title}" has been published by ${data.author}.`,
        }),
        new_product: (data) => ({
            title: "📦 New Product Added",
            message: `Product "${data.name}" (brand: ${data.brand}) is now live.`,
        }),
    };

    constructor(
        private prisma: PrismaClient,
        private auditService: AuditService,
        private emailService: EmailService,
        private emailTemplateService: EmailTemplateService
    ) {}

    /**
     * Kirim notifikasi ke pengguna yang memiliki permission terhadap resource
     * @param resource - Nama resource (misal: 'client', 'product')
     * @param type - Tipe notifikasi
     * @param data - Data untuk template notifikasi
     * @param sourceType - Tipe sumber notifikasi
     * @param sourceId - ID sumber notifikasi (opsional)
     */
    async notifyByPermission(
        resource: string,
        type: string,
        data: NotificationData,
        sourceType: string,
        sourceId?: string
    ): Promise<void> {
        const templateFn = this.templates[type];
        if (!templateFn) {
            console.warn(`No template for notification type: ${type}`);
            return;
        }

        // Cari role yang berwenang
        const roles = await this.prisma.role.findMany({
            where: {
                permissions: {
                    some: {
                        resource,
                        OR: [{ action: "manage" }, { action: "read" }],
                    },
                },
            },
            include: {
                users: {
                    where: { status: "ACTIVE", deletedAt: null },
                    select: { id: true, email: true, name: true },
                },
            },
        });

        // Deduplikasi berdasarkan email
        const recipientMap = new Map<
            string,
            { id: string; email: string; name: string }
        >();
        for (const role of roles) {
            for (const user of role.users) {
                if (!recipientMap.has(user.email)) {
                    recipientMap.set(user.email, user);
                }
            }
        }

        const recipients = Array.from(recipientMap.values());
        if (recipients.length === 0) return;

        const { title, message } = templateFn(data);
        const priority = this.determinePriority(type);

        // Simpan notifikasi ke DB
        const notifications = recipients.map((user) => ({
            userId: user.id,
            type,
            priority,
            title,
            message,
            sourceType,
            sourceId,
            sourceData: data as Prisma.InputJsonValue,
        }));

        await this.prisma.notification.createMany({
            data: notifications,
            skipDuplicates: true,
        });

        // Kirim email (non-blocking)
        this.sendNotificationEmails(recipients, type, data).catch((error) => {
            console.warn("Notification email sending failed:", error);
        });
    }

    /**
     * Tandai notifikasi sebagai sudah dibaca
     * @param id - ID notifikasi
     * @param userId - ID pengguna
     */
    async markAsRead(id: string, userId: string): Promise<void> {
        await this.prisma.notification.update({
            where: { id, userId },
            data: { isRead: true, readAt: new Date() },
        });
    }

    /**
     * Ambil jumlah notifikasi belum dibaca
     * @param userId - ID pengguna
     * @returns Jumlah notifikasi belum dibaca
     */
    async getUnreadCount(userId: string): Promise<number> {
        return this.prisma.notification.count({
            where: { userId, isRead: false },
        });
    }

    /**
     * Ambil daftar notifikasi
     * @param userId - ID pengguna
     * @param page - Nomor halaman
     * @param limit - Jumlah per halaman
     * @returns Data notifikasi dan metadata pagination
     */
    async getNotifications(
        userId: string,
        page: number = 1,
        limit: number = 20
    ) {
        const skip = (page - 1) * limit;

        const [notifications, total] = await Promise.all([
            this.prisma.notification.findMany({
                where: { userId },
                skip,
                take: limit,
                orderBy: { timestamp: "desc" },
            }),
            this.prisma.notification.count({ where: { userId } }),
        ]);

        return {
            notifications,
            meta: {
                total,
                page,
                lastPage: Math.ceil(total / limit),
                perPage: limit,
            },
        };
    }

    /**
     * Kirim email notifikasi untuk klien baru
     * @param client - Data klien
     */
    async notifyNewClientByEmail(client: {
        id: string;
        name: string;
        email: string;
        formType: string;
    }): Promise<void> {
        // Cari role yang berwenang
        const roles = await this.prisma.role.findMany({
            where: {
                permissions: {
                    some: {
                        resource: "client",
                        OR: [{ action: "manage" }, { action: "read" }],
                    },
                },
            },
            include: {
                users: {
                    where: { status: "ACTIVE", deletedAt: null },
                    select: { id: true, email: true, name: true },
                },
            },
        });

        // Deduplikasi berdasarkan email
        const recipientMap = new Map<
            string,
            { id: string; email: string; name: string }
        >();
        for (const role of roles) {
            for (const user of role.users) {
                if (!recipientMap.has(user.email)) {
                    recipientMap.set(user.email, user);
                }
            }
        }

        const recipients = Array.from(recipientMap.values());
        if (recipients.length === 0) return;

        // Kirim email ke setiap penerima
        for (const recipient of recipients) {
            try {
                const template = new NewClientEmailTemplate(
                    this.emailTemplateService
                );
                const NewClientData = {
                    recipientName: recipient.name,
                    clientName: client.name,
                    clientEmail: client.email,
                    formType: client.formType,
                    clientId: client.id,
                };
                const html = template.generate(NewClientData);

                await this.emailService.send({
                    to: recipient.email,
                    subject: "📩 New Client Message",
                    html,
                });

                console.log(`✅ Email sent to: ${recipient.email}`);

                // Audit log
                await this.auditService.log({
                    userId: recipient.id,
                    action: "EMAIL_SENT",
                    tableName: "Client",
                    recordId: client.id,
                    details: `Notification email sent to ${recipient.email} for new client`,
                });
            } catch (error) {
                console.warn(`📧 Email failed for ${recipient.email}:`, error);
            }
        }
    }

    // Helper methods
    private determinePriority(type: string): "low" | "medium" | "high" {
        const high = ["new_client", "security_alert", "high_traffic"];
        const low = ["export_ready"];
        return high.includes(type)
            ? "high"
            : low.includes(type)
            ? "low"
            : "medium";
    }

    private async sendNotificationEmails(
        recipients: { id: string; email: string; name: string }[],
        type: string,
        data: NotificationData
    ): Promise<void> {
        // Implementasi email notifikasi generik di masa depan
        // Saat ini hanya fokus pada notifikasi khusus seperti new client
    }
}
