# dotbeam

Transfer data through light. Beautiful animated constellations, no network required.

**dotbeam** encodes arbitrary data into animated constellations of colored dots arranged in concentric circles. Point a camera at the screen, and the data transfers — no WiFi, no Bluetooth, no internet. Just light.

## News

| Date | What's New |
|------|-----------|
| 2026-02-19 | **Engineering docs** — Architecture reference, decision journal, and FAQ |
| 2026-02-19 | **Go renderer** — Pure Go PNG/GIF frame renderer with automated round-trip tests |
| 2026-02-19 | **Scanner hardening** — Per-dot majority voting, transform locking, white-balance calibration |
| 2026-02-19 | **Web demo** — Full transmit + scanner pages with Canvas animation and camera decode |
| 2026-02-18 | **Core library** — Encoder, decoder, layout engine, and fountain-ready frame structure |

## What Can I Do With dotbeam?

| Use Case | How |
|----------|-----|
| Transfer a WiFi password to a friend's phone | Encode the password → they scan your screen |
| Share a crypto address in person | No clipboard, no mistyped characters — just point and scan |
| Pair two devices on an air-gapped network | Exchange keys visually — no network stack needed |
| Send an invite code across a room | Display the constellation, they scan from 2 meters away |
| Offline data transfer at a conference | Share contact info, URLs, or tokens — no WiFi required |

dotbeam works with **one screen and one camera** — useful immediately, no infrastructure needed.

## Quick Start

### Run the web demo

```bash
go build -o dotbeam-demo ./cmd/dotbeam-demo
./dotbeam-demo -data "Hello from dotbeam"
```

Open `https://localhost:8443` on your computer to see the animated constellation.
Open `https://<your-lan-ip>:8443/scan.html` on your phone to scan it.

> **HTTPS required**: Mobile browsers need a secure context for camera access. The demo server generates a self-signed cert at startup — accept the browser warning.

### Render frames as PNG/GIF

```bash
go build -o dotbeam-render ./cmd/dotbeam-render
./dotbeam-render -msg "Hello world" -out frames/ -gif output.gif
```

### Use as a Go library

```go
import "github.com/satindergrewal/dotbeam"

// Encode
enc := dotbeam.NewEncoder(dotbeam.DefaultConfig())
frames := enc.Encode([]byte("your data here"))

// Decode
dec := dotbeam.NewDecoder(dotbeam.DefaultConfig())
for _, frame := range frames {
    dec.AddFrame(frame)
}
data := dec.Data()
```

### Use as a JavaScript library

```javascript
import { Encoder, Renderer } from 'dotbeam';

const encoder = new Encoder();
const frames = encoder.encode('your data here');
const renderer = new Renderer(canvas);
renderer.animate(frames);
```

## The Problem

Existing visual data transfer (QR codes) is ugly, static, and limited to ~3KB. dotbeam solves three problems at once:

- **Beauty** — QR codes are black-and-white pixel grids designed for machines, not humans. dotbeam renders flowing colored constellations that look like they belong on screen.
- **Capacity** — A single QR code maxes out at ~3KB. dotbeam streams data across animated frames using fountain codes — any captured frame is useful, and there's no theoretical size limit.
- **No network dependency** — WiFi, Bluetooth, NFC, and AirDrop all require network stacks, pairing, or proximity protocols. dotbeam needs only photons — a screen and a camera.

## Features

| Feature | Description |
|---------|-------------|
| **Animated Constellations** | Colored dots in concentric rings with soft glow, breathing animation, smooth color transitions |
| **Fountain Codes** | LT-coded frames — any frame is useful, no need to catch frame #1, no ordering required |
| **8-Color Palette** | 8 perceptually distinct colors on dark background (3 bits per dot, 22 bytes per frame) |
| **Anchor Detection** | 3 white anchor dots in equilateral triangle — camera derives rotation, scale, and position |
| **Camera Decode** | Real-time scanning with white-balance calibration, per-dot majority voting, transform locking |
| **Go Library** | Pure Go encoder, decoder, layout engine — zero external dependencies |
| **JavaScript Library** | Browser-side encoder, decoder, layout — mirrors the Go package |
| **Web Demo** | Vanilla HTML + Canvas animation (transmit) and camera scanner (receive) |
| **PNG/GIF Renderer** | Pure Go frame renderer — export constellations as images or animated GIFs |
| **Cross-Platform** | Go cross-compiles to Linux, macOS, Windows, ARM. Web demo runs in any modern browser |

