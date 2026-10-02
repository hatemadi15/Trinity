'use client';
import { DoubleSide } from 'three';
import { TextSprite } from './TextSprite';

/** Short form of a site name for the in-scene label: the part before the first comma; custom sites just say so. */
export function markerLabel(name: string): string {
  if (name.startsWith('Custom site')) return 'Custom site';
  const short = name.split(',')[0].trim();
  return short.length > 0 ? short : name;
}

/**
 * Marks the site origin: a 1.2 km pole, a ground ring and a floating label (scene units are km).
 * The ring and label ignore depth so a rim or crater wall never hides where the site is.
 */
export function SiteMarker({ name }: { name: string }) {
  return (
    <group>
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 1.2, 8]} />
        <meshBasicMaterial color="#f2b134" />
      </mesh>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
        <ringGeometry args={[0.35, 0.45, 48]} />
        <meshBasicMaterial color="#f2b134" transparent opacity={0.85} side={DoubleSide} depthTest={false} depthWrite={false} />
      </mesh>
      <TextSprite text={markerLabel(name)} position={[0, 2.1, 0]} height={1.1} depthTest={false} />
    </group>
  );
}
