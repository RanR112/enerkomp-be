/**
 * @file Slugify Adapter - Kompatibilitas dengan fungsi lama
 * @description
 * Menyediakan fungsi `slugify()` seperti versi lama, namun di-backup oleh `SlugService`.
 * Memungkinkan migrasi bertahap tanpa ubah kode yang sudah ada.
 *
 * @usage
 * import { slugify } from '@/utils/slugify';
 * const slug = slugify("Halo Dunia!"); // → "halo-dunia"
 */

import { SlugService } from "../services/slug.service";

const slugService = new SlugService();

/**
 * Mengubah string menjadi slug yang aman untuk URL
 * Contoh:
 *   "Halo Dunia!" → "halo-dunia"
 *   "Produk Baru 2025" → "produk-baru-2025"
 *   "Café & Résumé" → "cafe-resume"
 */
export const slugify = (text: string): string => {
    return slugService.generate(text);
};
