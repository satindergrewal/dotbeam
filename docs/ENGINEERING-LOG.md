# dotbeam Engineering Log

Comprehensive journal of every phase, decision, and lesson learned. Not a changelog — **plan-level detail**: what changed, why, what alternatives were considered, what was rejected, and what we learned. Detailed enough that a new contributor can understand not just *what* was built but *why every decision was made*.

---

## Phase 0: Origin and Direction

**Date:** 2026-02-19
**Context:** dotbeam originated from peer-up's Batch J roadmap — a "visual channel" for invite code pairing. The idea: encode a short invite code into an animated visual pattern that a second phone's camera can read. No network required.

**The key insight (Satinder's direction):** Apple's iOS device-to-device particle cloud is the gold standard for device pairing UX — but it uses invisible chrominance modulation (patented, US Patent 10,951,825). We can't do that. But we *can* make something beautiful with *visible* colored dots. Not a QR code. Not a square. A constellation.

**Decision: Standalone project, not embedded in peer-up.**
Rationale: The concept is useful beyond P2P networking — any offline data transfer between two devices with a screen and camera. Keeping it separate means it can grow independently and attract its own users. peer-up becomes one consumer of the library, not the owner.

**Decision: Go + JavaScript, zero dependencies.**
Rationale: Go for the core encoding/decoding logic (compiles everywhere, easy to test, matches peer-up's stack). JavaScript for the browser rendering and camera capture (Canvas API, getUserMedia). No frameworks, no build step for the demo. A developer should be able to `go run` and see it work.

---

## Phase 1: Protocol Design

**Date:** 2026-02-19 (before first commit)

### Layout: Concentric Rings

**Decision:** Dots arranged in concentric rings, not a grid.

**Alternatives considered:**
- **Grid layout (QR-style):** Higher density, proven. Rejected — looks like a QR code. The entire visual identity of dotbeam is "NOT a QR code."
- **Random scatter:** Beautiful but impossible to decode without positional encoding overhead. Every dot would need its own address.
- **Spiral:** Elegant but harder to index — where does one ring end and the next begin?
- **Concentric rings:** Natural indexing (ring number + position within ring), scales predictably, visually distinctive. The constellation metaphor works perfectly.

**Ring sizing:** 4 rings at radii 0.22, 0.38, 0.54, 0.70. Evenly interpolated between min and max. Ring N has N×6 dots (6, 12, 18, 24 = 60 total). This gives enough capacity (20 bytes/frame after 2-byte header) while keeping dots large enough for a camera to resolve from arm's length.

### Color Palette: 8 Colors = 3 Bits Per Dot

**Decision:** 8 perceptually distinct colors encoding 3 bits each.

**Why 8, not more?**
- 16 colors (4 bits) would double throughput but colors become too similar — especially under varying screen brightness and camera white balance. The scanner has to distinguish colors through glass, across a room, in ambient light.
- 4 colors (2 bits) is too conservative — only 10 bytes/frame.
- 8 is the sweet spot: `180 bits/frame = 22 bytes (20 payload + 2 header)`.

**Color selection rationale:** Maximum perceptual distance on dark backgrounds. Red/Orange/Gold span warm hues. Green/Cyan/Blue span cool hues. Purple/Magenta bridge back. No two adjacent hues are easily confused. All are saturated enough to survive camera color shifts.

| Value | Color | Hex | Perceptual Zone |
|-------|-------|-----|-----------------|
| 0 | Red | #FF4444 | Warm/hot |
| 1 | Orange | #FF8C00 | Warm |
| 2 | Gold | #FFD700 | Warm/bright |
| 3 | Green | #44FF44 | Cool/bright |
| 4 | Cyan | #00CED1 | Cool |
| 5 | Blue | #4488FF | Cool/deep |
| 6 | Purple | #AA44FF | Bridge |
| 7 | Magenta | #FF44FF | Bridge/hot |

### Anchor System: Three White Reference Points

**Decision:** 3 white dots at radius 0.82 forming an equilateral triangle. 1.5× larger than data dots.

**Why anchors?** The camera captures the pattern at an unknown position, rotation, and scale. Three reference points are the minimum needed to solve all three unknowns simultaneously. The scanner finds the white triangle → derives affine transform → samples data dots at known positions.

**Why white?** Maximally distinct from the 8-color data palette. High brightness makes them easy to detect even in poor lighting. Low saturation distinguishes them from colored data dots.

**Why equilateral triangle, not arbitrary?** Known geometry provides a validation check — if the three detected blobs don't form an approximate equilateral, something's wrong (glare, misdetection). The 30% side-length tolerance handles camera perspective distortion.

### Frame Structure: Self-Describing Frames

**Decision:** Each frame carries its own index and total count in the first 2 bytes.

**Why inline headers?** The scanner can start capturing at any point in the loop. Any single frame tells you "I am frame 3 of 7." No synchronization handshake needed. This is critical for the "just point and scan" UX.

**Protocol limit:** 255 frames max (single byte for total). At 20 bytes/frame, that's 5,100 bytes. Sufficient for invite codes, contact cards, WiFi credentials. Fountain codes (planned, not yet implemented) would remove this limit.

---

## Phase 2: Go Core Implementation

**Date:** 2026-02-19
**Commit:** d23f76d

All four core files written before the first commit:

### dotbeam.go — Type Foundation

Clean value types: `Color`, `Config`, `Frame`, `Dot`, `Anchor`. Everything is a struct with no methods that mutate state. `DefaultConfig()` returns the standard 4-ring, 3-bit, 5fps configuration. `DefaultColors` is a package-level slice — the palette is data, not code.

**Design principle:** The type file defines vocabulary. Every other file speaks this vocabulary. No circular dependencies.

### layout.go — Circular Math

`NewLayout()` computes all positions in normalized coordinates (-1.0 to 1.0). `ScaleToCanvas()` maps to actual pixel coordinates with a 5% margin.

**Key subtlety: Y-axis inversion.** Math convention: Y goes up. Screen convention: Y goes down. The `angleToPoint()` function negates the Y component (`-sin(angle)`). This is explicitly commented in both Go and JS because getting it wrong rotates the entire pattern 180°. Any future port must preserve this.

### encoder.go — Data to Frames

Straightforward pipeline: chunk data → prepend header → pad → expand to bits → group into 3-bit dot values → attach layout positions. MSB-first bit order throughout.

**Decision: Padding with zeros, not length-encoded.**
The last frame is zero-padded to fill all 60 dots. The original data length is communicated out-of-band (in the API response's `dataLength` field). This avoids wasting a dot position on length encoding and keeps the frame format uniform.

### decoder.go — Frames to Data

Map-based frame storage (`map[int][]byte`). Frames arrive in any order, duplicates are silently dropped.

**Decision: Trust-first-frame model (Go) vs. majority-voting (JS).**
The Go decoder takes the first clean frame for each index. The JS scanner decoder majority-votes across 5 captures per frame. This asymmetry is intentional: Go handles clean encode/decode testing; JS handles real-world camera noise. The Go decoder is a reference implementation, not a camera decoder.

---

## Phase 3: Web Demo — Transmitter

**Date:** 2026-02-19
**Commits:** d23f76d through 71826d8

### Demo Server (cmd/dotbeam-demo/main.go)

**Decision: Self-signed TLS, ephemeral.**
Mobile Safari requires HTTPS for `getUserMedia` (camera access). The server generates an ECDSA P-256 cert at startup, valid 24 hours, with the LAN IP baked into the cert's `IPAddresses`. No files on disk. User accepts the browser security warning once.

**Decision: Server-side encoding, client-side rendering.**
Frames are computed once at startup in Go, serialized to JSON, served at `/api/frames`. The browser never does encoding — it just renders pre-computed dot values. This keeps the Go package as the single source of truth for encoding logic.

### Renderer (web/static/renderer.js)

**The beautiful part.** Canvas-based `requestAnimationFrame` loop. Wall-clock timing (not tick-based) for drift tolerance.

**Decision: Glow and transitions — implemented but disabled.**
The renderer has full infrastructure for:
- Color transitions between frames (HSL interpolation with ease-in-out)
- Breathing animation on dot sizes (3-second cycle)
- Glow/shadow effects

All three are zeroed out (`TRANSITION_MS = 0`, `BREATHING_AMPLITUDE = 0`, no shadow). This happened during Phase 4 (scanner reliability). The infrastructure remains so these effects can be re-enabled when fountain codes provide redundancy against scanner misreads.

**Colors are pre-computed:** On load, every frame's 60 dot colors are converted from palette indices to CSS hex strings and stored in a flat array. The draw loop never does a palette lookup — just indexes into the pre-computed array.

### dotbeam-core.js — Shared Browser Foundation

Mirrors `layout.go` exactly: same ring radii, same anchor angles, same Y-inversion. Exposed as `window.DotbeamCore`. Both renderer.js and scanner.js depend on it.

---

## Phase 4: Scanner — The Hard Part

**Date:** 2026-02-19
**Commits:** debf980 through d7f1cba (10 commits over ~2.5 hours)

This phase was the most iterative. Every commit represents a real problem discovered through testing with actual phone cameras.

### 4a: Initial Scanner + Rotation Bug Fix

**Commit:** debf980
**Problem:** First scanner implementation had the rotation formula backwards — dots were being sampled at mirrored positions.
**Fix:** Corrected the affine transform to apply rotation consistently with the transmitter's coordinate system.

### 4b: Hue-Based Color Matching

**Commit:** 0db36b1
**Problem:** RGB Euclidean distance for color matching was fragile under camera exposure variations. A dim red and a bright red have very different RGB values but the same hue.
**Decision:** Primary color matching via HSV hue angle. Convert sampled pixel to HSV, compare hue angle to each palette color's hue. Hue is exposure-invariant — the key insight.
**Fallback:** RGB Euclidean distance for achromatic/very dark pixels (saturation < 0.15 or max channel < 30).

Also added `?debug` URL parameter for live overlay showing blob positions, anchor detection, color matching details. This debug mode was essential for every subsequent fix.

### 4c: Blob Detection Filtering

**Commit:** dffff52
**Problem:** Screen glare, text, and colored dots were being detected as anchor blobs.
**Fixes:**
- Brightness threshold raised to 200 (from lower value) — aggressive, only truly white areas qualify
- Max blob size capped at 50 grid cells — screen glare produces huge blobs, real anchors are ~10-30 cells
- Minimum blob size of 4 cells — rejects noise
- Saturation check: reject blobs with saturation > 0.25 (colored data dots are saturated, white anchors aren't)

### 4d: White Balance Calibration

**Commit:** 2b80f8b
**Problem:** Different phone cameras have different white balance. A "white" anchor might read as (240, 220, 200) instead of (255, 255, 255). This shifts all color perception.
**Solution:** Use the detected anchor dots as white reference points. If anchors average to (240, 220, 200), compute per-channel gain (255/240, 255/220, 255/200) and apply to all sampled dot colors before matching.
**Safety clamp:** Gain capped at 1.5× per channel. If an anchor is somehow very dim (< 150 brightness), skip WB calibration entirely — the reference is untrustworthy.

### 4e: Reduce Visual Effects for Reliability

**Commit:** 0054707
**Problem:** The glow effect on dots bled into neighboring dots' sample areas. Camera exposure auto-adjustment fought the brightness variations.
**Decision:** Remove glow effects from renderer. Add exposure control hints. This was the beginning of the "scanner-friendly" aesthetic shift.

### 4f: Transform Locking

**Commit:** adec1e6
**Problem:** Blob detection is noisy frame-to-frame. Sometimes a frame would detect 3 valid anchors at completely wrong positions (e.g., glare spots), producing a wild transform that samples garbage.
**Solution:** Once a valid transform is established, cache it. Only update the cache if the new detection agrees within tight bounds:
- Center drift: < 15% of current scale
- Scale drift: < 20%
- Rotation drift: < 15°

If the new detection disagrees, ignore it and reuse the cached transform. The camera and phone are mostly stationary — the pattern doesn't move between frames.

### 4g: Per-Dot Majority Voting

**Commit:** 377fd11
**Problem:** Even with good transform and color matching, individual dot reads are noisy. A single misread dot corrupts the entire frame's payload.
**Solution:** For each frame index, accumulate 5 captures. For each of the 60 dot positions, take the majority-voted color value across all 5 captures. The voted result is far more reliable than any single capture.
**Threshold:** `MIN_VOTES = 5` before a frame is considered readable.

### 4h: totalFrames Consensus Locking

**Commits:** 28352cb, adab2f4
**Problem:** The first few captures often have garbage header bytes (camera still focusing, transform not yet stable). If frame 0's header says "total = 3" but a garbled read says "total = 47", the decoder resets and loses all progress.
**Solution:** Don't trust `totalFrames` from any single capture. Accumulate at least 10 header reads (`FT_SETTLE_MIN = 10`), then take the plurality winner. The winner needs at least 30% of votes. Once locked, totalFrames never changes — even if later garbled reads disagree.

**Rejected alternative:** Reset on mismatch. This caused an infinite reset loop when occasional garbled frames contradicted the correct total.

### 4i: White Balance Refinement

**Commit:** e80083a
**Problem:** The exposure compensation logic was over-correcting, making colors worse. WB gains were occasionally exceeding the 1.5× clamp.
**Fix:** Remove exposure compensation entirely (the camera's auto-exposure is good enough). Tighten WB gain clamp. Simpler is better here — fewer corrections means fewer opportunities to make things worse.

### 4j: Center Darkness Validation

**Commit:** e3f307e
**Problem:** Some anchor triple candidates were valid equilateral triangles but positioned wrong (e.g., detecting 3 glare spots near the screen edge).
**Solution:** After finding a candidate anchor triple, verify that the center of the triangle is dark (`MAX_CENTER_BRIGHTNESS = 80`). The dotbeam pattern has a dark background (#0a0a1a) at its center. If the center is bright, the triple is wrong.

### 4k: Scanner-Friendly Renderer

**Commit:** a2e9c09
**Decision: Sacrifice beauty for reliability.**
- Bigger dots (easier to sample)
- No glow (prevents color bleeding)
- No transitions (instant frame changes = cleaner captures)
- `TRANSITION_MS = 0`, `BREATHING_AMPLITUDE = 0`

This was a pragmatic choice. The "beautiful constellation" vision is still the goal, but reliable scanning is the prerequisite. Beauty without function is decoration. The transition/breathing infrastructure remains — it's just waiting for fountain codes to provide the redundancy that makes visual effects safe.

### 4l: Peak-Seeking Dot Sampling

**Commit:** d7f1cba
**Problem:** Even with correct transform, the computed dot center might be off by a few pixels. Sampling a single pixel at the exact computed center can miss the dot entirely.
**Solution:** Sample a small neighborhood around each expected dot position. Find the pixel with the highest saturation (most colorful = most likely to be on the dot, not the background). Use that pixel's color for matching.

This is the "last mile" fix — it compensates for small positional errors from imperfect transform estimation, camera lens distortion, and screen pixel grid alignment.

---

## Phase 5: Go Renderer + Automated Testing

**Date:** 2026-02-19
**Commit:** 22fd208

### render.go — Server-Side Frame Rendering

**Purpose:** Render `Frame` objects to `image.RGBA` in Go. Not used in the live demo (JS Canvas handles that). Primary use: automated testing and potential future thumbnails.

**Design decisions:**
- Matches renderer.js constants: same background (#0a0a1a), same dot radius factors (0.06, 0.065)
- Sub-pixel center correction (`+0.5`) for cleaner circles
- No anti-aliasing, no glow — scanner-friendly mode only
- Anchors drawn last (on top) to ensure visibility

### Test Suite (dotbeam_test.go)

18 tests covering config, color, layout, encoder, decoder, and bit operations.

**Notable test design:**
- `TestRoundTripOutOfOrder` feeds frames in reverse order — validates the decoder's map-based storage
- `TestDecoderSingleFrame` uses `bytes.HasPrefix` not `bytes.Equal` — acknowledges zero-padding behavior
- Ring radii values (0.22, 0.38, 0.54, 0.70) are tested as exact values — these are protocol constants

---

## Lessons Learned

### 1. Camera physics dominate the design
The initial vision was a beautiful glowing constellation. Reality: cameras need solid, high-contrast dots with no glow bleeding. Every aesthetic choice must answer: "Can a phone camera at arm's length reliably read this?" The beauty will come back — but only once the encoding has enough redundancy (fountain codes) to tolerate some misreads.

### 2. Hue beats RGB for color matching
The most impactful single change. RGB Euclidean distance is intuitive but fragile under varying exposure. Hue is the exposure-invariant property that makes camera color matching work across different devices and lighting conditions.

### 3. Don't trust early frames
The first few camera captures are garbage (auto-focus settling, auto-exposure adjusting, transform not yet stable). Consensus locking on totalFrames and majority voting on dot values were both born from this reality.

### 4. Cache the transform, filter the updates
Anchor detection is the Achilles' heel. When it works, everything works. When it doesn't, everything fails. Caching the last good transform and only updating it when a new detection agrees closely is the pattern that made scanning reliable.

### 5. Debug mode is not optional
The `?debug` overlay in scanner.js was added in Phase 4b and used in every subsequent commit. Without it, diagnosing scanner issues would have been nearly impossible. First-class debugging tooling is infrastructure, not a luxury.

### 6. Start the engineering journal early
peer-up's engineering journal is a Batch G deliverable — meaning they'll have to reconstruct it retroactively. dotbeam starts its journal while every decision is fresh. This is the right approach.

---

## Decision Register (Quick Reference)

| # | Decision | Rationale | Alternatives Rejected |
|---|----------|-----------|----------------------|
| D1 | Concentric rings, not grid | Visual identity: "not a QR code" | Grid (QR-like), random scatter, spiral |
| D2 | 8 colors (3 bits/dot) | Sweet spot between throughput and camera reliability | 4 colors (too slow), 16 colors (too similar) |
| D3 | 3 white anchors in equilateral triangle | Minimum for position+rotation+scale; validates via geometry | 4 corners (square = QR aesthetic), 2 points (can't derive rotation) |
| D4 | Inline frame headers (2 bytes) | Any frame is self-describing, start-anywhere scanning | Out-of-band sync, first-frame-special |
| D5 | Go encoding, JS rendering | Single source of truth; Go is testable; JS handles browser | All-JS (harder to test), all-Go (no browser) |
| D6 | Self-signed TLS, ephemeral | Mobile camera needs HTTPS; no file management | mkcert (dep), Let's Encrypt (needs domain) |
| D7 | Hue-based color matching | Exposure-invariant; works across devices | RGB distance (fragile), ML classifier (overkill) |
| D8 | Transform caching with drift bounds | Handles noisy blob detection | No caching (jittery), infinite caching (can't recover) |
| D9 | Majority voting (5 captures/frame) | Handles single-capture noise | Single capture (unreliable), 10 captures (too slow) |
| D10 | totalFrames consensus locking | Prevents garbage-induced resets | Trust-first (reset loops), majority-per-read (inconsistent) |
| D11 | Scanner-friendly renderer (no glow) | Reliability over beauty, for now | Keep glow (unreliable), reduce glow (half measures) |
| D12 | Peak-seeking dot sampling | Compensates for positional errors | Single-pixel (misses), area-average (blurs boundaries) |

---

## Open Questions / Future Work

1. **Fountain codes (LT):** The `UseFountain` config flag exists but isn't implemented. LT codes would make any frame useful regardless of order or duplication, remove the 255-frame limit, and provide redundancy that enables re-enabling visual effects.

2. **Re-enable beauty:** `TRANSITION_MS` and `BREATHING_AMPLITUDE` are zeroed out. Once fountain codes provide redundancy, gradually increase these and measure scanner impact.

3. **JS package (npm):** The `js/` directory in the project structure isn't built yet. The browser demo uses inline `dotbeam-core.js` instead.

4. **Data length signaling:** Currently communicated via the API's `dataLength` field. If dotbeam becomes a standalone visual protocol (no API), the length needs to be encoded in-band — perhaps in the first frame's payload or a dedicated "control frame."

5. **Error correction per frame:** Beyond fountain codes, could add Reed-Solomon or CRC per frame for detecting corrupt dot reads. Currently relies entirely on majority voting.
