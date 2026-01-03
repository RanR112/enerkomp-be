/**
 * @file ClientController – Antarmuka HTTP untuk manajemen klien Enerkomp
 * @description
 * Controller class-based untuk mengelola:
 * - Formulir kontak dari website (publik)
 * - Manajemen klien oleh admin (terproteksi)
 * - Ekspor data ke Excel dan PDF
 *
 * @security
 * - Endpoint publik: /clients (hanya POST)
 * - Endpoint admin: memerlukan autentikasi dan permission
 * - Validasi input ketat untuk formType dan data klien
 *
 * @usage
 * const clientController = new ClientController(clientService, notificationService, exportService, timezoneService);
 * router.post('/clients', clientController.createClient);
 *
 * @dependencies
 * - `ClientService`, `NotificationService`, `ExportService`, `TimezoneService`
 * - Express Request/Response
 */

import { Request, Response } from "express";
import { FormType } from "@prisma/client";
import dayjs from "dayjs";
import { ClientService } from "../services/client.service";
import { NotificationService } from "../services/notification.service";
import { ExportService } from "../services/reporting/export.service";
import { TimezoneService } from "../services/timezone.service";

export class ClientController {
    constructor(
        private clientService: ClientService,
        private notificationService: NotificationService,
        private exportService: ExportService,
        private timezoneService: TimezoneService
    ) {}

    /**
     * Endpoint: GET /clients
     * Ambil daftar klien dengan pagination dan filter
     */
    getClients = async (req: Request, res: Response): Promise<void> => {
        try {
            const {
                deleted,
                page = "1",
                limit = "10",
                formType,
                isReplied,
                search,
            } = req.query;

            // Normalisasi formType
            let normalizedFormType: FormType | undefined = undefined;
            if (formType) {
                const ft = String(formType).toUpperCase();
                if (ft === "CATALOG" || ft === "CONTACT") {
                    normalizedFormType = ft as FormType;
                } else {
                    res.status(400).json({ error: "Invalid formType" });
                    return;
                }
            }

            // Normalisasi isReplied
            let normalizedIsReplied: boolean | undefined = undefined;
            if (isReplied === "true") normalizedIsReplied = true;
            else if (isReplied === "false") normalizedIsReplied = false;

            const result = await this.clientService.list({
                deleted: deleted === "true",
                page: parseInt(page as string, 10),
                limit: parseInt(limit as string, 10),
                formType: normalizedFormType,
                isReplied: normalizedIsReplied,
                search: search ? String(search) : undefined,
            });

            res.status(200).json(result);
        } catch (error) {
            this.handleError(res, error, "Failed to fetch clients");
        }
    };

    /**
     * Endpoint: GET /clients/:id
     * Ambil detail klien berdasarkan ID
     */
    getClient = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const client = await this.clientService.findById(id);

            if (!client) {
                res.status(404).json({ error: "Client not found" });
                return;
            }

