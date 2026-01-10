/**
 * @file Http Helper Adapter – Wrapper utilitas HTTP
 * @description
 * Adapter util untuk menyediakan fungsi-fungsi helper HTTP
 * dalam bentuk functional API, sambil tetap menggunakan
 * `HttpHelperService` sebagai core logic.
 *
 * Cocok untuk:
 * - Pemakaian cepat di controller
 * - Migrasi dari helper function lama
 * - Konsistensi import di layer utils
 *
 * @usage
 * import { getClientIp, handleError } from '@/utils/http-helper';
 * const ip = getClientIp(req);
 * handleHttpError(res, error, 'Failed');
 */

import { Request, Response } from "express";
import { HttpHelperService } from "../services/http-helper.service";

const httpHelperService = new HttpHelperService();

/**
 * Ambil IP client dari Express Request
 */
export const getClientIp = (req: Request): string => {
    return httpHelperService.getClientIp(req);
};

/**
 * Tangani error HTTP secara terstandarisasi
 */
export const handleError = (
    res: Response,
    error: unknown,
    defaultMessage: string,
    statusCode: number = 500
): void => {
    httpHelperService.handleError(res, error, defaultMessage, statusCode);
};
