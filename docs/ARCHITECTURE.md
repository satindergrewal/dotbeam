# dotbeam Architecture

Technical reference for contributors, security reviewers, and future-self.
Architecture Version: 1.0 — 2026-02-19

---

## System Overview

dotbeam encodes arbitrary bytes into animated constellations of colored dots. A transmitting device renders the animation on screen; a receiving device captures it with a camera and decodes the data. No WiFi, no Bluetooth, no internet — just light.

```
┌─────────────────────────────────────────────────────────────┐
│                        TRANSMITTER                          │
│                                                             │
│  Data (bytes) ──→ Encoder (Go) ──→ Frames (JSON) ──→ API   │
│                                                             │
│  API ──→ Renderer (JS/Canvas) ──→ Animated Constellation    │
└─────────────────────────────────────────────────────────────┘
                          ↓ light ↓
┌─────────────────────────────────────────────────────────────┐
│                         SCANNER                             │
│                                                             │
│  Camera ──→ Frame Capture ──→ Anchor Detection              │
│                                ↓                            │
│         Transform Derivation ──→ Dot Sampling               │
│                                   ↓                         │
│         Color Matching ──→ Majority Voting ──→ Decoder      │
│                                                 ↓           │
│                                           Original Data     │
└─────────────────────────────────────────────────────────────┘
```

---

## Layer Architecture

```
Layer 3: Visual Renderer    — Canvas animation, dot rendering
Layer 2: Frame Encoder      — Data → frames with headers + layout positions
Layer 1: Payload            — Arbitrary bytes (max 5,100 bytes at 255 frames)
```

**Future layer:**
```
Layer 2.5: Fountain Codes   — LT codes, any-frame-is-useful (not yet implemented)
```

---

## Component Map

### Go Package (`github.com/satindergrewal/dotbeam`)

| File | Responsibility | Key Exports |
|------|---------------|-------------|
| `dotbeam.go` | Type foundation | `Config`, `Frame`, `Dot`, `Color`, `Anchor`, `DefaultColors`, `DefaultConfig()` |
| `layout.go` | Circular geometry | `NewLayout()`, `Layout`, `RingLayout`, `ScaleToCanvas()` |
| `encoder.go` | Data → frames | `Encoder`, `Encode()` |
| `decoder.go` | Frames → data | `Decoder`, `AddFrame()`, `Data()`, `Progress()` |
| `render.go` | Frame → image | `RenderFrame()` → `*image.RGBA` |

**Dependency graph (Go):**
```
dotbeam.go ← layout.go ← encoder.go
                        ← decoder.go
         ← render.go
```
All files depend on `dotbeam.go` types. No circular dependencies. Zero external imports.

### Browser (web/static/)

| File | Responsibility | Global Export |
|------|---------------|--------------|
| `dotbeam-core.js` | Layout math, palette, shared config | `window.DotbeamCore` |
| `renderer.js` | Canvas animation loop | `window.DotbeamRenderer` |
| `scanner.js` | Camera capture + decode | `window.DotbeamScanner` |

**Dependency graph (JS):**
```
dotbeam-core.js ← renderer.js
                ← scanner.js
```
No npm dependencies. No build step. IIFEs with `"use strict"`.

### Demo Server (cmd/dotbeam-demo/)

Single Go file. Encodes data at startup, serves frames as JSON, static-serves `web/`.

---

## Data Flow: Encoding

```
Input: []byte (max 5,100 bytes)
  ↓
Chunk into 20-byte segments (BytesPerFrame = 20)
  ↓
For each chunk: prepend 2-byte header [frameIndex, totalFrames]
  ↓
Pad last chunk with 0x00 to 22 bytes
  ↓
Expand 22 bytes → 176 bits → pad to 180 bits
  ↓
Group into 60 values of 3 bits each (MSB-first)
  ↓
Attach (x, y) positions from Layout
  ↓
Output: []Frame (each with 60 positioned, colored dots)
```

### Bit Packing Detail

