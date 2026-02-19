// renderer.js — The constellation renderer for dotbeam.
// Draws animated dot patterns on a Canvas 2D context.
// No dependencies beyond dotbeam-core.js (window.DotbeamCore).

(function () {
  "use strict";

  var BG_COLOR = "#0a0a1a";
  var DATA_DOT_RADIUS_FACTOR = 0.06; // relative to canvas half-size (large for camera readability)
  var ANCHOR_DOT_RADIUS_FACTOR = 0.065; // slightly larger than data dots
  var RING_GUIDE_OPACITY = 0.04;
  var TRANSITION_MS = 0; // instant frame changes (no blending = clean colors for scanner)
  var BREATHING_PERIOD_MS = 3000;
  var BREATHING_AMPLITUDE = 0; // disabled (constant size for scanner stability)

  // ── Helpers ────────────────────────────────────────────────────────

  function lerpChannel(a, b, t) {
    return Math.round(a + (b - a) * t);
  }

  function lerpColor(c1, c2, t) {
    return {
      r: lerpChannel(c1.r, c2.r, t),
      g: lerpChannel(c1.g, c2.g, t),
      b: lerpChannel(c1.b, c2.b, t),
    };
  }

  function rgbString(c) {
    return "rgb(" + c.r + "," + c.g + "," + c.b + ")";
  }

  function rgbaString(c, a) {
    return "rgba(" + c.r + "," + c.g + "," + c.b + "," + a + ")";
  }

  // Ease-in-out quad
  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  // ── DotbeamRenderer ────────────────────────────────────────────────

  /**
   * @param {HTMLCanvasElement} canvas
   */
  function DotbeamRenderer(canvas) {
    this._canvas = canvas;
    this._ctx = canvas.getContext("2d");
    this._rafId = null;
    this._running = false;

    // Data from the API
    this._frames = null; // array of frame objects
    this._config = null;
    this._layoutData = null;
    this._frameDurationMs = 200; // 1000 / fps

    // Animation state
    this._currentFrameIndex = 0;
    this._lastFrameChangeTime = 0;
    this._prevFrameColors = null; // array of {r,g,b} for previous frame's dots
    this._currFrameColors = null; // array of {r,g,b} for current frame's dots
    this._startTime = 0;

    // Resize handling
    this._resizeHandler = this._onResize.bind(this);
  }

  /**
   * Load frame data from the /api/frames JSON response.
   *
   * Expected shape:
   * {
   *   config: { rings, bitsPerDot, fps },
   *   frames: [
   *     { dots: [colorIndex, colorIndex, ...] },
   *     ...
   *   ]
   * }
   */
  DotbeamRenderer.prototype.load = function (apiData) {
    this._config = apiData.config || DotbeamCore.defaultConfig();
    this._frames = apiData.frames || [];
    this._layoutData = DotbeamCore.layout(this._config);
    this._frameDurationMs = 1000 / (this._config.fps || 5);

    // Pre-compute color arrays for each frame
    this._frameColorArrays = [];
    var palette = DotbeamCore.colors;
    for (var f = 0; f < this._frames.length; f++) {
      var dots = this._frames[f].dots || [];
      var colors = [];
      for (var d = 0; d < dots.length; d++) {
        var idx = dots[d].value !== undefined ? dots[d].value : dots[d];
        if (idx >= 0 && idx < palette.length) {
          colors.push({ r: palette[idx].r, g: palette[idx].g, b: palette[idx].b });
        } else {
          colors.push({ r: 0, g: 0, b: 0 });
        }
      }
      this._frameColorArrays.push(colors);
    }

    // Initialize transition state
    this._currentFrameIndex = 0;
    if (this._frameColorArrays.length > 0) {
      this._currFrameColors = this._frameColorArrays[0];
      this._prevFrameColors = this._frameColorArrays[0];
    }
  };

  /** Start the animation loop. */
  DotbeamRenderer.prototype.start = function () {
    if (this._running) return;
    if (!this._frames || this._frames.length === 0) return;

    this._running = true;
    this._startTime = performance.now();
    this._lastFrameChangeTime = this._startTime;

    window.addEventListener("resize", this._resizeHandler);
    this._onResize();
    this._tick(this._startTime);
  };

  /** Stop the animation loop. */
  DotbeamRenderer.prototype.stop = function () {
    this._running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    window.removeEventListener("resize", this._resizeHandler);
  };

  /** Full cleanup. */
  DotbeamRenderer.prototype.destroy = function () {
    this.stop();
    this._frames = null;
    this._layoutData = null;
    this._frameColorArrays = null;
    this._prevFrameColors = null;
    this._currFrameColors = null;
  };

  // ── Internal methods ───────────────────────────────────────────────

  DotbeamRenderer.prototype._onResize = function () {
    var parent = this._canvas.parentElement;
    if (!parent) return;

    var size = Math.min(parent.clientWidth, parent.clientHeight);
    // Use device pixel ratio for sharp rendering
    var dpr = window.devicePixelRatio || 1;
    this._canvas.width = size * dpr;
    this._canvas.height = size * dpr;
    this._canvas.style.width = size + "px";
    this._canvas.style.height = size + "px";
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._displaySize = size;
  };

  DotbeamRenderer.prototype._tick = function (now) {
    if (!this._running) return;

    this._update(now);
    this._draw(now);

    this._rafId = requestAnimationFrame(this._tick.bind(this));
  };

  DotbeamRenderer.prototype._update = function (now) {
    var elapsed = now - this._lastFrameChangeTime;

    // Check if it is time to advance to the next frame
    if (elapsed >= this._frameDurationMs) {
      this._lastFrameChangeTime = now;

      // Save current colors as previous for transition
      this._prevFrameColors = this._currFrameColors;

      // Advance frame index (loop)
      this._currentFrameIndex =
        (this._currentFrameIndex + 1) % this._frames.length;
      this._currFrameColors =
        this._frameColorArrays[this._currentFrameIndex];
    }
  };

  DotbeamRenderer.prototype._draw = function (now) {
    var ctx = this._ctx;
    var size = this._displaySize;
    if (!size) return;

    var cx = size / 2;
    var cy = size / 2;
    var scale = size / 2;

    var dataDotR = DATA_DOT_RADIUS_FACTOR * scale;
    var anchorDotR = ANCHOR_DOT_RADIUS_FACTOR * scale;

    // Breathing factor: gentle sine wave on dot sizes
    var breathPhase =
      ((now - this._startTime) % BREATHING_PERIOD_MS) / BREATHING_PERIOD_MS;
    var breathScale =
      1 + BREATHING_AMPLITUDE * Math.sin(breathPhase * 2 * Math.PI);

    // Color transition factor
    var timeSinceFrameChange = now - this._lastFrameChangeTime;
    var transitionT = Math.min(timeSinceFrameChange / TRANSITION_MS, 1);
    transitionT = easeInOut(transitionT);

    // ── Background ───────────────────────────────────────────────────
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, size, size);

    // ── Ring track guides ────────────────────────────────────────────
    if (this._layoutData) {
      ctx.strokeStyle = "rgba(255,255,255," + RING_GUIDE_OPACITY + ")";
      ctx.lineWidth = 1;
      for (var r = 0; r < this._layoutData.rings.length; r++) {
        var ring = this._layoutData.rings[r];
        var ringPx = ring.radius * scale;
        ctx.beginPath();
        ctx.arc(cx, cy, ringPx, 0, 2 * Math.PI);
        ctx.stroke();
      }
    }

    // ── Data dots ────────────────────────────────────────────────────
    if (this._layoutData && this._currFrameColors) {
      var allDots = [];
      for (var ri = 0; ri < this._layoutData.rings.length; ri++) {
        var dots = this._layoutData.rings[ri].dots;
        for (var di = 0; di < dots.length; di++) {
          allDots.push(dots[di]);
        }
      }

      for (var i = 0; i < allDots.length; i++) {
        var dot = allDots[i];
        var px = cx + dot.x * scale;
        var py = cy + dot.y * scale;

        // Determine interpolated color
        var color;
        if (
          this._prevFrameColors &&
          i < this._prevFrameColors.length &&
          i < this._currFrameColors.length
        ) {
          color = lerpColor(
            this._prevFrameColors[i],
            this._currFrameColors[i],
            transitionT
          );
        } else if (i < this._currFrameColors.length) {
          color = this._currFrameColors[i];
        } else {
          color = { r: 0, g: 0, b: 0 };
        }

        var radius = dataDotR * breathScale;

        // Solid core dot only (no glow — cleaner for camera-based scanning)
        ctx.fillStyle = rgbString(color);
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    // ── Anchor dots (drawn last, on top) ─────────────────────────────
    if (this._layoutData) {
      var white = { r: 255, g: 255, b: 255 };
      for (var ai = 0; ai < this._layoutData.anchors.length; ai++) {
        var anchor = this._layoutData.anchors[ai];
        var ax = cx + anchor.x * scale;
        var ay = cy + anchor.y * scale;
        var ar = anchorDotR * breathScale;

        // Anchor core (solid white, no glow — must be detectable as white blob)
        ctx.fillStyle = rgbString(white);
        ctx.beginPath();
        ctx.arc(ax, ay, ar, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  };

  // ── Export ──────────────────────────────────────────────────────────
  window.DotbeamRenderer = DotbeamRenderer;
})();
