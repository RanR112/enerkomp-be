/**
 * @file ClientService – Manajemen klien dan formulir kontak Enerkomp Persada Raya
 * @description
 * Layanan terpusat untuk mengelola:
 * - Formulir kontak dari website (CONTACT & CATALOG)
 * - Auto-email ke klien berdasarkan tipe formulir
 * - Notifikasi internal ke tim Enerkomp
 * - Integrasi audit log untuk semua operasi
 *
 * @security
 * - Validasi tipe formulir (hanya CONTACT/CATALOG)
 * - Validasi katalog hanya untuk tipe CATALOG
 * - Error email tidak menghentikan proses utama (non-blocking)
 *
 * @usage
 * const clientService = new ClientService(
 *   prisma, auditService, notificationService, emailService, emailTemplateService
 * );
 *
 * const result = await clientService.create({
 *   name: 'John Doe',
 *   email: 'john@example.com',
 *   formType: 'CONTACT',
 *   createdBy: 'usr_123'
 * });
 *
 * @dependencies
 * - `@prisma/client`
 * - `AuditService`, `NotificationService`
 * - `EmailService`, `EmailTemplateService`
 */

import { PrismaClient, Client, FormType } from "@prisma/client";
import { AuditService } from "./audit.service";
import { NotificationService } from "./notification.service";
import { EmailService } from "./email.service";
import { EmailTemplateService } from "./email/email-template.service";
import {
    FeedbackToClientEmailTemplate,
    FeedbackToClientData,
} from "./email/email-templates/feedback-to-client.template";
import {
    CatalogToClientEmailTemplate,
    CatalogToClientData,
} from "./email/email-templates/catalog-to-client.template";

export interface CreateClientInput {
    company: string;
    address: string;
    country: string;
    name: string;
    phone: string;
    email: string;
    fax?: string | null;
    message: string;
    catalogId?: string | null;
    formType: FormType;
    source?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
}

export interface UpdateClientInput {
    id: string;
    company?: string;
    address?: string;
    country?: string;
    name?: string;
    phone?: string;
    email?: string;
    fax?: string | null;
    message?: string;
    formType?: FormType;
    catalogId?: string | null;
    isReplied?: boolean;
    repliedBy?: string | null;
    updatedBy: string;
    ipAddress?: string;
    userAgent?: string;
}

export interface DeleteClientInput {
    id: string;
    deletedBy: string;
    ipAddress?: string;
    userAgent?: string;
}

export class ClientService {
    constructor(
        private prisma: PrismaClient,
        private auditService: AuditService,
        private notificationService: NotificationService,
        private emailService: EmailService,
        private emailTemplateService: EmailTemplateService
    ) {}

    /**
     * Ambil daftar klien dengan pagination dan filter
     * @param options - Filter dan pagination options
     * @returns Data klien dan metadata pagination
     */
    async list(
        options: {
            deleted?: boolean;
            page?: number;
            limit?: number;
            formType?: FormType;
            isReplied?: boolean;
            search?: string;
        } = {}
    ) {
        const {
            deleted = false,
            page = 1,
            limit = 10,
            formType,
            isReplied,
            search,
        } = options;
        const skip = (page - 1) * limit;

        const where: any = {
            deletedAt: deleted ? { not: null } : null,
        };

        if (formType) {
            where.formType = formType;
        }

        if (isReplied !== undefined) {
            where.isReplied = isReplied;
        }

        if (search) {
            where.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { company: { contains: search, mode: "insensitive" } },
                { message: { contains: search, mode: "insensitive" } },
            ];
        }

