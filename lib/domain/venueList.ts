/**
 * ========================
 * LISTADO DE SEDES — DOMINIO
 * ========================
 *
 * Specification-Driven Development (SDD)
 * Ref: docs/BOOKING_SYSTEM_SDD.md
 *
 * Helpers puros para la pantalla de listado/búsqueda de sedes (`/venues`).
 * Sin Firebase, sin React. Cubren:
 *  - extracción de deportes y formatos visibles por sede (desde `venue.formats`)
 *  - derivación best-effort de la ciudad a partir del `address` de Google
 *  - búsqueda y filtrado client-side sobre las sedes ya cargadas
 *
 * NOTA sobre la ciudad: `Venue` no tiene un campo `city` estructurado, solo el
 * `address` formateado por Google. `deriveVenueCity` lo infiere quitando país,
 * departamentos colombianos y componentes con dígitos (códigos postales). Es
 * heurístico; un campo `city` real al crear la sede sería la solución robusta.
 */

import type { SportType, Venue, VenueAmenity } from "./venue";
import { SPORT_TYPES, clientFormatLabel } from "./venue";

// ========================
// AMENITIES — PRIORIDAD DE DISPLAY
// ========================

/**
 * Orden de prioridad para mostrar amenities en superficies con espacio limitado
 * (ej. la tarjeta del listado). Los diferenciadores más relevantes para elegir
 * cancha van primero: parqueadero, iluminación, duchas, alquiler de guayos…
 */
export const AMENITY_DISPLAY_PRIORITY: VenueAmenity[] = [
    "covered",
    "parking",
    "lighting",
    "showers",
    "shoe_rental",
    "bathrooms",
    "lockers",
    "cafeteria",
    "wifi",
];

/**
 * Ordena (y de-duplica) las amenities de una sede según `AMENITY_DISPLAY_PRIORITY`.
 * Cualquier amenity no listada queda al final, en su orden original.
 */
export function prioritizeAmenities(amenities: VenueAmenity[] | undefined): VenueAmenity[] {
    const set = new Set(amenities ?? []);
    const prioritized = AMENITY_DISPLAY_PRIORITY.filter((a) => set.has(a));
    const rest = (amenities ?? []).filter((a) => !AMENITY_DISPLAY_PRIORITY.includes(a));
    return [...prioritized, ...new Set(rest)];
}

// ========================
// NORMALIZACIÓN
// ========================

/** Minúsculas + sin acentos, para comparaciones/búsquedas insensibles. */
export function normalizeText(s: string): string {
    return s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .trim();
}

// ========================
// DEPORTES / FORMATOS POR SEDE
// ========================

/**
 * Deportes distintos disponibles en una sede, en el orden canónico de `SPORT_TYPES`.
 * Modo legacy (sin `formats`) ⇒ `["football"]` (sede football-only).
 */
export function venueSports(venue: Pick<Venue, "formats">): SportType[] {
    const formats = venue.formats ?? [];
    if (formats.length === 0) return ["football"];
    const set = new Set<SportType>(formats.map((f) => f.sport));
    return SPORT_TYPES.filter((s) => set.has(s));
}

/**
 * Labels de formato distintos de una sede (ej. "Fútbol 5v5", "Fútbol 7v7"),
 * preservando el orden del catálogo. Modo legacy ⇒ `[]` (no hay catálogo).
 */
export function venueFormatLabels(venue: Pick<Venue, "formats">): string[] {
    const formats = venue.formats ?? [];
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const f of formats) {
        const label = f.label.trim();
        if (label && !seen.has(label)) {
            seen.add(label);
            labels.push(label);
        }
    }
    return labels;
}

/**
 * Labels de formato ESTANDARIZADOS para el cliente (ej. "Doble (9vs9)"),
 * distintos y en orden de catálogo. Es lo que se muestra en la tarjeta del
 * listado y demás superficies de reserva. Modo legacy ⇒ `[]`.
 */
export function venueClientFormatLabels(venue: Pick<Venue, "formats">): string[] {
    const formats = venue.formats ?? [];
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const f of formats) {
        const label = clientFormatLabel(f.id, formats);
        if (!seen.has(label)) {
            seen.add(label);
            labels.push(label);
        }
    }
    return labels;
}

// ========================
// DERIVACIÓN DE CIUDAD
// ========================

/**
 * Departamentos de Colombia (normalizados) que NO son ciudad — se descartan al
 * derivar la ciudad de una dirección. Bogotá se omite a propósito: es ciudad.
 */
const CO_DEPARTMENTS = new Set(
    [
        "amazonas", "antioquia", "arauca", "atlantico", "bolivar", "boyaca",
        "caldas", "caqueta", "casanare", "cauca", "cesar", "choco", "cordoba",
        "cundinamarca", "guainia", "guaviare", "huila", "la guajira", "magdalena",
        "meta", "narino", "norte de santander", "putumayo", "quindio", "risaralda",
        "san andres y providencia", "santander", "sucre", "tolima",
        "valle del cauca", "vaupes", "vichada",
    ].map(normalizeText),
);

