/**
 * @file SlugService - Generasi slug aman untuk URL berbasis aturan bisnis
 * @description
 * Layanan untuk mengubah teks menjadi slug yang:
 * - Normalisasi karakter Unicode (é → e, ñ → n, dll)
 * - Hanya berisi lowercase alphanumeric + dash
 * - Bebas dari XSS/encoding issues
 *
 * Mendukung custom rules:
 * - Max length (default: 100)
 * - Reserved words blocking
 * - Custom replacement rules (opsional)
 *
 * @security
 * - Hindari karakter berbahaya: `< > " ' %` (auto-removed)
 * - Batas panjang default 100 karakter → cegah DOS via slug panjang
 * - Tidak ada external dependency → zero supply-chain risk
 *
 * @usage
 * // 1. Inisialisasi
 * const slugService = new SlugService();
 *
 * // 2. Generate slug dasar
 * slugService.generate("Halo Dunia!"); // → "halo-dunia"
 *
 * // 3. Dengan opsi
 * slugService.generate("Produk Premium 2025!", {
 *   maxLength: 50,
 *   reserved: ['admin', 'api', 'auth']
 * }); // → "produk-premium-2025"
 *
 * @dependencies
 * - Tidak ada external dependency (pure JavaScript)
 */

export interface SlugOptions {
    maxLength?: number;
    reserved?: string[];
    separator?: "-" | "_";
}

export class SlugService {
    private readonly defaultMaxLength = 100;

    /**
     * Generate slug dari teks input
     * @param text - Teks asli (judul brand, nama produk, dll)
     * @param options - Opsi tambahan
     * @returns Slug yang aman untuk URL
     * @throws Error jika slug kosong atau reserved
     */
    generate(text: string, options: SlugOptions = {}): string {
        if (!text || typeof text !== "string") {
            throw new Error("Input must be a non-empty string");
        }

        const maxLength = options.maxLength ?? this.defaultMaxLength;
        const separator = options.separator ?? "-";
        const reserved = options.reserved ?? [];

        // Normalisasi & sanitasi
        let slug = text
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // Hapus diakritik
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9\s\-_]/g, "") // Hanya alphanumeric + spasi + dash/underscore
            .replace(/[\s\-_]+/g, separator) // Gabungkan whitespace/dash/underscore
            .replace(new RegExp(`^${separator}+|${separator}+$`, "g"), ""); // Hapus separator di ujung

        // Potong sesuai max length
        if (slug.length > maxLength) {
            slug = slug
                .substring(0, maxLength)
                .replace(new RegExp(`${separator}[^${separator}]*$`), "");
        }

        // Validasi hasil akhir
        if (!slug) {
            throw new Error("Slug cannot be empty after sanitization");
        }

        if (reserved.includes(slug)) {
            throw new Error(`Slug "${slug}" is reserved and cannot be used`);
        }

        return slug;
    }

    /**
     * Generate unique slug (untuk case duplikat)
     * @example
     * generateUnique("produk-baru", ["produk-baru", "produk-baru-1"])
     * // → "produk-baru-2"
     */
    generateUnique(baseSlug: string, existingSlugs: string[]): string {
        if (!existingSlugs.includes(baseSlug)) {
            return baseSlug;
        }

        let counter = 1;
        let newSlug: string;
        do {
            newSlug = `${baseSlug}-${counter}`;
            counter++;
        } while (existingSlugs.includes(newSlug));

        return newSlug;
    }
}
