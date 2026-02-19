// dotbeam-core.js — Browser-side encoding/layout logic mirroring the Go package.
// No dependencies. Vanilla JS.

(function () {
  "use strict";

  // ── 8-color palette ────────────────────────────────────────────────
  var PALETTE = [
    { r: 0xff, g: 0x44, b: 0x44, hex: "#FF4444" }, // Red
    { r: 0xff, g: 0x8c, b: 0x00, hex: "#FF8C00" }, // Orange
    { r: 0xff, g: 0xd7, b: 0x00, hex: "#FFD700" }, // Gold
    { r: 0x44, g: 0xff, b: 0x44, hex: "#44FF44" }, // Green
    { r: 0x00, g: 0xce, b: 0xd1, hex: "#00CED1" }, // Cyan
    { r: 0x44, g: 0x88, b: 0xff, hex: "#4488FF" }, // Blue
    { r: 0xaa, g: 0x44, b: 0xff, hex: "#AA44FF" }, // Purple
    { r: 0xff, g: 0x44, b: 0xff, hex: "#FF44FF" }, // Magenta
  ];

  // ── Default configuration ──────────────────────────────────────────
  function defaultConfig() {
    return {
      rings: 4,
      bitsPerDot: 3, // log2(8) = 3 bits per dot with 8 colors
      fps: 5,
    };
  }

  // ── Layout computation ─────────────────────────────────────────────
  // Mirrors the Go layout.go logic.
  //
  // All positions are in normalized coordinates where the full pattern
  // fits inside a unit circle (radius 1.0 centered at 0,0).
  //
  // Anchors: 3 dots at radius 0.82, placed at 270deg, 30deg, 150deg
  //          (top-center, bottom-right, bottom-left in screen coords).
  //
  // Rings:   Ring N (1-indexed) has N*6 dots.
  //          Radii are evenly distributed from 0.22 to 0.70.

  var ANCHOR_RADIUS = 0.82;
  var ANCHOR_ANGLES_DEG = [270, 30, 150];
  var RING_RADIUS_MIN = 0.22;
  var RING_RADIUS_MAX = 0.70;

  function degToRad(deg) {
    return (deg * Math.PI) / 180;
  }

  /**
   * Compute layout positions for a given config.
   *
   * @param {object} [config] — optional, defaults to defaultConfig()
   * @returns {{
   *   anchors: Array<{x: number, y: number, angle: number}>,
   *   rings: Array<{
   *     ringIndex: number,
   *     radius: number,
   *     dots: Array<{x: number, y: number, angle: number, dotIndex: number}>
   *   }>,
   *   totalDots: number,
   *   config: object
   * }}
   */
  function layout(config) {
    config = config || defaultConfig();
    var numRings = config.rings;

    // ── Anchors ──────────────────────────────────────────────────────
    var anchors = [];
    for (var a = 0; a < ANCHOR_ANGLES_DEG.length; a++) {
      var aDeg = ANCHOR_ANGLES_DEG[a];
      var aRad = degToRad(aDeg);
      anchors.push({
        x: Math.cos(aRad) * ANCHOR_RADIUS,
        y: -Math.sin(aRad) * ANCHOR_RADIUS, // Negative: screen Y is inverted (matches Go)
        angle: aRad,
      });
    }

    // ── Data rings ───────────────────────────────────────────────────
    var rings = [];
    var totalDots = 0;

    for (var n = 1; n <= numRings; n++) {
      var dotsInRing = n * 6;
      // Distribute ring radii evenly between min and max.
      // With 1 ring  -> radius = midpoint.
      // With N rings -> evenly spaced from min to max.
      var radius;
      if (numRings === 1) {
        radius = (RING_RADIUS_MIN + RING_RADIUS_MAX) / 2;
      } else {
        radius =
          RING_RADIUS_MIN +
          ((RING_RADIUS_MAX - RING_RADIUS_MIN) * (n - 1)) / (numRings - 1);
      }

      var dots = [];
      for (var d = 0; d < dotsInRing; d++) {
        // Evenly space dots around the ring.
        // Start from angle 0 and go counter-clockwise.
        var angle = (2 * Math.PI * d) / dotsInRing;
        dots.push({
          x: Math.cos(angle) * radius,
          y: -Math.sin(angle) * radius, // Negative: screen Y is inverted (matches Go)
          angle: angle,
          dotIndex: totalDots + d,
        });
      }

      rings.push({
        ringIndex: n,
        radius: radius,
        dots: dots,
      });

      totalDots += dotsInRing;
    }

    return {
      anchors: anchors,
      rings: rings,
      totalDots: totalDots,
      config: config,
    };
  }

  // ── Public API ─────────────────────────────────────────────────────
  window.DotbeamCore = {
    colors: PALETTE,
    layout: layout,
    defaultConfig: defaultConfig,

    // Expose constants for external use
    ANCHOR_RADIUS: ANCHOR_RADIUS,
    ANCHOR_ANGLES_DEG: ANCHOR_ANGLES_DEG,
    RING_RADIUS_MIN: RING_RADIUS_MIN,
    RING_RADIUS_MAX: RING_RADIUS_MAX,
  };
})();
