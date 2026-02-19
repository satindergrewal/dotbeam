/**
 * dotbeam — Beautiful animated visual data transfer.
 */

export const COLORS = [
  { r: 0xff, g: 0x44, b: 0x44, hex: "#ff4444" }, // Red
  { r: 0xff, g: 0x8c, b: 0x00, hex: "#ff8c00" }, // Orange
  { r: 0xff, g: 0xd7, b: 0x00, hex: "#ffd700" }, // Gold
  { r: 0x44, g: 0xff, b: 0x44, hex: "#44ff44" }, // Green
  { r: 0x00, g: 0xce, b: 0xd1, hex: "#00ced1" }, // Cyan
  { r: 0x44, g: 0x88, b: 0xff, hex: "#4488ff" }, // Blue
  { r: 0xaa, g: 0x44, b: 0xff, hex: "#aa44ff" }, // Purple
  { r: 0xff, g: 0x44, b: 0xff, hex: "#ff44ff" }, // Magenta
];

export const DEFAULT_CONFIG = {
  rings: 4,
  bitsPerDot: 3,
  fps: 5,
};

export { computeLayout, scaleToCanvas } from "./layout.js";
export { Encoder } from "./encoder.js";
export { Decoder } from "./decoder.js";
