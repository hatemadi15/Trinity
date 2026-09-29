'use client';
import { useEffect, useMemo } from 'react';
import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';

export interface LabelLayout {
  width: number;
  height: number;
  fontPx: number;
  padX: number;
  padY: number;
}

/** Canvas size for a label: measured text width plus padding, whole pixels, never narrower than 8 px. */
export function labelLayout(textWidth: number, fontPx = 28): LabelLayout {
  const padX = Math.round(fontPx * 0.45);
  const padY = Math.round(fontPx * 0.3);
  return {
    width: Math.max(8, Math.ceil(textWidth + 2 * padX)),
    height: Math.ceil(fontPx * 1.25 + 2 * padY),
    fontPx,
    padX,
    padY,
  };
}

export interface LabelStyle {
  color?: string;
  background?: string;
  fontPx?: number;
}

/**
 * Draws a text label on a 2D canvas and wraps it in a texture. Returns null where a 2D canvas is
 * unavailable (server rendering, jsdom) so callers render nothing instead of throwing.
 */
export function makeLabelTexture(text: string, style: LabelStyle = {}): { map: CanvasTexture; aspect: number } | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const fontPx = style.fontPx ?? 28;
  const family = (typeof getComputedStyle === 'function' && getComputedStyle(document.body).fontFamily) || 'system-ui, sans-serif';
  const font = `600 ${fontPx}px ${family}`;
  ctx.font = font;
  const layout = labelLayout(ctx.measureText(text).width, fontPx);
  canvas.width = layout.width;
  canvas.height = layout.height;
  ctx.font = font; // resizing resets the context state
  ctx.fillStyle = style.background ?? 'rgba(0, 0, 0, 0.65)';
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(0, 0, layout.width, layout.height, 6);
    ctx.fill();
  } else {
    ctx.fillRect(0, 0, layout.width, layout.height);
  }
  ctx.fillStyle = style.color ?? '#edeae4';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, layout.width / 2, layout.height / 2);
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.minFilter = LinearFilter;
  return { map, aspect: layout.width / layout.height };
}

/**
 * A camera-facing text label as a sprite. Unlike drei's Html it lives entirely inside the WebGL
 * scene, so mode switches never unmount a nested React root mid-render. `height` is in scene units.
 */
export function TextSprite({
  text,
  position,
  height,
  depthTest = true,
  color,
  background,
}: {
  text: string;
  position: [number, number, number];
  height: number;
  depthTest?: boolean;
  color?: string;
  background?: string;
}) {
  const tex = useMemo(() => makeLabelTexture(text, { color, background }), [text, color, background]);
  useEffect(() => () => tex?.map.dispose(), [tex]);
  if (!tex) return null;
  return (
    <sprite position={position} scale={[height * tex.aspect, height, 1]} renderOrder={depthTest ? 0 : 10}>
      <spriteMaterial map={tex.map} transparent depthTest={depthTest} depthWrite={false} />
    </sprite>
  );
}
