'use client';
import { useEffect, useRef } from 'react';
import type { DirectionalLight } from 'three';
import type { SceneState } from '@/lib/viz/scene-state';
import type { SceneMode } from './cameraPresets';
import { TextSprite } from './TextSprite';

/** Half-size (km) of the orthographic shadow box: the whole terrain window plus a margin, 14 km without one. */
export function shadowHalfKmFor(sizeKm: number | null): number {
  return sizeKm == null ? 14 : Math.ceil(sizeKm / 2 + 1.5);
}

/** Distance of the light from the origin: 10 Moon radii in globe mode, 600 km in terrain mode. */
const LIGHT_DIST = { globe: 10, terrain: 600 } as const;
/** Depth half-range of the shadow camera around the light distance (km); the window fits inside. */
const SHADOW_DEPTH_HALF_KM = 60;

/**
 * Directional Sun light plus Sun and Earth markers. In globe mode directions are in the Moon
 * frame (units of Moon radii); in terrain mode in the local site frame (units of km).
 * Shadow depth is measured over only ±60 km around the light, so the bias (a fraction of that
 * range) stays around 25 m instead of the kilometre it would be over a 0..2000 km range.
 */
export function SunAndEarth({ scene, mode, shadowHalfKm = 14 }: { scene: SceneState; mode: SceneMode; shadowHalfKm?: number }) {
  const sun = mode === 'globe' ? scene.sunDirMoon : scene.sunDirLocal;
  const earth = mode === 'globe' ? scene.earthDirMoon : scene.earthDirLocal;
  const k = mode === 'globe' ? 1 : 60;
  const intensity = mode === 'globe' ? 2.4 : 2.2 * scene.light.intensity;
  const castShadow = mode === 'terrain' && scene.light.castShadow;
  const lightDist = LIGHT_DIST[mode];
  const near = Math.max(0.1, lightDist - SHADOW_DEPTH_HALF_KM);
  const far = lightDist + SHADOW_DEPTH_HALF_KM;
  const light = useRef<DirectionalLight>(null);
  useEffect(() => {
    light.current?.shadow.camera.updateProjectionMatrix();
  }, [shadowHalfKm, near, far]);
  const at = (d: [number, number, number], r: number): [number, number, number] => [d[0] * r, d[1] * r, d[2] * r];
  return (
    <group>
      <directionalLight
        ref={light}
        position={at(sun, lightDist)}
        intensity={intensity}
        castShadow={castShadow}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-shadowHalfKm}
        shadow-camera-right={shadowHalfKm}
        shadow-camera-top={shadowHalfKm}
        shadow-camera-bottom={-shadowHalfKm}
        shadow-camera-near={near}
        shadow-camera-far={far}
        shadow-bias={-0.0002}
        shadow-normalBias={0.03}
      />
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
