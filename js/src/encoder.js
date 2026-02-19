/**
 * Encoder — mirrors Go encoder.go
 */

import { computeLayout } from "./layout.js";
import { DEFAULT_CONFIG } from "./index.js";

function bytesToBits(data) {
  const bits = [];
  for (const b of data) {
    for (let j = 7; j >= 0; j--) {
      bits.push((b >> j) & 1);
    }
  }
  return bits;
}

export class Encoder {
  constructor(config = DEFAULT_CONFIG) {
    this.config = config;
    this.layout = computeLayout(config);
  }

  totalDots() {
    let total = 0;
    for (let ring = 1; ring <= this.config.rings; ring++) {
      total += ring * 6;
    }
    return total;
  }

  bitsPerFrame() {
    return this.totalDots() * this.config.bitsPerDot;
  }

  bytesPerFrame() {
    return Math.floor(this.bitsPerFrame() / 8) - 2;
  }

  /**
   * Encode data bytes into frames.
   * @param {Uint8Array|number[]} data
   * @returns {Array<{index:number, total:number, dots:Array<{ring:number,index:number,value:number,x:number,y:number}>, payload:Uint8Array}>}
   */
  encode(data) {
    const bpf = this.bytesPerFrame();
    if (bpf <= 0) return [];

    let totalFrames = Math.ceil(data.length / bpf);
    if (totalFrames > 255) totalFrames = 255;
    if (totalFrames === 0) return [];

    const frames = [];
    for (let i = 0; i < totalFrames; i++) {
      const start = i * bpf;
      const end = Math.min(start + bpf, data.length);
      const chunk = data.slice(start, end);

      // Build frame bytes: [index, total, ...payload]
      const frameBytes = new Uint8Array(2 + chunk.length);
      frameBytes[0] = i;
      frameBytes[1] = totalFrames;
      frameBytes.set(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk), 2);

      // Pad to fill all dots
      const totalBits = this.bitsPerFrame();
      const totalBytes = Math.ceil(totalBits / 8);
      let padded = frameBytes;
      if (frameBytes.length < totalBytes) {
        padded = new Uint8Array(totalBytes);
        padded.set(frameBytes);
      }

      const dots = this._bytesToDots(padded);
      frames.push({
        index: i,
        total: totalFrames,
        dots,
        payload: chunk,
      });
    }
    return frames;
  }

  _bytesToDots(data) {
    const bits = bytesToBits(data);
    const bpd = this.config.bitsPerDot;
    let dotIndex = 0;
    const dots = [];

    for (const ring of this.layout.rings) {
      for (let j = 0; j < ring.positions.length; j++) {
        const bitStart = dotIndex * bpd;
        if (bitStart + bpd > bits.length) break;

        let value = 0;
        for (let b = 0; b < bpd; b++) {
          value = (value << 1) | bits[bitStart + b];
        }

        const pos = ring.positions[j];
        dots.push({
          ring: ring.dotCount / 6,
          index: j,
          value,
          x: pos.x,
          y: pos.y,
        });
        dotIndex++;
      }
    }
    return dots;
  }
}
