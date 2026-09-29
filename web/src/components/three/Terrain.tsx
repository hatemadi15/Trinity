'use client';
import { useMemo } from 'react';
import { BufferAttribute, BufferGeometry } from 'three';
import type { Heightmap } from '@/lib/data/terrain';
import { latLonToPixel } from '@/lib/data/terrain';
import { cropHeightmap } from '@/lib/viz/terrain-crop';
import { buildTerrainGeometry, heightAtPixel, type TerrainGeometry } from '@/lib/viz/terrain-mesh';

/** Cap fallback window: ±25 px at 960 m = 48 km across, coarse but centred on the site. */
export const CAP_HALF_PX = 25;
/** Context ring around a detailed window: ±60 px at 960 m = 116 km across. */
const CONTEXT_HALF_PX = 60;
/** The context mesh sits this far below the datum so the detailed window always wins where they overlap. */
const CONTEXT_DROP_KM = 0.06;

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

/** Half-extent of a detailed window, in cap pixels, so the context mesh can leave a hole under it. */
export function contextHoleFor(window: Heightmap, cap: Heightmap): { halfCols: number; halfRows: number } {
  const w = window.meta;
  return {
    halfCols: (((w.width - 1) / 2) * w.cell_m) / cap.meta.cell_m,
    halfRows: (((w.height - 1) / 2) * w.cell_m) / cap.meta.cell_m,
  };
}

/**
 * Rotation about +y that turns the raster grid frame (+x = columns, +z = rows, so grid "up" points
 * along the lon 0 meridian) into the site's east/north/up frame. On a south polar stereographic map
 * true north at longitude λ is the radial direction (sin λ, cos λ) in map (x, y), so rotating the
 * mesh by λ about the vertical sends true north to −z and true east to +x. The projection is
 * conformal, so one rotation is exact for the whole window; the Sun light, Earth marker and camera
 * presets all live in the east/north/up frame and need no change.
 */
export function gridToEnuRotationY(lonDeg: number): number {
  return (lonDeg * Math.PI) / 180;
}

function toBufferGeometry(g: TerrainGeometry): BufferGeometry {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(g.positions, 3));
  geo.setAttribute('normal', new BufferAttribute(g.normals, 3));
  geo.setAttribute('uv', new BufferAttribute(g.uv, 2));
  geo.setIndex(new BufferAttribute(g.indices, 1));
  return geo;
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
    return toBufferGeometry(
      buildTerrainGeometry(hm, {
        segments: source.detailed ? 256 : Math.min(64, hm.meta.width - 1),
        exaggeration,
        relativeTo: hm.meta.site_height_m,
        centerOn: { col: hm.meta.site_col_px, row: hm.meta.site_row_px },
      }),
    );
  }, [source, exaggeration]);
  // Coarse south-cap ring around a detailed window, on the same datum, with the window cut out.
  const context = useMemo(() => {
    if (!heightmap || !capHeightmap) return null;
    const px = latLonToPixel(capHeightmap.meta, site.lat, site.lon);
    const cropped = cropHeightmap(capHeightmap, px, CONTEXT_HALF_PX);
    return toBufferGeometry(
      buildTerrainGeometry(cropped, {
        segments: cropped.meta.width - 1,
        exaggeration,
        relativeTo: heightmap.meta.site_height_m,
        centerOn: { col: cropped.meta.site_col_px, row: cropped.meta.site_row_px },
        hole: contextHoleFor(heightmap, capHeightmap),
      }),
    );
  }, [heightmap, capHeightmap, site, exaggeration]);
  if (!geometry) return null;
  return (
    <group rotation={[0, gridToEnuRotationY(site.lon), 0]}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color="#8a857c" roughness={1} metalness={0} />
      </mesh>
      {context && (
        <mesh geometry={context} position={[0, -CONTEXT_DROP_KM * exaggeration, 0]} receiveShadow>
          <meshStandardMaterial color="#7f7a72" roughness={1} metalness={0} />
        </mesh>
      )}
    </group>
  );
}
