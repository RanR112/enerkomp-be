/**
 * @file Analytics Service Adapter – Kompatibilitas dengan fungsi lama
 * @description
 * Menyediakan fungsi lama (`getAnalytics`, `trackPageView`, dll) namun di-backup oleh `AnalyticsService`.
 */

import { PrismaClient } from '@prisma/client';
import { UtmService } from '../services/utm.service';
import { TimezoneService } from '../services/timezone.service';
import { AnalyticsService } from '../services/analytics.service';

const prisma = new PrismaClient();
const utmService = new UtmService();
const timezoneService = new TimezoneService({ defaultTimezone: 'Asia/Jakarta' });
const analyticsService = new AnalyticsService(prisma, utmService, timezoneService);

export const getAnalytics = analyticsService.list.bind(analyticsService);
export const getAnalyticsByDate = analyticsService.findByDate.bind(analyticsService);
export const getPageViews = analyticsService.getPageViews.bind(analyticsService);
export const trackPageView = analyticsService.trackPageView.bind(analyticsService);
export const calculateDailyMetrics = analyticsService.calculateDailyMetrics.bind(analyticsService);