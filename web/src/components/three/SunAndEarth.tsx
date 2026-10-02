'use client';
import type { SceneState } from '@/lib/viz/scene-state';
import type { SceneMode } from './cameraPresets';
import { TextSprite } from './TextSprite';

/** Distance of the light from the origin: 10 Moon radii in globe mode, 600 km in terrain mode. */
const LIGHT_DIST = { globe: 10, terrain: 600 } as const;

/**
 * Directional Sun light plus Sun and Earth markers. In globe mode directions are in the Moon frame
 * (units of Moon radii); in terrain mode in the local site frame (units of km). The terrain itself is
 * painted with the shadow picture, so the light only shades the globe, the Earth marker and the plain
 * ground shown before the first picture arrives.
 */
export function SunAndEarth({ scene, mode }: { scene: SceneState; mode: SceneMode }) {
  const sun = mode === 'globe' ? scene.sunDirMoon : scene.sunDirLocal;
  const earth = mode === 'globe' ? scene.earthDirMoon : scene.earthDirLocal;
  const k = mode === 'globe' ? 1 : 60;
  const intensity = mode === 'globe' ? 2.4 : 2.2 * scene.light.intensity;
  const at = (d: [number, number, number], r: number): [number, number, number] => [d[0] * r, d[1] * r, d[2] * r];
  return (
    <group>
      <directionalLight position={at(sun, LIGHT_DIST[mode])} intensity={intensity} />
      <mesh position={at(sun, 4 * k)}>
        <sphereGeometry args={[0.06 * k, 16, 16]} />
        <meshBasicMaterial color="#f2b134" />
      </mesh>
      <group position={at(earth, 6 * k)}>
        <mesh>
          <sphereGeometry args={[0.12 * k, 24, 24]} />
          <meshStandardMaterial color="#3987e5" emissive="#123a6e" roughness={0.8} />
        </mesh>
        <TextSprite text="Earth" position={[0, 0.3 * k, 0]} height={0.24 * k} />
      </group>
    </group>
  );
}
