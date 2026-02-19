# dotbeam

Beautiful animated visual data transfer. Screen-to-camera, no network required.

dotbeam encodes data into animated constellations of colored dots arranged in concentric circles. Point a camera at the animation, and the data transfers — no WiFi, no Bluetooth, no internet. Just light.

## What It Looks Like

Instead of ugly black-and-white QR squares, dotbeam renders:

- Colored dots orbiting in concentric rings on a dark background
- Smooth color transitions as data frames change
- A soft glow effect on each dot
- Three anchor dots for orientation detection
- A circular progress ring on the scanner

## How It Works

1. **Encode**: Data is split into frames. Each frame maps bytes to dot colors (8 colors = 3 bits per dot).
2. **Animate**: Frames display as a looping constellation animation. Fountain codes mean any captured frame is useful — no need to catch frame #1.
3. **Scan**: A camera captures frames, detects dot positions via the anchor triangle, reads colors, and reassembles the data.

## Quick Start

### Run the demo

```bash
cd cmd/dotbeam-demo
go run . -data "Hello from dotbeam"
```

Open `https://localhost:8443` on your computer to see the animation.
Open `https://<your-lan-ip>:8443/scan.html` on your phone to scan it.

### Use as a Go library

```go
import "github.com/satindergrewal/dotbeam"

enc := dotbeam.NewEncoder(dotbeam.DefaultConfig())
frames := enc.Encode([]byte("your data here"))

// Each frame contains dot positions and colors
for _, frame := range frames {
    // Render however you want
}
```

### Use as a JavaScript library

```javascript
import { Encoder, Renderer } from 'dotbeam';

const encoder = new Encoder();
const frames = encoder.encode('your data here');
const renderer = new Renderer(canvas);
renderer.animate(frames);
```

## Architecture

```
Layer 3: Visual Renderer   — constellation animation (Canvas/WebGL)
Layer 2: Fountain Encoder  — LT codes, any-frame-is-useful
Layer 1: Payload           — arbitrary bytes
```

### Encoding

- **Layout**: Concentric rings of dots around a center point
  - Ring 1: 6 dots, Ring 2: 12 dots, Ring 3: 18 dots, Ring 4: 24 dots
  - 3 anchor dots (white, larger) in an equilateral triangle for orientation
- **Colors**: 8 perceptually distinct colors on dark background (3 bits per dot)
- **Capacity**: 60 data dots x 3 bits = 180 bits (22 bytes) per frame
- **Throughput**: ~110 bytes/sec at 5fps, ~180 bytes/sec at 8fps

### Protocol

See [docs/PROTOCOL.md](docs/PROTOCOL.md) for the full specification.

## Project Structure

```
dotbeam/
├── dotbeam.go          # Go: core types and config
├── encoder.go          # Go: data → frame sequence
├── decoder.go          # Go: frame sequence → data
├── fountain.go         # Go: LT fountain codes
├── layout.go           # Go: circular dot layout math
├── cmd/
│   └── dotbeam-demo/   # Demo server (serves web UI over HTTPS)
├── js/                 # JavaScript/TypeScript package
│   └── src/
├── web/                # Demo web application
│   ├── index.html      # Transmit page (animated constellation)
│   └── scan.html       # Scanner page (camera decoder)
└── docs/
    └── PROTOCOL.md     # Protocol specification
```

## Status

Early development. The visual encoding and animation work. Camera decoding is in progress.

## License

MIT
