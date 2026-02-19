// scanner.js — Camera capture and dot detection for dotbeam.
// Opens the rear camera, detects anchor dots, samples data dot colors,
// matches them to the palette, and reconstructs the transmitted payload.
// No dependencies beyond dotbeam-core.js (window.DotbeamCore).

(function () {
  "use strict";

  var palette = DotbeamCore.colors;

  // Pre-compute palette hues for fast matching.
  var paletteHues = [];
  for (var pi = 0; pi < palette.length; pi++) {
    paletteHues.push(rgbToHue(palette[pi].r, palette[pi].g, palette[pi].b));
  }

  // ── Helpers ────────────────────────────────────────────────────────

  /** Convert RGB (0-255) to hue in degrees (0-360). Returns -1 if achromatic. */
  function rgbToHue(r, g, b) {
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var delta = max - min;
    if (delta < 10) return -1; // near-achromatic
    var hue;
    if (max === r) {
      hue = ((g - b) / delta) % 6;
    } else if (max === g) {
      hue = (b - r) / delta + 2;
    } else {
      hue = (r - g) / delta + 4;
    }
    hue *= 60;
    if (hue < 0) hue += 360;
    return hue;
  }

  /** Angular distance between two hues (0-180). */
  function hueDist(h1, h2) {
    var d = Math.abs(h1 - h2);
    return d > 180 ? 360 - d : d;
  }

  /** Euclidean distance squared in RGB space. */
  function colorDistSq(r1, g1, b1, r2, g2, b2) {
    var dr = r1 - r2;
    var dg = g1 - g2;
    var db = b1 - b2;
    return dr * dr + dg * dg + db * db;
  }

  /**
   * Return palette index of the nearest color.
   * Uses hue-based matching (robust to camera exposure/white-balance shifts)
   * with RGB fallback for achromatic or very dark samples.
   */
  function matchColor(r, g, b) {
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var sat = max === 0 ? 0 : (max - min) / max;

    // If the sample is saturated enough, match primarily by hue.
    // Hue is invariant to brightness/contrast changes from the camera.
    if (sat > 0.15 && max > 30) {
      var sampleHue = rgbToHue(r, g, b);
      if (sampleHue >= 0) {
        var bestIdx = 0;
        var bestDist = Infinity;
        for (var i = 0; i < palette.length; i++) {
          var hd = hueDist(sampleHue, paletteHues[i]);
          if (hd < bestDist) {
            bestDist = hd;
            bestIdx = i;
          }
        }
        return bestIdx;
      }
    }

    // Fallback: Euclidean RGB distance (for achromatic/dark samples)
    var bestIdx2 = 0;
    var bestDist2 = Infinity;
    for (var j = 0; j < palette.length; j++) {
      var d = colorDistSq(r, g, b, palette[j].r, palette[j].g, palette[j].b);
      if (d < bestDist2) {
        bestDist2 = d;
        bestIdx2 = j;
      }
    }
    return bestIdx2;
  }

  /** Distance between two 2D points. */
  function dist(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Centroid of a set of points. */
  function centroid(points) {
    var sx = 0,
      sy = 0;
    for (var i = 0; i < points.length; i++) {
      sx += points[i].x;
      sy += points[i].y;
    }
    return { x: sx / points.length, y: sy / points.length };
  }

  // ── Blob detection for anchors ─────────────────────────────────────

  /**
   * Two-pass bright-white blob finder with saturation filtering.
   *
   * Pass 1: grid-based flood fill to find bright blobs.
   * Pass 2: for each blob centroid, verify the centre is actually WHITE
   *         (low saturation) — not just a bright coloured area that happens
   *         to have all channels above threshold through the camera.
   *
   * Returns an array of {x, y, size} blobs sorted by size descending.
   * Large blobs (likely screen glare) are capped / discarded.
   */
  function findWhiteBlobs(imageData, width, height) {
    var data = imageData.data;
    var THRESHOLD = 180; // raised — 160 was too permissive
    var CELL_SIZE = 8;

    // Maximum blob size in grid cells.  A real anchor dot at typical viewing
    // distance produces ≤ 30 cells.  Blobs bigger than this are screen glare.
    var MAX_BLOB_CELLS = 60;

    var gridW = Math.ceil(width / CELL_SIZE);
    var gridH = Math.ceil(height / CELL_SIZE);
    var grid = new Uint8Array(gridW * gridH);

    // Mark grid cells that contain bright pixels (all channels > threshold)
    for (var y = 0; y < height; y += 2) {
      for (var x = 0; x < width; x += 2) {
        var idx = (y * width + x) * 4;
        var r = data[idx];
        var g = data[idx + 1];
        var b = data[idx + 2];
        if (r > THRESHOLD && g > THRESHOLD && b > THRESHOLD) {
          var gx = Math.floor(x / CELL_SIZE);
          var gy = Math.floor(y / CELL_SIZE);
          grid[gy * gridW + gx] = 1;
        }
      }
    }

    // Flood-fill connected components
    var visited = new Uint8Array(gridW * gridH);
    var blobs = [];

    for (var gy2 = 0; gy2 < gridH; gy2++) {
      for (var gx2 = 0; gx2 < gridW; gx2++) {
        var gi = gy2 * gridW + gx2;
        if (grid[gi] && !visited[gi]) {
          var queue = [gi];
          visited[gi] = 1;
          var cells = [];

          while (queue.length > 0) {
            var ci = queue.shift();
            var cx2 = ci % gridW;
            var cy2 = Math.floor(ci / gridW);
            cells.push({ x: cx2, y: cy2 });

            var neighbors = [
              cy2 > 0 ? (cy2 - 1) * gridW + cx2 : -1,
              cy2 < gridH - 1 ? (cy2 + 1) * gridW + cx2 : -1,
              cx2 > 0 ? cy2 * gridW + (cx2 - 1) : -1,
              cx2 < gridW - 1 ? cy2 * gridW + (cx2 + 1) : -1,
            ];
            for (var ni = 0; ni < neighbors.length; ni++) {
              var n = neighbors[ni];
              if (n >= 0 && grid[n] && !visited[n]) {
                visited[n] = 1;
                queue.push(n);
              }
            }
          }

          // Reject blobs that are too small or too large
          if (cells.length < 2 || cells.length > MAX_BLOB_CELLS) continue;

          var bx = 0,
            by = 0;
          for (var ci2 = 0; ci2 < cells.length; ci2++) {
            bx += cells[ci2].x * CELL_SIZE + CELL_SIZE / 2;
            by += cells[ci2].y * CELL_SIZE + CELL_SIZE / 2;
          }
          var centX = bx / cells.length;
          var centY = by / cells.length;

          // Verify the blob centre is actually WHITE (low saturation).
          // Sample a 5×5 patch at the centroid and check average saturation.
          var pcx = Math.round(centX);
          var pcy = Math.round(centY);
          var sumR = 0, sumG = 0, sumB = 0, cnt = 0;
          for (var py2 = pcy - 2; py2 <= pcy + 2; py2++) {
            for (var px2 = pcx - 2; px2 <= pcx + 2; px2++) {
              if (px2 >= 0 && px2 < width && py2 >= 0 && py2 < height) {
                var pi2 = (py2 * width + px2) * 4;
                sumR += data[pi2];
                sumG += data[pi2 + 1];
                sumB += data[pi2 + 2];
                cnt++;
              }
            }
          }
          if (cnt > 0) {
            var avgR = sumR / cnt;
            var avgG = sumG / cnt;
            var avgB = sumB / cnt;
            var cMax = Math.max(avgR, avgG, avgB);
            var cMin = Math.min(avgR, avgG, avgB);
            var cSat = cMax > 0 ? (cMax - cMin) / cMax : 0;
            // Reject blobs whose centre is too colourful (> 25% saturation).
            // Actual white dots through a camera have saturation < 0.15.
            if (cSat > 0.25) continue;
          }

          blobs.push({ x: centX, y: centY, size: cells.length });
        }
      }
    }

    // Sort by size descending
    blobs.sort(function (a, b) {
      return b.size - a.size;
    });

    return blobs;
  }

  /**
   * Given 3 blobs, verify they form an approximately equilateral triangle
   * AND have roughly similar sizes (all three are the same kind of dot).
   * Returns true if the side lengths are within 30% of each other.
   */
  function isEquilateralTriangle(a, b, c) {
    // Side lengths
    var d1 = dist(a, b);
    var d2 = dist(b, c);
    var d3 = dist(a, c);
    var avg = (d1 + d2 + d3) / 3;
    if (avg < 20) return false; // too small (raised from 10)
    var tolerance = 0.3;
    if (
      Math.abs(d1 - avg) / avg >= tolerance ||
      Math.abs(d2 - avg) / avg >= tolerance ||
      Math.abs(d3 - avg) / avg >= tolerance
    ) {
      return false;
    }

    // Blob sizes should be in the same ballpark (within 3× of each other).
    // This rejects triples where a huge glare blob is mixed with real anchors.
    var sizes = [a.size, b.size, c.size];
    var minSize = Math.min(sizes[0], sizes[1], sizes[2]);
    var maxSize = Math.max(sizes[0], sizes[1], sizes[2]);
    if (maxSize > minSize * 3) return false;

    return true;
  }

  /**
   * Given 3 anchor points (detected blobs), determine the rotation and
   * scale of the dotbeam pattern.
   *
   * In screen coordinates (with -sin for Y), the anchors sit at:
   *   270deg anchor → (0, +0.82)   → bottom-center
   *   30deg anchor  → (+0.71, -0.41) → top-right
   *   150deg anchor → (-0.71, -0.41) → top-left
   *
   * The bottommost blob (largest screen Y) is the 270deg anchor.
   *
   * Returns { center, scale, rotation } or null if detection failed.
   */
  function deriveTransform(blobs) {
    if (blobs.length < 3) return null;

    // Search all filtered blobs (up to 10) for an equilateral triple.
    var candidates = null;
    var limit = Math.min(blobs.length, 10);
    outer:
    for (var i = 0; i < limit - 2; i++) {
      for (var j = i + 1; j < limit - 1; j++) {
        for (var k = j + 1; k < limit; k++) {
          if (isEquilateralTriangle(blobs[i], blobs[j], blobs[k])) {
            candidates = [blobs[i], blobs[j], blobs[k]];
            break outer;
          }
        }
      }
    }
    if (!candidates) return null;

    // Center is the centroid of the triangle
    var center = centroid(candidates);

    // Average distance from center to anchors is the pixel radius
    // corresponding to the pattern anchor radius of 0.82
    var avgDist = 0;
    for (var i2 = 0; i2 < 3; i2++) {
      avgDist += dist(center, candidates[i2]);
    }
    avgDist /= 3;

    var scale = avgDist / DotbeamCore.ANCHOR_RADIUS;

    // The 270deg anchor is the bottommost blob (largest Y in screen coords).
    var bottomIdx = 0;
    for (var m = 1; m < 3; m++) {
      if (candidates[m].y > candidates[bottomIdx].y) {
        bottomIdx = m;
      }
    }

    // Compute actual angle from center to the bottom blob in camera coords.
    var bottomBlob = candidates[bottomIdx];
    var detectedAngle = Math.atan2(
      bottomBlob.y - center.y,
      bottomBlob.x - center.x
    );
    // In screen coords, the 270deg anchor is at (0, +0.82) → angle PI/2
    var expectedAngle = Math.PI / 2;
    var rotation = detectedAngle - expectedAngle;

    // Normalize to [-PI, PI]
    while (rotation > Math.PI) rotation -= 2 * Math.PI;
    while (rotation < -Math.PI) rotation += 2 * Math.PI;

    return {
      center: center,
      scale: scale,
      rotation: rotation,
      anchors: candidates, // the 3 blobs chosen as anchors
    };
  }

  // ── Dot sampling ───────────────────────────────────────────────────

  /**
   * Given a transform and layout, sample pixel colors at each dot
   * position and return an array of palette indices.
   */
  function sampleDots(imageData, width, transform, layoutData) {
    var data = imageData.data;
    var center = transform.center;
    var scale = transform.scale;
    var rotation = transform.rotation;

    var allDots = [];
    for (var ri = 0; ri < layoutData.rings.length; ri++) {
      var ring = layoutData.rings[ri];
      for (var di = 0; di < ring.dots.length; di++) {
        allDots.push(ring.dots[di]);
      }
    }

    var results = [];
    // Larger sample area to capture the dot core through camera blur.
    var sampleRadius = Math.max(2, Math.floor(scale * 0.025));

    // Pre-compute rotation matrix once (constant for all dots in a frame).
    var cosR = Math.cos(rotation);
    var sinR = Math.sin(rotation);

    for (var i = 0; i < allDots.length; i++) {
      var dot = allDots[i];

      // Transform pattern coordinates to pixel coordinates.
      var rx = dot.x * cosR - dot.y * sinR;
      var ry = dot.x * sinR + dot.y * cosR;
      var px = Math.round(center.x + rx * scale);
      var py = Math.round(center.y + ry * scale);

      // Sample a small area around the dot center and average.
      // Use only pixels within the circular sample area (not a square).
      var totalR = 0,
        totalG = 0,
        totalB = 0,
        count = 0;
      var sr2 = sampleRadius * sampleRadius;

      for (var sy = -sampleRadius; sy <= sampleRadius; sy++) {
        for (var sx = -sampleRadius; sx <= sampleRadius; sx++) {
          if (sx * sx + sy * sy > sr2) continue; // circular sampling
          var spx = px + sx;
          var spy = py + sy;
          if (spx >= 0 && spx < width && spy >= 0 && spy < imageData.height) {
            var idx = (spy * width + spx) * 4;
            totalR += data[idx];
            totalG += data[idx + 1];
            totalB += data[idx + 2];
            count++;
          }
        }
      }

      if (count > 0) {
        results.push(
          matchColor(
            Math.round(totalR / count),
            Math.round(totalG / count),
            Math.round(totalB / count)
          )
        );
      } else {
        results.push(0);
      }
    }

    return results;
  }

  // ── JS Decoder ─────────────────────────────────────────────────────

  /**
   * Minimal decoder that reassembles frames into a payload.
   *
   * Each frame's dot data starts with a 2-byte header:
   *   byte 0: frame index (0-based)
   *   byte 1: total number of frames
   *
   * The remaining bytes are payload data.
   *
   * With 3 bits per dot, every group of 8 dots encodes 3 bytes
   * (8 dots * 3 bits = 24 bits = 3 bytes).
   */
  function Decoder() {
    this._frames = {}; // frameIndex -> Uint8Array of payload bytes
    this._totalFrames = null;
    this._received = 0;
  }

  /** Convert an array of palette indices (0-7, 3 bits each) into bytes. */
  Decoder.prototype._dotsToBytes = function (dotValues) {
    // Pack 3-bit values into a bit stream, then extract bytes.
    var bits = [];
    for (var i = 0; i < dotValues.length; i++) {
      var val = dotValues[i] & 0x07; // 3 bits
      bits.push((val >> 2) & 1);
      bits.push((val >> 1) & 1);
      bits.push(val & 1);
    }

    var bytes = [];
    for (var b = 0; b + 7 < bits.length; b += 8) {
      var byte = 0;
      for (var bi = 0; bi < 8; bi++) {
        byte = (byte << 1) | bits[b + bi];
      }
      bytes.push(byte);
    }
    return new Uint8Array(bytes);
  };

  /**
   * Feed a frame's dot values into the decoder.
   * Returns { complete: bool, progress: number (0-1) }.
   */
  Decoder.prototype.addFrame = function (dotValues) {
    var rawBytes = this._dotsToBytes(dotValues);
    if (rawBytes.length < 2) {
      return { complete: false, progress: this.progress() };
    }

    var frameIndex = rawBytes[0];
    var totalFrames = rawBytes[1];

    // Sanity checks: reject clearly invalid headers
    if (totalFrames === 0 || totalFrames > 200) {
      return { complete: false, progress: this.progress() };
    }
    if (frameIndex >= totalFrames) {
      return { complete: false, progress: this.progress() };
    }

    // If totalFrames changes from what we've been tracking, the previous
    // readings were likely noise — reset and start fresh.
    if (this._totalFrames !== null && totalFrames !== this._totalFrames) {
      this._frames = {};
      this._received = 0;
    }

    this._totalFrames = totalFrames;

    // Payload is everything after the 2-byte header
    var payload = rawBytes.slice(2);

    if (!this._frames[frameIndex]) {
      this._frames[frameIndex] = payload;
      this._received++;
    }

    return {
      complete: this._received >= this._totalFrames,
      progress: this.progress(),
    };
  };

  /** Current progress from 0 to 1. */
  Decoder.prototype.progress = function () {
    if (!this._totalFrames) return 0;
    return Math.min(this._received / this._totalFrames, 1);
  };

  /** Reassemble all frames into the final payload. */
  Decoder.prototype.reassemble = function () {
    if (!this._totalFrames) return new Uint8Array(0);

    var chunks = [];
    for (var i = 0; i < this._totalFrames; i++) {
      if (this._frames[i]) {
        chunks.push(this._frames[i]);
      }
    }

    // Concatenate
    var totalLen = 0;
    for (var j = 0; j < chunks.length; j++) {
      totalLen += chunks[j].length;
    }
    var result = new Uint8Array(totalLen);
    var offset = 0;
    for (var k = 0; k < chunks.length; k++) {
      result.set(chunks[k], offset);
      offset += chunks[k].length;
    }

    return result;
  };

  /** Decode the final payload as a UTF-8 string. */
  Decoder.prototype.getText = function () {
    var bytes = this.reassemble();
    // Use TextDecoder if available
    if (typeof TextDecoder !== "undefined") {
      return new TextDecoder("utf-8").decode(bytes);
    }
    // Fallback
    var str = "";
    for (var i = 0; i < bytes.length; i++) {
      str += String.fromCharCode(bytes[i]);
    }
    return str;
  };

  /** Reset the decoder for a new scan. */
  Decoder.prototype.reset = function () {
    this._frames = {};
    this._totalFrames = null;
    this._received = 0;
  };

  // ── DotbeamScanner ─────────────────────────────────────────────────

  /**
   * @param {HTMLVideoElement} videoElement — displays the camera feed
   * @param {HTMLCanvasElement} overlayCanvas — drawn over the video for
   *        progress ring and other UI
   */
  function DotbeamScanner(videoElement, overlayCanvas, options) {
    this._video = videoElement;
    this._overlay = overlayCanvas;
    this._overlayCtx = overlayCanvas.getContext("2d");

    this._offscreen = document.createElement("canvas");
    this._offscreenCtx = this._offscreen.getContext("2d", {
      willReadFrequently: true,
    });

    this._stream = null;
    this._rafId = null;
    this._running = false;
    this._decoder = new Decoder();

    this._layoutData = DotbeamCore.layout(DotbeamCore.defaultConfig());

    // Callbacks (can be set via options or .onProgress()/.onComplete()/.onError())
    var opts = options || {};
    this._onProgress = opts.onProgress || null;
    this._onComplete = opts.onComplete || null;
    this._onError = opts.onError || null;

    // Scan timing
    this._lastScanTime = 0;
    this._scanIntervalMs = 100; // scan at ~10 Hz

    // Debug state (always collected; drawn when debug=true in URL)
    this._debug = /[?&]debug/.test(window.location.search);
    this._dbgBlobs = null;         // detected blobs (all)
    this._dbgAnchors = null;       // the 3 selected anchor blobs
    this._dbgTransform = null;     // derived transform
    this._dbgDotPositions = null;  // [{x,y,colorIdx}] in video coords
    this._dbgHeader = null;        // {frameIndex, totalFrames} from last decode
    this._dbgBlobCount = 0;
    this._dbgStatus = "waiting";   // waiting | no-blobs | no-triangle | sampling | decoded
  }

  /** Register a progress callback: function(progress: 0-1) */
  DotbeamScanner.prototype.onProgress = function (cb) {
    this._onProgress = cb;
  };

  /** Register a completion callback: function(text: string) */
  DotbeamScanner.prototype.onComplete = function (cb) {
    this._onComplete = cb;
  };

  /** Register an error callback: function(error: Error) */
  DotbeamScanner.prototype.onError = function (cb) {
    this._onError = cb;
  };

  /** Start the camera and begin scanning. Returns a Promise. */
  DotbeamScanner.prototype.start = function () {
    if (this._running) return Promise.resolve();
    this._running = true;
    this._decoder.reset();

    var self = this;
    var constraints = {
      video: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    };

    return navigator.mediaDevices
      .getUserMedia(constraints)
      .then(function (stream) {
        self._stream = stream;
        self._video.srcObject = stream;
        self._video.setAttribute("playsinline", "true");
        self._video.play();

        // Wait for video to be ready
        self._video.addEventListener("loadedmetadata", function onMeta() {
          self._video.removeEventListener("loadedmetadata", onMeta);
          self._offscreen.width = self._video.videoWidth;
          self._offscreen.height = self._video.videoHeight;
          self._tick(performance.now());
        });
      })
      .catch(function (err) {
        self._running = false;
        if (self._onError) {
          self._onError(err);
        }
        throw err; // re-throw so .catch() on start() works
      });
  };

  /** Stop the camera and scanning. */
  DotbeamScanner.prototype.stop = function () {
    this._running = false;

    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    if (this._stream) {
      var tracks = this._stream.getTracks();
      for (var i = 0; i < tracks.length; i++) {
        tracks[i].stop();
      }
      this._stream = null;
    }

    this._video.srcObject = null;
  };

  // ── Internal methods ───────────────────────────────────────────────

  DotbeamScanner.prototype._tick = function (now) {
    if (!this._running) return;

    // Throttle scanning
    if (now - this._lastScanTime >= this._scanIntervalMs) {
      this._lastScanTime = now;
      this._scan();
    }

    this._drawOverlay();

    this._rafId = requestAnimationFrame(this._tick.bind(this));
  };

  DotbeamScanner.prototype._scan = function () {
    var vw = this._video.videoWidth;
    var vh = this._video.videoHeight;
    if (!vw || !vh) return;

    // Capture frame to offscreen canvas
    this._offscreenCtx.drawImage(this._video, 0, 0, vw, vh);
    var imageData = this._offscreenCtx.getImageData(0, 0, vw, vh);

    // Find white anchor blobs
    var blobs = findWhiteBlobs(imageData, vw, vh);
    this._dbgBlobCount = blobs.length;
    this._dbgBlobs = blobs.slice(0, 8);

    if (blobs.length < 3) {
      this._dbgStatus = "no-blobs";
      this._dbgTransform = null;
      this._dbgDotPositions = null;
      return;
    }

    // Derive transform from anchors
    var transform = deriveTransform(blobs);
    this._dbgTransform = transform;
    this._dbgAnchors = transform ? transform.anchors : null;

    if (!transform) {
      this._dbgStatus = "no-triangle";
      this._dbgDotPositions = null;
      return;
    }

    this._dbgStatus = "sampling";

    // Sample dot colors and store debug positions
    var dotValues = sampleDots(imageData, vw, transform, this._layoutData);

    // Store dot positions for debug overlay
    var allDots = [];
    for (var ri = 0; ri < this._layoutData.rings.length; ri++) {
      var ring = this._layoutData.rings[ri];
      for (var di = 0; di < ring.dots.length; di++) {
        allDots.push(ring.dots[di]);
      }
    }
    var cosR = Math.cos(transform.rotation);
    var sinR = Math.sin(transform.rotation);
    this._dbgDotPositions = [];
    for (var di2 = 0; di2 < allDots.length; di2++) {
      var dot = allDots[di2];
      var rx = dot.x * cosR - dot.y * sinR;
      var ry = dot.x * sinR + dot.y * cosR;
      this._dbgDotPositions.push({
        vx: transform.center.x + rx * transform.scale,
        vy: transform.center.y + ry * transform.scale,
        colorIdx: dotValues[di2],
      });
    }

    // Feed to decoder
    var result = this._decoder.addFrame(dotValues);
    this._dbgStatus = "decoded";

    // Store header info
    var rawBytes = this._decoder._dotsToBytes(dotValues);
    if (rawBytes.length >= 2) {
      this._dbgHeader = { frameIndex: rawBytes[0], totalFrames: rawBytes[1] };
    }

    if (this._onProgress) {
      this._onProgress(result.progress);
    }

    if (result.complete) {
      this._running = false;
      if (this._onComplete) {
        this._onComplete(this._decoder.getText());
      }
    }
  };

  /**
   * Map a point from video-pixel coords to overlay-screen coords.
   * Accounts for object-fit: cover on the video element.
   */
  DotbeamScanner.prototype._videoToScreen = function (vx, vy) {
    var vw = this._video.videoWidth || 1;
    var vh = this._video.videoHeight || 1;
    var sw = window.innerWidth;
    var sh = window.innerHeight;
    var videoAR = vw / vh;
    var screenAR = sw / sh;
    var scale, offsetX, offsetY;
    if (videoAR > screenAR) {
      scale = sh / vh;
      offsetX = (sw - vw * scale) / 2;
      offsetY = 0;
    } else {
      scale = sw / vw;
      offsetX = 0;
      offsetY = (sh - vh * scale) / 2;
    }
    return { x: vx * scale + offsetX, y: vy * scale + offsetY };
  };

  DotbeamScanner.prototype._drawOverlay = function () {
    var canvas = this._overlay;
    var ctx = this._overlayCtx;

    // Match overlay size to its display size
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    if (
      canvas.width !== Math.round(rect.width * dpr) ||
      canvas.height !== Math.round(rect.height * dpr)
    ) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    var w = rect.width;
    var h = rect.height;
    ctx.clearRect(0, 0, w, h);

    // Draw progress ring
    var progress = this._decoder.progress();
    var cx = w / 2;
    var cy = h / 2;
    var ringRadius = Math.min(w, h) * 0.42;
    var lineWidth = 4;

    // Background ring
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, 0, 2 * Math.PI);
    ctx.stroke();

    // Progress arc
    if (progress > 0) {
      var startAngle = -Math.PI / 2;
      var endAngle = startAngle + progress * 2 * Math.PI;
      ctx.strokeStyle = "#44FF44";
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(cx, cy, ringRadius, startAngle, endAngle);
      ctx.stroke();
    }

    // Progress text
    var pct = Math.round(progress * 100);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "16px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(pct + "%", cx, cy + ringRadius + 24);

    // ── Debug overlay (enabled with ?debug in URL) ──────────────────
    if (!this._debug) return;

    var self = this;

    // Debug status text
    ctx.fillStyle = "rgba(255,255,0,0.9)";
    ctx.font = "12px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    var debugLines = [
      "status: " + this._dbgStatus,
      "blobs: " + this._dbgBlobCount,
    ];
    if (this._dbgTransform) {
      debugLines.push(
        "center: " +
          Math.round(this._dbgTransform.center.x) +
          "," +
          Math.round(this._dbgTransform.center.y)
      );
      debugLines.push("scale: " + Math.round(this._dbgTransform.scale));
      debugLines.push(
        "rot: " + (this._dbgTransform.rotation * 180 / Math.PI).toFixed(1) + "°"
      );
    }
    if (this._dbgHeader) {
      debugLines.push(
        "hdr: frame=" + this._dbgHeader.frameIndex +
        " total=" + this._dbgHeader.totalFrames
      );
    }
    debugLines.push("recv: " + this._decoder._received);

    for (var li = 0; li < debugLines.length; li++) {
      ctx.fillText(debugLines[li], 10, 60 + li * 16);
    }

    // Draw all detected blobs as small green circles
    if (this._dbgBlobs) {
      ctx.strokeStyle = "rgba(0,255,0,0.5)";
      ctx.lineWidth = 1;
      for (var bi = 0; bi < this._dbgBlobs.length; bi++) {
        var blob = this._dbgBlobs[bi];
        var sp = self._videoToScreen(blob.x, blob.y);
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 5, 0, 2 * Math.PI);
        ctx.stroke();
      }
    }

    // Draw the 3 selected anchors as large RED circles (distinct from blobs)
    if (this._dbgAnchors) {
      ctx.strokeStyle = "rgba(255,50,50,1)";
      ctx.lineWidth = 3;
      for (var ai = 0; ai < this._dbgAnchors.length; ai++) {
        var anc = this._dbgAnchors[ai];
        var asp = self._videoToScreen(anc.x, anc.y);
        ctx.beginPath();
        ctx.arc(asp.x, asp.y, 14, 0, 2 * Math.PI);
        ctx.stroke();
        // Label: A0 A1 A2
        ctx.fillStyle = "rgba(255,50,50,1)";
        ctx.font = "11px monospace";
        ctx.fillText("A" + ai, asp.x + 16, asp.y - 6);
      }
    }

    // Draw center crosshair (yellow)
    if (this._dbgTransform) {
      var cp = self._videoToScreen(
        this._dbgTransform.center.x,
        this._dbgTransform.center.y
      );
      ctx.strokeStyle = "rgba(255,255,0,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cp.x - 14, cp.y);
      ctx.lineTo(cp.x + 14, cp.y);
      ctx.moveTo(cp.x, cp.y - 14);
      ctx.lineTo(cp.x, cp.y + 14);
      ctx.stroke();
    }

    // Draw sample dot positions with their detected colors
    if (this._dbgDotPositions) {
      for (var dpi = 0; dpi < this._dbgDotPositions.length; dpi++) {
        var dp = this._dbgDotPositions[dpi];
        var dsp = self._videoToScreen(dp.vx, dp.vy);
        var col = palette[dp.colorIdx];
        ctx.fillStyle =
          "rgba(" + col.r + "," + col.g + "," + col.b + ",0.8)";
        ctx.beginPath();
        ctx.arc(dsp.x, dsp.y, 4, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  };

  // ── Export ──────────────────────────────────────────────────────────
  window.DotbeamScanner = DotbeamScanner;
})();
