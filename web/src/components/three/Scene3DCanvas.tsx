'use client';
import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { CameraRig } from './CameraRig';
import { Globe } from './Globe';
import { SunAndEarth } from './SunAndEarth';
import type { Scene3DProps } from './Scene3D';

export function Scene3DCanvas(props: Scene3DProps) {
  const { mode, scene, site, sites, onPick, reducedMotion = false } = props;
  const textureUrl = props.textureUrl ?? '/data/terrain/lroc_color_2k.jpg';
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ fov: 40, near: 0.01, far: 400, position: [0, -2, 3] }}
      gl={{ antialias: true }}
      style={{ background: '#000000', width: '100%', height: '100%' }}
    >
      <color attach="background" args={['#000000']} />
      <ambientLight intensity={0.08} />
      {mode === 'globe' && (
        <>
          <Stars radius={60} depth={20} count={1500} factor={2} saturation={0} fade={false} speed={0} />
          <Suspense fallback={null}>
            <Globe site={site} sites={sites} textureUrl={textureUrl} onPick={onPick} />
          </Suspense>
          <SunAndEarth scene={scene} mode="globe" />
        </>
      )}
      <CameraRig mode={mode} site={site} reducedMotion={reducedMotion} />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        minDistance={mode === 'globe' ? 1.4 : 1}
        maxDistance={mode === 'globe' ? 8 : 80}
      />
    </Canvas>
  );
}
