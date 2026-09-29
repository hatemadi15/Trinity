'use client';
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { cameraPresetFor, type SceneMode } from './cameraPresets';

interface ControlsLike {
  target: Vector3;
  update: () => void;
}

interface Flight {
  from: Vector3;
  to: Vector3;
  fromTarget: Vector3;
  toTarget: Vector3;
  start: number;
  durationMs: number;
}

/** Flies the camera to the preset for the current mode/site; instant under reduced motion. */
export function CameraRig({ mode, site, reducedMotion }: { mode: SceneMode; site: { id: string; lat: number; lon: number }; reducedMotion: boolean }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as ControlsLike | null;
  const flight = useRef<Flight | null>(null);

  useEffect(() => {
    const preset = cameraPresetFor(mode, site, reducedMotion);
    const to = new Vector3(...preset.position);
    const toTarget = new Vector3(...preset.target);
    if (preset.durationMs === 0) {
      camera.position.copy(to);
      if (controls) {
        controls.target.copy(toTarget);
        controls.update();
      } else {
        camera.lookAt(toTarget);
      }
      flight.current = null;
      return;
    }
    flight.current = {
      from: camera.position.clone(),
      to,
      fromTarget: controls ? controls.target.clone() : new Vector3(),
      toTarget,
      start: performance.now(),
      durationMs: preset.durationMs,
    };
  }, [mode, site.id, site.lat, site.lon, reducedMotion, camera, controls, site]);

  useFrame(() => {
    const f = flight.current;
    if (!f) return;
    const t = Math.min(1, (performance.now() - f.start) / f.durationMs);
    const eased = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(f.from, f.to, eased);
    const target = new Vector3().lerpVectors(f.fromTarget, f.toTarget, eased);
    if (controls) {
      controls.target.copy(target);
      controls.update();
    } else {
      camera.lookAt(target);
    }
    if (t >= 1) flight.current = null;
  });

  return null;
}
