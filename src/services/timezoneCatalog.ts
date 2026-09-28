import rawCatalog from '../../config/timezone_catalog.json';
import type { TimezoneCatalog, TimezoneCatalogZone } from '../types/rtcTimezone';

const catalog = rawCatalog as TimezoneCatalog;

const validateCatalog = (): void => {
  if (catalog.schemaVersion !== 1) {
    throw new Error(`Unsupported timezone catalog schema: ${catalog.schemaVersion}`);
  }
  if (
    catalog.tzdbVersion !== `${catalog.tzdbYear}${catalog.tzdbRevisionLetter}`
    || catalog.zones.length !== catalog.zoneAndLinkCount
  ) {
    throw new Error('Timezone catalog metadata does not match its zone registry');
  }
};

validateCatalog();

const zones = Object.freeze(catalog.zones.map((zone) => Object.freeze({ ...zone })));
const zoneByName = new Map<string, Readonly<TimezoneCatalogZone>>();
const zoneById = new Map<number, Readonly<TimezoneCatalogZone>>();

for (const zone of zones) {
  if (zoneByName.has(zone.name) || zoneById.has(zone.zoneId)) {
    throw new Error(`Timezone catalog contains a duplicate zone: ${zone.name}`);
  }
  zoneByName.set(zone.name, zone);
  zoneById.set(zone.zoneId, zone);
}

export const TIMEZONE_CATALOG: Readonly<TimezoneCatalog> = Object.freeze({
  ...catalog,
  zones,
});

export const getTimezoneByName = (
  name: string
): Readonly<TimezoneCatalogZone> | null => zoneByName.get(name) ?? null;

export const getTimezoneById = (
  zoneId: number
): Readonly<TimezoneCatalogZone> | null => zoneById.get(zoneId) ?? null;

/**
 * Resolve the device timezone candidate without applying an implicit UTC fallback.
 * Supplying a value makes this helper deterministic in tests; omitting it reads the
 * host candidate from Intl.DateTimeFormat as required by the shared Web/iOS UX.
 */
export const getDeviceTimezoneCandidate = (
  resolvedTimeZone?: string | null
): Readonly<TimezoneCatalogZone> | null => {
  let name = resolvedTimeZone;
  if (name === undefined) {
    try {
      name = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return null;
    }
  }
  return typeof name === 'string' && name.length > 0
    ? getTimezoneByName(name)
    : null;
};
