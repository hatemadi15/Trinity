'use client';
import { useMemo } from 'react';
import { BufferAttribute, BufferGeometry } from 'three';
import type { Heightmap } from '@/lib/data/terrain';
import { latLonToPixel } from '@/lib/data/terrain';
import { cropHeightmap } from '@/lib/viz/terrain-crop';
import { buildTerrainGeometry, heightAtPixel } from '@/lib/viz/terrain-mesh';

/** Cap fallback window: ±25 px at 960 m = 48 km across, coarse but centred on the site. */
const CAP_HALF_PX = 25;

/** Picks the detailed window when present, otherwise a cap crop centred on the site. */
export function terrainSource(
  heightmap: Heightmap | null,
  cap: Heightmap | null,
  site: { lat: number; lon: number },
): { hm: Heightmap; detailed: boolean } | null {
  if (heightmap) return { hm: heightmap, detailed: true };
  if (!cap) return null;
  const px = latLonToPixel(cap.meta, site.lat, site.lon);
  const cropped = cropHeightmap(cap, px, CAP_HALF_PX);
  return { hm: { ...cropped, meta: { ...cropped.meta, site_height_m: heightAtPixel(cap, px.col, px.row) } }, detailed: false };
}

export function Terrain({
  heightmap,
  capHeightmap,
  site,
  exaggeration,
}: {
  heightmap: Heightmap | null;
  capHeightmap: Heightmap | null;
  site: { lat: number; lon: number };
  exaggeration: 1 | 3;
}) {
  const source = useMemo(() => terrainSource(heightmap, capHeightmap, site), [heightmap, capHeightmap, site]);
  const geometry = useMemo(() => {
    if (!source) return null;
    const { hm } = source;
    const g = buildTerrainGeometry(hm, {
      segments: source.detailed ? 256 : Math.min(64, hm.meta.width - 1),
      exaggeration,
      relativeTo: hm.meta.site_height_m,
      centerOn: { col: hm.meta.site_col_px, row: hm.meta.site_row_px },
    });
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(g.positions, 3));
    geo.setAttribute('normal', new BufferAttribute(g.normals, 3));
    geo.setAttribute('uv', new BufferAttribute(g.uv, 2));
    geo.setIndex(new BufferAttribute(g.indices, 1));
    return geo;
  }, [source, exaggeration]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#8a857c" roughness={1} metalness={0} />
    </mesh>
  );
}