Byte `0xA5` (binary `10100101`) expands to bits `[1, 0, 1, 0, 0, 1, 0, 1]` (MSB-first).

Bits are consumed in groups of 3:
```
Dot 0: bits[0:3] = [1, 0, 1] = value 5 = Blue
Dot 1: bits[3:6] = [0, 0, 1] = value 1 = Orange
Dot 2: bits[6:9] = [0, 1, ...] (continues from next byte)
```

---

## Data Flow: Scanning

The scanner pipeline runs at ~10 Hz (100ms intervals):

### Step 1: Frame Capture
Video element → offscreen canvas (1280×720) → `getImageData()` → raw RGBA pixels.

### Step 2: Anchor Detection
Two-pass blob finder:
1. **Grid pass:** 8×8 pixel cells. Mark cells where brightness > 200. Flood-fill connected cells into blobs.
2. **Validation pass:** For each blob centroid, sample a 5×5 pixel patch. Reject if saturation > 0.25 (colored dot, not white anchor) or blob size > 50 cells (screen glare) or < 4 cells (noise).

### Step 3: Anchor Triple Selection
From candidate blobs, find 3 that form an approximate equilateral triangle (side lengths within 30% of each other). Additional check: all 3 blobs must have similar sizes (ratio < 3×). Final check: the centroid of the triple must be dark (brightness < 80) — the pattern center is `#0a0a1a`.

### Step 4: Transform Derivation
From the 3 anchors, compute:
- **Center:** centroid of the triangle
- **Scale:** average distance from center to anchors ÷ expected anchor radius (0.82)
- **Rotation:** angle of anchor A0 (top anchor) relative to expected 270°

If a cached transform exists, the new detection must agree within drift bounds (center 15%, scale 20%, rotation 15°) or it's rejected.

### Step 5: White Balance Calibration
Average the RGB values of the 3 anchor dots (they should be white). Compute per-channel gain: `255 / measured_channel`. Clamp gains to 1.5×. If anchor brightness < 150, skip calibration.

### Step 6: Dot Sampling
For each of 60 expected dot positions:
1. Apply transform to get screen coordinates
2. Sample a small neighborhood around the expected center
3. Select the pixel with highest saturation (peak-seeking — most colorful pixel is most likely on the dot)
4. Apply white balance correction
5. Match to nearest palette color via hue angle (primary) or RGB distance (fallback for achromatic pixels)

### Step 7: Majority Voting
Each frame index accumulates 5 captures. For each dot position, the majority-voted value wins. The voted header bytes are validated for consistency — if votes straddle different frame indices, discard and restart.

### Step 8: Decode
Voted frame → `Decoder.addFrame()`. Once all frames received → `Decoder.data()` → original bytes.

---

## Layout Geometry

### Coordinate System
Unit circle, center at (0, 0), radius 1.0. Y-axis inverted for screen convention (`-sin(angle)`).

### Ring Configuration

```
        ╭ Ring 4 (r=0.70, 24 dots) ╮
       ╭ Ring 3 (r=0.54, 18 dots) ╮
      ╭ Ring 2 (r=0.38, 12 dots) ╮
     ╭ Ring 1 (r=0.22, 6 dots)  ╮
     │        center             │
     ╰───────────────────────────╯
      ╰──────────────────────────╯
       ╰─────────────────────────╯
        ╰────────────────────────╯

     △ Anchor A0 (270°, top)
    ╱ ╲
   ╱   ╲   Anchors at r=0.82
  ╱     ╲
 △───────△
A2       A1
(150°)   (30°)
```

### Sizing
- Data dot radius: 0.035 (normalized), rendered at 0.06 × half-canvas
- Anchor dot radius: 0.052 (normalized), rendered at 0.065 × half-canvas
- Canvas margin: 5% (`scale = min(cx, cy) * 0.95`)

---

## Server Architecture