/** Tokens de país (normalizados) que se descartan al derivar la ciudad. */
const COUNTRY_TOKENS = new Set(
    ["colombia", "ee. uu.", "ee.uu.", "estados unidos", "usa", "united states"].map(normalizeText),
);

/**
 * Componente de dirección de la API de Google Places (`address_components`).
 */
export interface GoogleAddressComponent {
    long_name: string;
    short_name: string;
    types: string[];
}

/**
 * Extrae la ciudad de los `address_components` de Google Places, en orden de
 * preferencia: `locality` → `postal_town` → `administrative_area_level_2`
 * → `sublocality`. Es la fuente ESTRUCTURADA y confiable (a diferencia de
 * `deriveVenueCity`, que parsea el string). Se usa al crear la sede.
 *
 * Devuelve `null` si ninguno de esos tipos está presente.
 */
export function extractCityFromAddressComponents(
    components: GoogleAddressComponent[] | undefined | null,
): string | null {
    if (!components || components.length === 0) return null;
    const priority = ["locality", "postal_town", "administrative_area_level_2", "sublocality"];
    for (const type of priority) {
        const match = components.find((c) => c.types.includes(type));
        if (match?.long_name?.trim()) return match.long_name.trim();
    }
    return null;
}

/**
 * Deriva la ciudad (best-effort) de un `address` formateado por Google.
 * Estrategia: parte por comas y descarta, de derecha a izquierda, país,
 * departamentos colombianos y componentes con dígitos (códigos postales /
 * números de calle). La ciudad es el último componente "limpio" restante.
 *
 * Devuelve `null` si no hay un componente alfabético plausible.
 */
export function deriveVenueCity(address: string | undefined | null): string | null {
    if (!address || typeof address !== "string") return null;

    const parts = address
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

    for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];
        const norm = normalizeText(part);
        if (COUNTRY_TOKENS.has(norm)) continue;      // país
        if (CO_DEPARTMENTS.has(norm)) continue;      // departamento
        if (/\d/.test(part)) continue;               // postal / número de calle
        if (/#/.test(part)) continue;                // fragmento de dirección ("# 128-188")
        return part;
    }
    return null;
}

/**
 * Ciudad efectiva de una sede: usa el campo estructurado `venue.city` si existe
 * (sedes creadas con captura de ciudad), o cae al parseo del `address` para las
 * sedes legacy que no lo tienen.
 */
export function venueCity(venue: Pick<Venue, "city" | "address">): string | null {
    const structured = venue.city?.trim();
    if (structured) return structured;
    return deriveVenueCity(venue.address);
}

/** Ciudades distintas presentes en un set de sedes, ordenadas alfabéticamente. */
export function collectCities(venues: Venue[]): string[] {
    const map = new Map<string, string>(); // normalizada → display
    for (const v of venues) {
        const city = venueCity(v);
        if (city) {
            const key = normalizeText(city);
            if (!map.has(key)) map.set(key, city);
        }
    }
    return [...map.values()].sort((a, b) => a.localeCompare(b, "es"));
}

/** Deportes distintos presentes en un set de sedes, en orden canónico. */
export function collectSports(venues: Venue[]): SportType[] {
    const set = new Set<SportType>();
    for (const v of venues) {
        for (const s of venueSports(v)) set.add(s);
    }
    return SPORT_TYPES.filter((s) => set.has(s));
}

/** Amenities distintas presentes en un set de sedes, en orden de prioridad. */
export function collectAmenities(venues: Venue[]): VenueAmenity[] {
    const set = new Set<VenueAmenity>();
    for (const v of venues) {
        for (const a of v.amenities ?? []) set.add(a);
    }
    return AMENITY_DISPLAY_PRIORITY.filter((a) => set.has(a));
}

// ========================
// FILTRADO
// ========================

export interface VenueFilter {
    /** Texto libre: matchea nombre o dirección (insensible a acentos/caso). */
    query?: string;
    /** Deporte que la sede debe ofrecer. */
    sport?: SportType | null;
    /** Ciudad derivada que la sede debe tener (comparación normalizada). */
    city?: string | null;
    /** Amenities que la sede debe tener TODAS (AND). Vacío/ausente no restringe. */
    amenities?: VenueAmenity[];
}

/**
 * Filtra las sedes por texto, deporte, ciudad y amenities. Todos los criterios
 * son AND. Un criterio ausente/null/""/[] no restringe.
 */
export function filterVenues(venues: Venue[], filter: VenueFilter): Venue[] {
    const q = filter.query ? normalizeText(filter.query) : "";
    const cityKey = filter.city ? normalizeText(filter.city) : "";
    const sport = filter.sport ?? null;
    const amenities = filter.amenities ?? [];

    return venues.filter((v) => {
        if (q) {
            const haystack = `${normalizeText(v.name)} ${normalizeText(v.address)}`;
            if (!haystack.includes(q)) return false;
        }
        if (sport && !venueSports(v).includes(sport)) return false;
        if (cityKey) {
            const city = venueCity(v);
            if (!city || normalizeText(city) !== cityKey) return false;
        }
        if (amenities.length > 0) {
            const have = new Set(v.amenities ?? []);
            if (!amenities.every((a) => have.has(a))) return false;
        }
        return true;
    });
}
