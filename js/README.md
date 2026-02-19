# dotbeam

Beautiful animated visual data transfer. Screen-to-camera, no network required.

This is the JavaScript implementation of the [dotbeam](https://github.com/satindergrewal/dotbeam) protocol.

## Install

```bash
npm install dotbeam
```

## Usage

```javascript
import { Encoder, Decoder, COLORS, computeLayout } from 'dotbeam';

// Encode
const encoder = new Encoder();
const data = new TextEncoder().encode('Hello from dotbeam!');
const frames = encoder.encode(data);

// Decode
const decoder = new Decoder();
for (const frame of frames) {
  const done = decoder.addFrame(frame.dots);
  if (done) break;
}
const result = decoder.data();
console.log(new TextDecoder().decode(result));
```

## API

### `Encoder(config?)`

Create an encoder. Config defaults: `{ rings: 4, bitsPerDot: 3, fps: 5 }`.

- `encoder.encode(data)` — Encode a `Uint8Array` into frames.

### `Decoder(config?)`

Create a decoder.

- `decoder.addFrame(dots)` — Add a frame's dots. Returns `true` when complete.
- `decoder.data()` — Get the reassembled `Uint8Array`.
- `decoder.progress()` — Returns 0.0 to 1.0.
- `decoder.reset()` — Clear state.

### `computeLayout(config)`

Returns `{ anchors, rings }` with all dot positions in normalized coordinates.

### `COLORS`

Array of 8 palette colors: `{ r, g, b, hex }`.

## License

MIT
