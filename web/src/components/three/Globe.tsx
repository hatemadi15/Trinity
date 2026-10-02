'use client';
import { useMemo } from 'react';
import { Line, useTexture } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { SRGBColorSpace, type Texture } from 'three';
import { siteLabel, type Site } from '@/lib/data/loaders';
import { latitudeRing, latLonToSphere, sphereToLatLon } from '@/lib/viz/three-frames';
import { TextSprite } from './TextSprite';

function markSrgb(texture: Texture | Texture[]) {
  for (const t of Array.isArray(texture) ? texture : [texture]) t.colorSpace = SRGBColorSpace;
}

type ClickHandler = (e: ThreeEvent<MouseEvent>) => void;

/** Pointer travel (px) between down and up above which a click on the Moon is an orbit drag, not a pick. */
export const PICK_MAX_TRAVEL_PX = 4;

/**
 * The Moon as a 1-unit sphere with NASA's LRO colour map. Three's SphereGeometry puts u = 0.5 at
 * +x and u = 0.75 at -z, which matches `latLonToSphere` (lon 0 → +x, lon 90°E → -z) for an
 * equirectangular map centred on longitude 0, so no rotation is needed.
 * Picking uses `onClick` and checks the event's pointer travel itself: React Three Fiber only
 * applies its 2 px rule to clicks that miss every object, so a drag that starts on the Moon still
 * reaches this handler with a large `delta`.
 */
export function Globe({
  site,
  sites,
  textureUrl,
  onPick,
}: {
  site: Site;
  sites: Site[];
  textureUrl: string | null;
  onPick?: (lat: number, lon: number) => void;
}) {
  const pins = useMemo(
    () =>
      sites
        .filter((s) => s.polar)
        .map((s) => ({ id: s.id, position: latLonToSphere(s.lat, s.lon, 1.006), selected: s.id === site.id })),
    [sites, site.id],
  );
  // The edge of the area this tool covers, drawn and named, so "south of 60° S" can be found on the globe.
  const ring = useMemo(() => latitudeRing(-60, 1.004, 180), []);
  const onClick: ClickHandler = (e) => {
    if (!onPick || e.delta > PICK_MAX_TRAVEL_PX) return;
    e.stopPropagation();
    const { lat, lon } = sphereToLatLon([e.point.x, e.point.y, e.point.z]);
    onPick(lat, lon);
  };
  return (
    <group>
      {textureUrl ? <TexturedMoon url={textureUrl} onClick={onClick} /> : <PlainMoon onClick={onClick} />}
      <Line points={ring} color="#f5f2ea" lineWidth={1.5} transparent opacity={0.75} />
      <TextSprite text="60° S" position={latLonToSphere(-60, site.lon, 1.05)} height={0.06} />
      {pins.map((p) => (
        <mesh key={p.id} position={p.position}>
          <sphereGeometry args={[p.selected ? 0.022 : 0.013, 12, 12]} />
          <meshBasicMaterial color={p.selected ? '#f2b134' : '#b4b0a8'} />
        </mesh>
      ))}
      {site.polar && <TextSprite text={siteLabel(site)} position={latLonToSphere(site.lat, site.lon, 1.08)} height={0.05} depthTest={false} />}
    </group>
  );
}

function TexturedMoon({ url, onClick }: { url: string; onClick: ClickHandler }) {
  const texture = useTexture(url, markSrgb);
  return (
    <mesh receiveShadow onClick={onClick}>
      <sphereGeometry args={[1, 96, 96]} />
      <meshStandardMaterial map={texture} roughness={1} metalness={0} />
    </mesh>
  );
}

/** Untextured Moon for installs where the colour map was not synced. */
function PlainMoon({ onClick }: { onClick: ClickHandler }) {
  return (
    <mesh onClick={onClick}>
      <sphereGeometry args={[1, 96, 96]} />
      <meshStandardMaterial color="#8a857c" roughness={1} metalness={0} />
    </mesh>
  );
}
