import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildLander, glintCap, LANDER_LIGHT, landerDust } from './landerMesh';
import { LANDER, PODS } from './landerShape';

describe('the lander’s mesh', () => {
  it('stands distM from the eye towards its azimuth, turned so its +x face looks towards faceAzDeg, with a lamp and a dish', () => {
    const l = buildLander(90, 16, 0, 70, 4);
    expect(l.group.position.x).toBeCloseTo(16, 6);
    expect(l.group.position.z).toBeCloseTo(0, 6);
    expect(l.group.rotation.y).toBeCloseTo(Math.PI / 2, 6);
    expect(l.lamp).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(l.group.children).toContain(l.dish);
    expect(l.group.getObjectByName('bell')).toBeDefined();
  });

  it('builds every part inside the bound ball, with the lamp clear of the struts and pods on its face, and the dust’s fill shared', () => {
    const l = buildLander(90, 16, 0, 70, 4);
    l.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(l.group), c = new THREE.Vector3(...LANDER.bound.c).add(l.group.position);
    for (const corner of [box.min, box.max]) expect(corner.distanceTo(c)).toBeLessThanOrEqual(LANDER.bound.r + 0.3);
    let meshes = 0;
    l.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes++;
    });
    expect(meshes).toBeGreaterThan(40); // tanks, braced legs, pods, payloads, tracker, omni, louvres, trims
    expect(l.dust.value).toBe(1);
    expect(landerDust(1)).toBe(LANDER_LIGHT.DUST);
    expect(landerDust(0)).toBe(1);
    // The lamp's bead sits on a face, clear of the pod and the strut's fitting on the diagonal faces.
    const lamp = l.lampPos.clone(), pods = PODS.map((p) => new THREE.Vector3(...p));
    for (const p of pods) expect(lamp.distanceTo(p)).toBeGreaterThan(0.12 + 0.07);
  });

  it('caps the foil’s glints under the bloom threshold: unchanged below the knee, never above the cap, always rising', () => {
    expect(glintCap(0.3)).toBeCloseTo(0.3, 9);
    expect(glintCap(0.5)).toBeCloseTo(0.5, 9);
    expect(glintCap(5)).toBeLessThanOrEqual(LANDER_LIGHT.GLINT_MAX);
    expect(glintCap(100)).toBeLessThanOrEqual(LANDER_LIGHT.GLINT_MAX);
    for (let l = 0.5; l < 4; l += 0.1) expect(glintCap(l + 0.1)).toBeGreaterThan(glintCap(l));
  });

  it('gives every drawn part but the power light that cap and the dust’s fill in its shader, all from the one shared value', () => {
    const l = buildLander(90, 16, 0, 70, 4);
    const mats = new Set<THREE.Material>();
    l.group.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      for (const x of Array.isArray(m) ? m : m ? [m] : []) if (x.visible && x !== l.lamp) mats.add(x);
    });
    expect(mats.size).toBeGreaterThan(8);
    const knee = LANDER_LIGHT.GLINT_KNEE.toFixed(3), span = (LANDER_LIGHT.GLINT_MAX - LANDER_LIGHT.GLINT_KNEE).toFixed(3);
    for (const m of mats) {
      expect(m).toBeInstanceOf(THREE.MeshStandardMaterial);
      const shader = { uniforms: {} as Record<string, unknown>, fragmentShader: 'void main() {\n#include <lights_fragment_maps>\n#include <opaque_fragment>\n}', vertexShader: '' };
      m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, null as unknown as THREE.WebGLRenderer);
      const fs = shader.fragmentShader;
      expect(shader.uniforms.uDust).toBe(l.dust);
      expect(fs).toContain('uniform float uDust;');
      // The dust's fill after the light all round is gathered; the cap last, on what the surface sends to the eye.
      expect(fs.indexOf('iblIrradiance *= uDust; radiance *= uDust;')).toBeGreaterThan(fs.indexOf('#include <lights_fragment_maps>'));
      const cap = fs.indexOf(`if (l > ${knee}) outgoingLight *= (${knee} + ${span} * (1.0 - exp((${knee} - l) / ${span}))) / l;`);
      expect(cap).toBeGreaterThan(0);
      expect(cap).toBeLessThan(fs.indexOf('#include <opaque_fragment>'));
      expect(m.customProgramCacheKey()).toBe('lander-look');
    }
  });
});