            res.status(200).json(client);
        } catch (error) {
            this.handleError(res, error, "Failed to fetch client");
        }
    };

    /**
     * Endpoint: POST /clients
     * Buat klien baru dari formulir website (publik)
     */
    createClient = async (req: Request, res: Response): Promise<void> => {
        try {
            const {
                company,
                address,
                country,
                name,
                phone,
                email,
                fax,
                message,
                catalogId,
                formType,
                source,
            } = req.body;

            if (!name || !email || !message || !formType) {
                res.status(400).json({
                    error: "Name, email, message, and formType are required",
                });
                return;
            }

            if (formType !== "CATALOG" && formType !== "CONTACT") {
                res.status(400).json({
                    error: 'Invalid formType. Use "CATALOG" or "CONTACT".',
                });
                return;
            }

            const result = await this.clientService.create({
                company: company || "",
                address: address || "",
                country: country || "",
                name,
                phone: phone || "",
                email,
                fax: fax || null,
                message,
                catalogId: catalogId || null,
                formType,
                source: source || null,
                ipAddress: req.ip || null,
                userAgent: req.get("User-Agent") || null,
            });

            // Ambil link catalog untuk response
            let catalogUrl: string | null = null;
            if (formType === "CATALOG" && catalogId) {
                const catalog = await this.clientService[
                    "prisma"
                ].catalog.findUnique({
                    where: { id: catalogId },
                    select: { file: true },
                });
                catalogUrl = catalog?.file || null;
            }

            // Kirim notifikasi (non-blocking)
            this.notificationService
                .notifyByPermission(
                    "client",
                    "new_client",
                    {
                        name: result.client.name,
                        email: result.client.email,
                        formType: result.client.formType,
                    },
                    "clients",
                    result.client.id
                )
                .catch(() => {});

            res.status(201).json({
                message: "Client form submitted successfully",
                data: result.client,
                catalogUrl,
                emailSent: result.emailSent,
            });
        } catch (error) {
            this.handleError(res, error, "Failed to submit form", 400);
        }
    };

    /**
     * Endpoint: PUT /clients/:id
     * Update klien yang sudah ada
     */
    updateClient = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const {
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
            } = req.body;

            if (!id) {
                res.status(400).json({ error: "Missing client ID" });
                return;
            }

            const updatedClient = await this.clientService.update({
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
                updatedBy: req.user?.id || repliedBy || "system",
                ipAddress: req.ip || undefined,
                userAgent: req.get("User-Agent") || undefined,
            });

            res.status(200).json({
                message: "Client updated successfully",
                data: updatedClient,
            });
        } catch (error) {
            this.handleError(res, error, "Failed to update client", 500);
        }
    };

    /**
     * Endpoint: POST /clients/:id/reply
     * Tandai klien sebagai sudah dibalas dan kirim email otomatis
     */
    replyToClient = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;

            await this.clientService.reply(
                id,
                req.user!.id,
                req.ip || undefined,
                req.get("User-Agent") || undefined
            );

            res.status(200).json({ message: "Client replied successfully" });
        } catch (error) {
            this.handleError(res, error, "Failed to reply to client", 400);
        }
    };

    /**
     * Endpoint: DELETE /clients/:id
     * Soft delete klien
     */
    deleteClient = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;

            await this.clientService.delete({
                id,
                deletedBy: req.user!.id,
                ipAddress: req.ip || undefined,
                userAgent: req.get("User-Agent") || undefined,
            });

            res.status(200).json({ message: "Client deleted successfully" });
        } catch (error) {
            this.handleError(res, error, "Failed to delete client", 400);
        }
    };

    /**
     * Endpoint: GET /clients/export/excel
     * Ekspor data klien ke Excel berdasarkan bulan/tahun
     */
    exportExcel = async (req: Request, res: Response): Promise<void> => {
        try {
            const { month, year } = req.query;

            if (!month || !year) {
                res.status(400).json({
                    error: "month and year are required. Example: ?month=02&year=2025",
                });
                return;
            }

            const startDate = dayjs(`${year}-${month}-01`)
                .startOf("month")
                .toDate();
            const endDate = dayjs(startDate).endOf("month").toDate();

            const result = await this.clientService.list({
                page: 1,
                limit: 1000,
            });

            const filteredClients = (result.data || []).filter(
                (client) =>
                    client.createdAt >= startDate && client.createdAt <= endDate
            );

            if (filteredClients.length === 0) {
                res.status(404).json({
                    error: "No client found for this month",
                });
                return;
            }

            const exportRows = filteredClients.map((item) => ({
                Date: this.timezoneService.toLocalString(
                    item.createdAt,
                    "Asia/Jakarta",
                    "yyyy-MM-dd"
                ),
                Company: item.company,
                Country: item.country,
                Name: item.name,
                Phone: item.phone,
                Email: item.email,
                "Form Type": item.formType,
            }));

            const sheets = [
                {
                    name: "Clients Report",
                    headers:
                        exportRows.length > 0 ? Object.keys(exportRows[0]) : [],
                    rows: exportRows,
                },
            ];

            const filename = `client-${year}-${month}`;
            await this.exportService.toExcel(sheets, filename, res);
        } catch (error) {
            this.handleError(res, error, "Export to Excel failed");
        }
    };

    /**
     * Endpoint: GET /clients/export/pdf
     * Ekspor data klien ke PDF berdasarkan bulan/tahun
     */
    exportPdf = async (req: Request, res: Response): Promise<void> => {
        try {
            const { month, year } = req.query;

            if (!month || !year) {
                res.status(400).json({
                    error: "month and year are required. Example: ?month=02&year=2025",
                });
                return;
            }

            const startDate = dayjs(`${year}-${month}-01`)
                .startOf("month")
                .toDate();
            const endDate = dayjs(startDate).endOf("month").toDate();

            const result = await this.clientService.list({
                page: 1,
                limit: 1000,
            });

            const filteredClients = (result.data || []).filter(
                (client) =>
                    client.createdAt >= startDate && client.createdAt <= endDate
            );

            if (filteredClients.length === 0) {
                res.status(404).json({
                    error: "No client found for this month",
                });
                return;
            }

            const exportData = filteredClients.map((item) => ({
                Date: this.timezoneService.toLocalString(
                    item.createdAt,
                    "Asia/Jakarta",
                    "yyyy-MM-dd"
                ),
                Company: item.company,
                Name: item.name,
                Phone: item.phone,
                Email: item.email,
                Form: item.formType,
            }));

            const filename = `client-${year}-${month}`;
            const title = `Clients Report - ${month}/${year}`;

            this.exportService.toPdf(exportData, filename, title, res);
        } catch (error) {
            this.handleError(res, error, "Export to PDF failed");
        }
    };

    // Helper methods
    private handleError(
        res: Response,
        error: unknown,
        defaultMessage: string,
        statusCode: number = 500
    ): void {
        const message = error instanceof Error ? error.message : defaultMessage;
        res.status(statusCode).json({ error: message });
    }
}
