const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export function moonToThree(v: ArrayLike<number>): [number, number, number] {
  return [v[0], v[2], -v[1]];
}

export function localToThree(east: number, north: number, up: number): [number, number, number] {
  return [east, up, -north];
}

export function dirFromAzEl(azDeg: number, elDeg: number): [number, number, number] {
  const az = azDeg * DEG, el = elDeg * DEG;
  return localToThree(Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el));
}

/** Direct sunlight fades in over the first half degree above the terrain skyline. */
export function sunLight(elDeg: number, skylineDeg: number): { intensity: number; castShadow: boolean } {
  const above = elDeg - skylineDeg;
  if (above <= 0) return { intensity: 0, castShadow: false };
  return { intensity: Math.min(1, above / 0.5), castShadow: true };
}

export function latLonToSphere(latDeg: number, lonDeg: number, r = 1): [number, number, number] {
  const lat = latDeg * DEG, lon = lonDeg * DEG;
  return moonToThree([r * Math.cos(lat) * Math.cos(lon), r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat)]);
}

export function sphereToLatLon(p: ArrayLike<number>): { lat: number; lon: number } {
  const x = p[0], y = -p[2], z = p[1]; // inverse of moonToThree
  const r = Math.hypot(x, y, z);
  return { lat: Math.asin(z / r) * RAD, lon: Math.atan2(y, x) * RAD };
}
