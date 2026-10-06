import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildLander } from './landerMesh';

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
});
