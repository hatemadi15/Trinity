/** The Moon's orientation every 6 hours (unit quaternions [w, x, y, z] rotating J2000 vectors into MOON_ME), from SPICE. */
export interface MoonOrientation { startMs: number; stepMs: number; quats: Float32Array; count: number }

export function parseMoonOrientation(bytes: ArrayBuffer, header: { start_utc: string; step_hours: number; count: number }): MoonOrientation {
  return { startMs: Date.parse(header.start_utc + 'Z'), stepMs: header.step_hours * 3600e3, quats: new Float32Array(bytes), count: header.count };
}

/** Row-major J2000→MOON_ME rotation at a UTC time, by slerp between the 6-hour samples; clamped to the table's ends. */
export function moonMatrixAt(o: MoonOrientation, utcMs: number): number[] {
  const x = Math.min(o.count - 1, Math.max(0, (utcMs - o.startMs) / o.stepMs));
  const i = Math.min(o.count - 2, Math.floor(x)), f = x - i;
  const q = o.quats;
  const a0 = q[i * 4], a1 = q[i * 4 + 1], a2 = q[i * 4 + 2], a3 = q[i * 4 + 3];
  const b0 = q[i * 4 + 4], b1 = q[i * 4 + 5], b2 = q[i * 4 + 6], b3 = q[i * 4 + 7];
  let d = a0 * b0 + a1 * b1 + a2 * b2 + a3 * b3;
  const sign = d < 0 ? -1 : 1;
  d = Math.abs(d);
  let wa: number, wb: number;
  if (d > 0.9995) {
    wa = 1 - f;
    wb = f * sign;
  } else {
    const th = Math.acos(d), sn = Math.sin(th);
    wa = Math.sin((1 - f) * th) / sn;
    wb = (Math.sin(f * th) / sn) * sign;
  }
  let w = wa * a0 + wb * b0, qx = wa * a1 + wb * b1, qy = wa * a2 + wb * b2, qz = wa * a3 + wb * b3;
  const n = Math.hypot(w, qx, qy, qz);
  w /= n; qx /= n; qy /= n; qz /= n;
  return [
    1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - w * qz), 2 * (qx * qz + w * qy),
    2 * (qx * qy + w * qz), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - w * qx),
    2 * (qx * qz - w * qy), 2 * (qy * qz + w * qx), 1 - 2 * (qx * qx + qy * qy),
  ];
}