## How It Works

```
┌─────────────────┐                           ┌─────────────────┐
│   Transmitter    │         photons           │     Scanner     │
│   (any screen)   │  ───────────────────────▶ │  (any camera)   │
│                  │                           │                 │
│  ┌─────────────┐ │                           │ ┌─────────────┐ │
│  │ Encoder     │ │                           │ │ Anchor Det. │ │
│  │ data→frames │ │                           │ │ find triangle│ │
│  └──────┬──────┘ │                           │ └──────┬──────┘ │
│         ▼        │                           │        ▼        │
│  ┌─────────────┐ │                           │ ┌─────────────┐ │
│  │ Renderer    │ │                           │ │ Color Match │ │
│  │ frames→dots │ │                           │ │ RGB→palette │ │
│  └──────┬──────┘ │                           │ └──────┬──────┘ │
│         ▼        │                           │        ▼        │
│  ┌─────────────┐ │                           │ ┌─────────────┐ │
│  │ Canvas      │ │                           │ │ Decoder     │ │
│  │ animation   │ │                           │ │ frames→data │ │
│  └─────────────┘ │                           │ └─────────────┘ │
└─────────────────┘                           └─────────────────┘
```

1. **Encode** — Data is split into frames. Each frame maps bytes to dot colors across 4 concentric rings (60 data dots, 3 bits each = 22 bytes/frame)
2. **Render** — Frames animate as a looping constellation. Fountain coding means every frame carries useful data — no sync needed
3. **Detect** — Camera finds 3 white anchor dots, verifies equilateral triangle geometry, derives rotation and scale
4. **Decode** — Dot colors are sampled at computed positions, matched to the nearest palette color by RGB distance, and reassembled into data

## Visual Design

```
         ●                     ● = white anchor dot (1.5x size)
        / \                    ◦ = colored data dot
       /   \                   4 rings: 6 + 12 + 18 + 24 = 60 dots
      /     \
  ◦ ◦ ◦ ◦ ◦ ◦ ◦ ◦            Ring 4 (outermost): 24 dots
   ◦ ◦ ◦ ◦ ◦ ◦ ◦              Ring 3: 18 dots
    ◦ ◦ ◦ ◦ ◦ ◦               Ring 2: 12 dots
      ◦ ◦ ◦ ◦                  Ring 1 (innermost): 6 dots
       \   /
        \ /
   ●─────────────●
```