```
cmd/dotbeam-demo/main.go
  ↓
┌──────────────────────────┐
│     Startup Sequence     │
├──────────────────────────┤
│ 1. Parse flags           │
│ 2. Encode data → frames  │
│ 3. Marshal to JSON       │
│ 4. Generate TLS cert     │
│ 5. Detect LAN IP         │
│ 6. Print URL to stdout   │
│ 7. ListenAndServeTLS     │
└──────────────────────────┘

Routes:
  GET /              → web/index.html (transmit page)
  GET /scan.html     → web/scan.html (scanner page)
  GET /static/*      → web/static/* (JS files)
  GET /api/frames    → JSON: {frames, config, colors, anchors, dataLength, data}
```

**TLS:** ECDSA P-256, 24-hour validity, LAN IP in `IPAddresses` SAN. In-memory, ephemeral.

---

## Color System

### Palette

8 colors chosen for maximum perceptual distance on dark backgrounds:

```
         Red ──── Orange ──── Gold
          │                    │
       Magenta              Green
          │                    │
       Purple ──── Blue ──── Cyan
```

### Matching Strategy

1. Convert sampled pixel to HSV
2. If saturation > 0.15 and max channel > 30: **hue matching** (exposure-invariant)
3. Else: **RGB Euclidean distance** (fallback for dark/achromatic)

---

## Concurrency Model

**Go server:** Single-threaded for encoding (runs once at startup). HTTP serving uses Go's built-in concurrency (goroutine per connection). The pre-computed JSON response is immutable — no synchronization needed.

**Browser renderer:** Single `requestAnimationFrame` loop. Frame advancement is wall-clock based.

**Browser scanner:** `setInterval` at 100ms for scan ticks. Video frame capture and processing are synchronous within each tick. No Web Workers (unnecessary for the current workload).

---

## Security Considerations

1. **Self-signed TLS:** The demo server uses ephemeral self-signed certs. This is intentional for LAN development. Production deployments would need proper certificates.

2. **Camera permissions:** scanner.js requests `getUserMedia` with `facingMode: 'environment'`. The browser prompts for camera permission. Denied permissions show a clear error.

3. **No network data exfiltration:** The encoded data never leaves the local network. The entire point is screen-to-camera transfer without network infrastructure.

4. **Input validation:** The encoder caps at 255 frames. The decoder validates frame index < total. Invalid frames return `ErrInvalidFrame`.

---

## Performance Characteristics

| Metric | Value |
|--------|-------|
| Payload per frame | 20 bytes |
| Frames at 5 fps | ~100 bytes/sec throughput |
| Frames at 8 fps | ~160 bytes/sec throughput |
| Max data size | 5,100 bytes (255 frames) |
| Scanner sample rate | ~10 Hz |
| Votes per frame | 5 captures |
| Typical decode time | ~10-30 seconds for short messages |

---

## File Index

```
dotbeam/
├── CLAUDE.md                  # Project instructions and execution plan
├── README.md                  # Public-facing documentation
├── LICENSE                    # MIT
├── go.mod                     # Module: github.com/satindergrewal/dotbeam
├── dotbeam.go                 # Core types (Config, Frame, Dot, Color)
├── encoder.go                 # Data → frames
├── decoder.go                 # Frames → data
├── layout.go                  # Circular dot layout math
├── render.go                  # Go frame renderer (image.RGBA)
├── dotbeam_test.go            # 18 tests
├── cmd/dotbeam-demo/
│   └── main.go                # HTTPS demo server
├── web/
│   ├── index.html             # Transmit page
│   ├── scan.html              # Scanner page
│   └── static/
│       ├── dotbeam-core.js    # Shared layout/palette for browser
│       ├── renderer.js        # Canvas constellation animation
│       └── scanner.js         # Camera capture + decode pipeline
└── docs/
    ├── PROTOCOL.md            # Protocol specification
    ├── ARCHITECTURE.md        # This file
    ├── ENGINEERING-LOG.md     # Decision journal
    └── FAQ.md                 # WHY-focused questions
```
