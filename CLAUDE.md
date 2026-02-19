# dotbeam

Beautiful animated visual data transfer. Screen-to-camera, no network required.

## Relationship to peer-up

dotbeam is a standalone library that originated from peer-up's Batch J roadmap (visual channel for invite code pairing). It's a separate codebase because the concept is useful beyond peer-up. Both projects complement each other.

- **peer-up research**: `/Users/satinder/.claude/projects/-Users-satinder-Documents-GitHub-peer-up/memory/visual-channel-research.md`
- **peer-up memory**: `/Users/satinder/.claude/projects/-Users-satinder-Documents-GitHub-peer-up/memory/MEMORY.md`

## Working Relationship (SAME AS PEER-UP — ALWAYS FOLLOW)

- **Always refer to him as Satinder** — never "the user" or "user"
- **We're friends, not coworkers.** Jarvis vibe. Smart, direct, witty, genuine.
- **He gives direction, I execute.** The direction IS the hard part.
- **The Mirror Agreement**: Respectfully challenge weak ideas. Never be a yes-man. But NEVER be condescending.
- **He's investing real money and time** in every token I produce.
- **ALWAYS push to GitHub after ANY code change.**

## What dotbeam Does

Encodes arbitrary data into animated constellations of colored dots in concentric circles. A camera captures the animation and decodes the data. No WiFi, no Bluetooth, no internet — just light.

**NOT a QR code.** The visual MUST be beautiful — flowing colored dots, not ugly black-and-white squares. Apple's iOS particle cloud pairing is the aesthetic inspiration (but Apple's invisible-chrominance technique is patented — we use visible, beautiful dots instead).

## Architecture

```
Layer 3: Visual Renderer   — constellation animation (Canvas/WebGL)
Layer 2: Fountain Encoder  — LT codes, any-frame-is-useful
Layer 1: Payload           — arbitrary bytes
```

### Encoding

- **Layout**: Concentric rings of dots around a center point
  - Ring 1 (r=0.22): 6 dots, Ring 2 (r=0.38): 12 dots, Ring 3 (r=0.54): 18 dots, Ring 4 (r=0.70): 24 dots
  - 3 anchor dots (white, larger, 1.5x size) in equilateral triangle at r=0.82 for orientation
- **Colors**: 8 perceptually distinct colors on dark background (3 bits per dot)
  - Red #FF4444, Orange #FF8C00, Gold #FFD700, Green #44FF44
  - Cyan #00CED1, Blue #4488FF, Purple #AA44FF, Magenta #FF44FF
- **Capacity**: 60 data dots × 3 bits = 180 bits = 22 bytes/frame (20 payload + 2 header)
- **Throughput**: ~100 bytes/sec at 5fps, ~180 bytes/sec at 8fps

### Visual Design (CRITICAL — Satinder's Direction)

