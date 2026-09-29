'use client';
import { useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { SRGBColorSpace, type Texture } from 'three';
import type { Site } from '@/lib/data/loaders';
import { latLonToSphere, sphereToLatLon } from '@/lib/viz/three-frames';

function markSrgb(texture: Texture | Texture[]) {
  for (const t of Array.isArray(texture) ? texture : [texture]) t.colorSpace = SRGBColorSpace;
}

/**
 * The Moon as a 1-unit sphere with NASA's LRO colour map. Three's SphereGeometry puts u = 0.5 at
 * +x and u = 0.75 at -z, which matches `latLonToSphere` (lon 0 → +x, lon 90°E → -z) for an
 * equirectangular map centred on longitude 0, so no rotation is needed.
 */
export function Globe({
  site,
  sites,
  textureUrl,
  onPick,
}: {
  site: Site;
  sites: Site[];
  textureUrl: string;
  onPick?: (lat: number, lon: number) => void;
}) {
  const texture = useTexture(textureUrl, markSrgb);
  const pins = useMemo(
    () =>
      sites
        .filter((s) => s.polar)
        .map((s) => ({ id: s.id, position: latLonToSphere(s.lat, s.lon, 1.006), selected: s.id === site.id })),
    [sites, site.id],
  );
  return (
    <group>
      <mesh
        receiveShadow
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          if (!onPick) return;
          e.stopPropagation();
          const { lat, lon } = sphereToLatLon([e.point.x, e.point.y, e.point.z]);
          onPick(lat, lon);
        }}
      >
        <sphereGeometry args={[1, 96, 96]} />
        <meshStandardMaterial map={texture} roughness={1} metalness={0} />
      </mesh>
      {pins.map((p) => (
        <mesh key={p.id} position={p.position}>
          <sphereGeometry args={[p.selected ? 0.016 : 0.01, 12, 12]} />
          <meshBasicMaterial color={p.selected ? '#f2b134' : '#b4b0a8'} />
        </mesh>
      ))}
    </group>
  );
}
