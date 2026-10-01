/** Distance in metres between two points on the earth. */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export type GeoFix = { lat: number; lng: number; accuracyM: number | null } | null;

export type LocationCheck = "ok" | "outside" | "no_fix" | "store_has_no_location";
export type IpCheck = "match" | "mismatch" | "store_has_no_ip";

export function checkLocation(
  store: { latitude: number | null; longitude: number | null; geofence_m: number },
  fix: GeoFix,
): { result: LocationCheck; distanceM: number | null } {
  if (store.latitude == null || store.longitude == null) return { result: "store_has_no_location", distanceM: null };
  if (!fix) return { result: "no_fix", distanceM: null };
  const d = distanceM(store.latitude, store.longitude, fix.lat, fix.lng);
  // A poor GPS fix is given the benefit of its own stated accuracy, capped so
  // a fix that is "accurate to 5 km" cannot pass for being in the shop.
  const slack = Math.min(fix.accuracyM ?? 0, 250);
  return { result: d <= store.geofence_m + slack ? "ok" : "outside", distanceM: Math.round(d) };
}

export function checkIp(store: { known_ips: string[] }, ip: string | null): IpCheck {
  if (!store.known_ips.length) return "store_has_no_ip";
  return ip && store.known_ips.includes(ip) ? "match" : "mismatch";
}
