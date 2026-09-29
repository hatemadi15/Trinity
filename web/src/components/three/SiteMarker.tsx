'use client';
import { Html } from '@react-three/drei';

/** A 2 m-radius, 400 m-tall pole at the site origin with a floating label (scene units are km). */
export function SiteMarker({ name }: { name: string }) {
  return (
    <group>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.4, 8]} />
        <meshBasicMaterial color="#f2b134" />
      </mesh>
      <Html position={[0, 0.5, 0]} center distanceFactor={30} style={{ pointerEvents: 'none' }}>
        <span className="whitespace-nowrap rounded bg-black/70 px-1.5 py-0.5 text-xs text-ink">{name}</span>
      </Html>
    </group>
  );
}
