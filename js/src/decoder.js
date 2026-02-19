/**
 * Decoder — mirrors Go decoder.go
 */

import { DEFAULT_CONFIG } from "./index.js";

export class Decoder {
  constructor(config = DEFAULT_CONFIG) {
    this.config = config;
    this.frames = new Map();
    this.total = 0;
    this.received = 0;
  }

  /**
   * Add a frame's dots. Returns true if all frames received.
   * @param {Array<{value:number}>} dots
   * @returns {boolean}
   */
  addFrame(dots) {
    if (!dots || dots.length === 0) {
      throw new Error("dotbeam: invalid frame");
    }

    const data = this._dotsToBytes(dots);
    if (data.length < 2) {
      throw new Error("dotbeam: invalid frame header");
    }

    const frameIndex = data[0];
    const frameTotal = data[1];
    if (frameTotal === 0) {
      throw new Error("dotbeam: invalid frame total");
    }

    this.total = frameTotal;

    if (!this.frames.has(frameIndex)) {
      this.frames.set(frameIndex, data.slice(2));
      this.received++;
    }

    return this.received >= this.total;
  }

  /**
   * Get reassembled data. Throws if incomplete.
   * @returns {Uint8Array}
   */
  data() {
    if (this.received < this.total) {
      throw new Error("dotbeam: incomplete data");
    }

    const chunks = [];
    let totalLength = 0;
    for (let i = 0; i < this.total; i++) {
      const payload = this.frames.get(i);
      if (!payload) throw new Error("dotbeam: incomplete data");
      chunks.push(payload);
      totalLength += payload.length;
    }

    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  progress() {
    if (this.total === 0) return 0;
    return this.received / this.total;
  }

  reset() {
    this.frames.clear();
    this.total = 0;
    this.received = 0;
  }

  _dotsToBytes(dots) {
    const bpd = this.config.bitsPerDot;
    const bits = [];
    for (const dot of dots) {
      for (let b = bpd - 1; b >= 0; b--) {
        bits.push((dot.value >> b) & 1);
      }
    }

    const numBytes = Math.floor(bits.length / 8);
    const data = new Uint8Array(numBytes);
    for (let i = 0; i < numBytes; i++) {
      let val = 0;
      for (let j = 0; j < 8; j++) {
        val = (val << 1) | bits[i * 8 + j];
      }
      data[i] = val;
    }
    return data;
  }
}
