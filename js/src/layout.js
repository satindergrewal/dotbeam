/**
 * Circular dot layout math — mirrors Go layout.go
 */

const ANCHOR_RADIUS = 0.82;
const ANCHOR_ANGLES = [270, 30, 150]; // degrees
const MIN_RING_RADIUS = 0.22;
const MAX_RING_RADIUS = 0.70;

function angleToPoint(angleDeg, radius) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: radius * Math.cos(rad),
    y: -radius * Math.sin(rad), // screen Y is inverted
  };
}

function ringRadius(ring, totalRings) {
  if (totalRings === 1) return 0.4;
  return (
    MIN_RING_RADIUS +
    ((MAX_RING_RADIUS - MIN_RING_RADIUS) * (ring - 1)) / (totalRings - 1)
  );
}

/**
 * Compute layout for given config.
 * @param {{ rings: number }} config
 * @returns {{ anchors: Array<{x:number,y:number}>, rings: Array<{radius:number,dotCount:number,positions:Array<{x:number,y:number,angle:number}>}> }}
 */
export function computeLayout(config) {
  const anchors = ANCHOR_ANGLES.map((angle) =>
    angleToPoint(angle, ANCHOR_RADIUS)
  );

  const rings = [];
  for (let i = 1; i <= config.rings; i++) {
    const dotCount = i * 6;
    const radius = ringRadius(i, config.rings);
    const positions = [];
    for (let j = 0; j < dotCount; j++) {
      const angle = (j * 360) / dotCount;
      const p = angleToPoint(angle, radius);
      positions.push({ x: p.x, y: p.y, angle });
    }
    rings.push({ radius, dotCount, positions });
  }

  return { anchors, rings };
}

/**
 * Convert normalized coordinates to canvas pixels.
 */
export function scaleToCanvas(nx, ny, width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const scale = Math.min(cx, cy) * 0.95;
  return { x: cx + nx * scale, y: cy + ny * scale };
}