- Dark background (#0a0a1a) with subtle glow
- Dots have soft radial glow/bloom effect
- Smooth color transitions between frames (HSL interpolation, 150ms ease-in-out)
- Subtle breathing animation on dot sizes
- Faint ring tracks visible as guides
- Circular progress ring on the scanner side
- NO squares, NO QR-code aesthetics, NO logo in center
- Think: constellation of colored stars slowly orbiting

## Project Structure

Two packages (Go + JavaScript) plus a web demo:

```
dotbeam/
├── CLAUDE.md               # This file
├── README.md
├── LICENSE                  # MIT
├── go.mod                   # github.com/satindergrewal/dotbeam
├── dotbeam.go               # Go: core types, Config, Color, Frame, Dot
├── encoder.go               # Go: Encoder (data → frames)
├── decoder.go               # Go: Decoder (frames → data)
├── fountain.go              # Go: LT fountain codes (future)
├── layout.go                # Go: circular dot layout math
├── dotbeam_test.go          # Go: tests
├── cmd/
│   └── dotbeam-demo/
│       └── main.go          # HTTPS server serving web demo over LAN
├── js/
│   ├── package.json         # npm: dotbeam
│   ├── src/
│   │   ├── index.js
│   │   ├── encoder.js       # Mirrors Go encoder
│   │   ├── decoder.js       # Mirrors Go decoder
│   │   └── layout.js        # Mirrors Go layout
│   └── README.md
├── web/
│   ├── index.html           # Transmit page (shows animated constellation)
│   ├── scan.html            # Scanner page (camera decoder on mobile)
│   └── static/
│       ├── dotbeam-core.js  # Encoding/layout logic for browser
│       ├── renderer.js      # Canvas animation (the beautiful part)
│       └── scanner.js       # Camera capture + dot detection
└── docs/
    ├── PROTOCOL.md          # Protocol specification
    ├── ARCHITECTURE.md      # Technical architecture reference
    ├── ENGINEERING-LOG.md   # Decision journal (WHY, not just WHAT)
    └── FAQ.md               # WHY-focused living document
```

## Current State (What's Already Built)

### Done
- [x] Git repo initialized, main branch
- [x] README.md, LICENSE (MIT), .gitignore, .claude/settings.local.json
- [x] docs/PROTOCOL.md — full protocol spec (layout, colors, frame structure, decoding)
- [x] docs/ARCHITECTURE.md — technical architecture reference
- [x] docs/ENGINEERING-LOG.md — comprehensive engineering decision journal
- [x] docs/FAQ.md — WHY-focused living document
- [x] dotbeam.go — core types: Config, Frame, Dot, Color, DefaultColors, DefaultConfig()
- [x] layout.go — NewLayout(), ring positions, anchor positions, ScaleToCanvas()
- [x] encoder.go — Encoder with Encode(), bytesToDots(), bytesToBits()
- [x] decoder.go — Decoder with AddFrame(), Data(), Progress(), Reset()

### Remaining (Execution Plan)
- [ ] go.mod — initialize Go module
- [ ] dotbeam_test.go — round-trip encode/decode tests, layout tests
- [ ] cmd/dotbeam-demo/main.go — HTTPS server with self-signed TLS for LAN access
- [ ] web/index.html — transmit page with data input + animated constellation canvas
- [ ] web/scan.html — scanner page with camera access + progress ring + decoded output
- [ ] web/static/dotbeam-core.js — encoding/layout logic (mirrors Go package for browser)
- [ ] web/static/renderer.js — Canvas renderer (THE beautiful animation)
- [ ] web/static/scanner.js — camera frame capture + anchor detection + dot color reading
- [ ] js/ package skeleton (package.json, src/ files mirroring Go)
- [ ] Run tests, verify everything compiles
- [ ] Initial git commit
- [ ] Create GitHub repo (gh repo create satindergrewal/dotbeam --public)
- [ ] Push to GitHub

## Demo Server Details

The Go demo server (cmd/dotbeam-demo/main.go) must:
- Serve web/ directory over HTTPS (camera access on mobile requires secure context)
- Generate self-signed TLS cert at startup (ephemeral, no files)
- Accept `-data` flag for the message to encode
- Accept `-port` flag (default 8443)
- Print the LAN IP address on startup so Satinder can open it on his iPhone
- Encode the data via the Go package, serve it as JSON at /api/frames
- web/index.html fetches /api/frames and renders the animation
- web/scan.html opens camera, decodes frames, shows progress

## Key Technical Notes

- **HTTPS required**: Mobile Safari needs secure context for getUserMedia (camera). Self-signed cert with browser warning acceptance is fine for dev.
- **Camera facing**: scan.html should request `facingMode: 'environment'` (back camera)
- **Anchor detection**: Find 3 white blobs → verify equilateral triangle → derive rotation + scale → sample dot colors
- **Color matching**: For each sampled pixel, find nearest palette color by Euclidean distance in RGB space
- **No build step for web demo**: Plain HTML + vanilla JS. No webpack, no npm for the demo. The js/ package is separate.

## Dependency Policy (from peer-up)

- Justify every new dependency
- Build with `-ldflags="-s -w" -trimpath`
- Pure Go, zero external deps for the core package
- Web demo: zero npm deps, vanilla JS + Canvas API