        const [clients, total] = await Promise.all([
            this.prisma.client.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                include: {
                    repliedByUser: {
                        select: { id: true, name: true, email: true },
                    },
                },
            }),
            this.prisma.client.count({ where }),
        ]);

        return {
            data: clients,
            meta: {
                total,
                page,
                lastPage: Math.ceil(total / limit),
                perPage: limit,
                formType: formType || null,
                isReplied: isReplied !== undefined ? isReplied : null,
                search: search || null,
            },
        };
    }

    /**
     * Ambil klien berdasarkan ID
     * @param id - ID klien
     * @returns Klien dengan informasi repliedByUser
     */
    async findById(id: string) {
        return this.prisma.client.findUnique({
            where: { id, deletedAt: null },
            include: {
                repliedByUser: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
    }

    /**
     * Buat klien baru dari formulir website
     * @param input - Data klien
     * @returns Klien yang dibuat dan status pengiriman email
     */
    async create(
        input: CreateClientInput
    ): Promise<{ client: Client; emailSent: boolean }> {
        const client = await this.prisma.client.create({
            data: {
                company: input.company,
                address: input.address,
                country: input.country,
                name: input.name,
                phone: input.phone,
                email: input.email,
                fax: input.fax || undefined,
                message: input.message,
                catalogId: input.catalogId || undefined,
                formType: input.formType,
                source: input.source || undefined,
                ipAddress: input.ipAddress || undefined,
                userAgent: input.userAgent || undefined,
                isReplied: input.formType === "CATALOG",
                repliedAt: input.formType === "CATALOG" ? new Date() : null,
            },
        });

        // Notifikasi internal ke tim
        await this.notificationService.notifyByPermission(
            "client",
            "new_client",
            {
                name: client.name,
                email: client.email,
                formType: client.formType,
            },
            "clients",
            client.id
        );

        let emailSent = true;

        try {
            await this.sendAutoEmail(client);
            console.log(
                `✅ Auto-email sent to client: ${client.email} (${client.formType})`
            );
        } catch (error) {
            emailSent = false;
            console.warn("Client auto-email failed (non-blocking):", error);
        }

        // Audit log
        await this.auditService.log({
            action: "CREATE_CLIENT",
            tableName: "Client",
            recordId: client.id,
            newValues: { ...input, id: client.id },
            details: `New client form submitted (${input.formType})`,
            ipAddress: input.ipAddress || undefined,
            userAgent: input.userAgent || undefined,
        });

        return { client, emailSent };
    }

    /**
     * Update klien yang sudah ada
     * @param input - Data update
     * @returns Klien yang diupdate
     */
    async update(input: UpdateClientInput) {
        const {
            id,
            company,
            address,
            country,
            name,
            phone,
            email,
            fax,
            message,
            formType,
            catalogId,
            isReplied,
            repliedBy,
            updatedBy,
            ipAddress,
            userAgent,
        } = input;

        const existing = await this.prisma.client.findUnique({
            where: { id, deletedAt: null },
        });

        if (!existing) {
            throw new Error("Client not found");
        }

        // Validasi formType
        if (formType && !["CATALOG", "CONTACT"].includes(formType)) {
            throw new Error(
                "Invalid formType. Only CATALOG or CONTACT allowed."
            );
        }

        // Validasi catalogId hanya untuk CATALOG
        if (
            (formType === "CATALOG" || existing.formType === "CATALOG") &&
            catalogId
        ) {
            const catalogExists = await this.prisma.catalog.findUnique({
                where: { id: catalogId },
            });

            if (!catalogExists) {
                throw new Error("Catalog not found");
            }
        }

        // Handle status replied
        let repliedAt: Date | null = existing.repliedAt;
        let repliedByUser = existing.repliedBy;

        if (isReplied === true && !existing.isReplied) {
            repliedAt = new Date();
            repliedByUser = repliedBy || updatedBy;
        }

        if (isReplied === false) {
            repliedAt = null;
            repliedByUser = null;
        }

        const updatedClient = await this.prisma.client.update({
            where: { id },
            data: {
                company: company ?? existing.company,
                address: address ?? existing.address,
                country: country ?? existing.country,
                name: name ?? existing.name,
                phone: phone ?? existing.phone,
                email: email ?? existing.email,
                fax: fax ?? existing.fax,
                message: message ?? existing.message,
                formType: formType ?? existing.formType,
                catalogId: catalogId ?? existing.catalogId,
                isReplied: isReplied ?? existing.isReplied,
                repliedAt,
                repliedBy: repliedByUser,
                ipAddress: ipAddress ?? existing.ipAddress,
                userAgent: userAgent ?? existing.userAgent,
            },
        });

        await this.auditService.log({
            userId: updatedBy,
            action: "UPDATE_CLIENT",
            tableName: "Client",
            recordId: id,
            oldValues: existing,
            newValues: updatedClient,
            details: `Client "${existing.name}" updated`,
            ipAddress,
            userAgent,
        });

        return updatedClient;
    }

    /**
     * Tandai klien sebagai sudah dibalas dan kirim email otomatis
     * @param id - ID klien
     * @param repliedBy - ID user yang membalas
     * @param ipAddress - IP address untuk audit
     * @param userAgent - User agent untuk audit
     */
    async reply(
        id: string,
        repliedBy: string,
        ipAddress?: string,
        userAgent?: string
    ): Promise<void> {
        const client = await this.prisma.client.findUnique({
            where: { id, deletedAt: null },
            include: {
                repliedByUser: { select: { name: true } },
                catalog: { select: { name: true, file: true } },
            },
        });

        if (!client) throw new Error("Client not found");
        if (client.isReplied) throw new Error("Already replied");

        // Update client
        await this.prisma.client.update({
            where: { id },
            data: { isReplied: true, repliedAt: new Date(), repliedBy },
        });

        // Kirim email otomatis
        try {
            await this.sendReplyEmail(client);
            console.log(
                `✅ Auto-reply sent to ${client.email} (${client.formType})`
            );
        } catch (error) {
            console.warn("Email failed (non-blocking):", error);
        }

        // Audit log
        await this.auditService.log({
            action: "REPLY_CLIENT",
            tableName: "Client",
            recordId: client.id,
            newValues: client,
            details: `Client "${client.name}" marked as replied`,
            ipAddress: client.ipAddress || undefined,
            userAgent: client.userAgent || undefined,
        });
    }

    /**
     * Soft delete klien
     * @param input - Data delete
     */
    async delete(input: DeleteClientInput) {
        const { id, deletedBy, ipAddress, userAgent } = input;

        const client = await this.prisma.client.findUnique({
            where: { id, deletedAt: null },
        });

        if (!client) {
            throw new Error("Client not found");
        }

        await this.prisma.client.update({
            where: { id },
            data: { deletedAt: new Date() },
        });

        await this.auditService.log({
            userId: deletedBy,
            action: "DELETE_CLIENT",
            tableName: "Client",
            recordId: id,
            oldValues: { name: client.name, email: client.email },
            details: "Client record deleted",
            ipAddress,
            userAgent,
        });
    }

    // Helper methods
    private async sendAutoEmail(client: Client): Promise<void> {
        let html: string;
        let subject: string;

        if (client.formType === "CONTACT") {
            const template = new FeedbackToClientEmailTemplate(
                this.emailTemplateService
            );
            const FeedbackToClientData = {
                clientName: client.name,
                company: client.company,
                clientMessage: client.message,
            };
            html = template.generate(FeedbackToClientData);
            subject = "Thank You for Contacting Enerkomp";
        } else if (client.formType === "CATALOG") {
            const catalog = client.catalogId
                ? await this.prisma.catalog.findUnique({
                      where: { id: client.catalogId },
                      select: { name: true, file: true },
                  })
                : await this.prisma.catalog.findFirst({
                      where: { name: { contains: "catalog" } },
                      select: { name: true, file: true },
                  });

            const link =
                catalog?.file ||
                process.env.DEFAULT_GOOGLE_DRIVE_URL ||
                "https://drive.google.com/";
            const name = catalog?.name || "Product Catalog";

            const template = new CatalogToClientEmailTemplate(
                this.emailTemplateService
            );
            const CatalogToClientData = {
                clientName: client.name,
                catalogName: name,
                gdriveLink: link,
            };
            html = template.generate(CatalogToClientData);
            subject = `Your Requested Catalog: ${name}`;
        } else {
            return;
        }

        await this.emailService.send({
            to: client.email,
            subject: `Re: Inquiry from ${client.company}`,
            html,
        });
    }

    private async sendReplyEmail(
        client: Client & {
            repliedByUser?: {
                name?: string;
            } | null;

            catalog?: {
                name?: string;
                file?: string;
            } | null;
        }
    ): Promise<void> {
        let html: string;
        let subject: string;

        if (client.formType === "CONTACT") {
            const agentName =
                client.repliedByUser?.name || "Enerkomp Support Team";
            const template = new FeedbackToClientEmailTemplate(
                this.emailTemplateService
            );
            const FeedbackToClientData = {
                clientName: client.name,
                company: "Thank You for Contacting Enerkomp",
                clientMessage:
                    "Thank you for reaching out to Enerkomp. Our team has received your message and will get back to you shortly.",
                agentName,
            };
            html = template.generate(FeedbackToClientData);
            subject = "Thank You for Contacting Enerkomp";
        } else if (client.formType === "CATALOG") {
            const catalog = client.catalog;
            const link =
                catalog?.file ||
                process.env.DEFAULT_GOOGLE_DRIVE_URL ||
                "https://drive.google.com/";
            const name = catalog?.name || "Product Catalog";

            const template = new CatalogToClientEmailTemplate(
                this.emailTemplateService
            );
            const CatalogToClientData = {
                clientName: client.name,
                catalogName: name,
                gdriveLink: link,
            };
            html = template.generate(CatalogToClientData);
            subject = `Your Requested Catalog: ${name}`;
        } else {
            return;
        }

        await this.emailService.send({
            to: client.email,
            subject,
            html,
        });
    }
}