- Dark background (#0a0a1a) with subtle glow on each dot
- 8 colors: Red, Orange, Gold, Green, Cyan, Blue, Purple, Magenta
- Smooth HSL interpolation between frames (150ms ease-in-out)
- Subtle breathing animation on dot sizes
- Faint ring tracks visible as guides
- Circular progress ring on scanner side
- **No squares, no QR-code aesthetics**

## Encoding Details

| Parameter | Value |
|-----------|-------|
| Data dots per frame | 60 (across 4 rings: 6 + 12 + 18 + 24) |
| Bits per dot | 3 (8 colors) |
| Bits per frame | 180 |
| Payload per frame | 20 bytes (+ 2 byte header) |
| Throughput at 5 fps | ~100 bytes/sec |
| Throughput at 8 fps | ~160 bytes/sec |
| Anchor dots | 3 (white, 1.5x size, equilateral triangle at r=0.82) |
| Ring radii | 0.22, 0.38, 0.54, 0.70 (normalized) |

## Building

```bash
# Build the demo server
go build -o dotbeam-demo ./cmd/dotbeam-demo

# Build the frame renderer
go build -o dotbeam-render ./cmd/dotbeam-render

# Run tests
go test -race -count=1 ./...

# Cross-compile for Linux
GOOS=linux GOARCH=amd64 go build -o dotbeam-demo ./cmd/dotbeam-demo
```

## Demo Server

The demo server (`cmd/dotbeam-demo`) serves the web UI over HTTPS for LAN access:

- Generates a self-signed TLS cert at startup (ephemeral, no files written)
- Accepts `-data` flag for the message to encode
- Accepts `-port` flag (default 8443)
- Prints your LAN IP address on startup
- Serves encoded frames as JSON at `/api/frames`
- `index.html` renders the animated constellation
- `scan.html` opens the camera and decodes in real-time

```bash
./dotbeam-demo -data "Hello from dotbeam" -port 8443
# → Serving on https://192.168.1.42:8443
# Open on your phone to scan
```

## Project Structure

```
dotbeam/
├── dotbeam.go               # Core types: Config, Frame, Dot, Color
├── encoder.go               # Encoder: data → frame sequence
├── decoder.go               # Decoder: frame sequence → data
├── layout.go                # Circular dot layout math
├── render.go                # Pure Go PNG renderer
├── fountain.go              # LT fountain codes (future)
├── dotbeam_test.go          # Round-trip encode/decode tests
├── render_test.go           # Renderer + automated round-trip test
├── go.mod                   # github.com/satindergrewal/dotbeam
├── cmd/
│   ├── dotbeam-demo/
│   │   └── main.go          # HTTPS demo server (self-signed TLS)
│   └── dotbeam-render/
│       └── main.go          # PNG/GIF frame renderer
├── js/
│   ├── package.json         # npm: dotbeam
│   └── src/
│       ├── index.js          # Package entry point
│       ├── encoder.js        # Mirrors Go encoder
│       ├── decoder.js        # Mirrors Go decoder
│       └── layout.js         # Mirrors Go layout
├── web/
│   ├── index.html            # Transmit page (animated constellation)
│   ├── scan.html             # Scanner page (camera decoder)
│   └── static/
│       ├── dotbeam-core.js   # Encoding/layout logic for browser
│       ├── renderer.js       # Canvas animation
│       └── scanner.js        # Camera capture + dot detection
└── docs/
    ├── PROTOCOL.md           # Protocol specification
    ├── ARCHITECTURE.md       # Technical architecture reference
    ├── ENGINEERING-LOG.md    # Decision journal
    └── FAQ.md                # Design rationale
```

## Scanner Reliability

The camera decoder uses multiple techniques to handle real-world conditions:

| Technique | Purpose |
|-----------|---------|
| **White-balance calibration** | Samples anchor dots (known white) to compute per-channel gains |
| **Per-dot majority voting** | Each dot's color is voted across multiple samples to reject noise |
| **Transform locking** | Once valid anchors are found, locks the coordinate transform to prevent jitter |
| **Peak-seeking sampling** | Compensates for position errors by sampling around expected dot locations |
| **Anchor triple validation** | Verifies equilateral triangle geometry and checks center darkness |

## Technical Notes

- **HTTPS required for mobile scanning** — `getUserMedia` (camera) needs a secure context. The demo server handles this with a self-signed cert.
- **Camera facing** — Scanner requests `facingMode: 'environment'` (back camera on mobile)
- **Color matching** — Nearest palette color by Euclidean distance in RGB space, after white-balance correction
- **Zero dependencies** — Pure Go core, vanilla JavaScript web demo. No webpack, no npm for the demo.

## Engineering Philosophy

dotbeam is built with the same engineering standards as [peer-up](https://github.com/satindergrewal/peer-up) — correctness first, beauty second, cleverness never. Every decision is documented in the [engineering log](docs/ENGINEERING-LOG.md) with rationale, not just outcomes.

## Development

### AI-Assisted Development

dotbeam is developed with significant AI assistance (Claude). All AI-generated code is reviewed, tested, and committed by a human maintainer. The architecture, vision, and engineering decisions are human-directed.

### No Cryptocurrency / No Token

dotbeam is a data transfer library. It has no token, no coin, no blockchain dependency, and no plans to add one. If someone tells you otherwise, they're not affiliated with this project.

### Contributing

Issues and PRs are welcome.

**Testing checklist:**
- [ ] `go build ./...` succeeds
- [ ] `go test -race -count=1 ./...` passes
- [ ] Web demo renders correctly in Chrome/Safari
- [ ] Scanner decodes on mobile (iOS Safari, Android Chrome)

## Documentation

| Document | Description |
|----------|-------------|
| [PROTOCOL.md](docs/PROTOCOL.md) | Full protocol specification (layout, colors, frame structure) |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Technical architecture reference |
| [ENGINEERING-LOG.md](docs/ENGINEERING-LOG.md) | Decision journal (WHY, not just WHAT) |
| [FAQ.md](docs/FAQ.md) | Design rationale and common questions |

## Dependencies

None. Pure Go standard library. Zero external dependencies.

## License

MIT
