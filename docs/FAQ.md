# dotbeam FAQ

Living document. WHY-focused — answers the questions that come up when someone encounters the project for the first time or joins development.

---

## General

### Why not just use a QR code?

QR codes are ugly. That's the honest answer.

The deeper answer: dotbeam is designed for contexts where the visual *is* the experience — device pairing, data sharing between friends, onboarding flows. A QR code says "scan this utilitarian square." A dotbeam constellation says "look at this." The transfer itself becomes delightful instead of transactional.

QR codes also encode data statically in a single image. dotbeam uses animation — multiple frames over time — which means it can transfer more data than fits in a single visual pattern, and the redundancy from repeated frames makes it more robust to partial occlusion or poor camera angles.

### Why not Bluetooth or NFC?

Both require pairing, permission dialogs, and radio hardware. dotbeam requires only a screen and a camera — two things every phone already has. No pairing, no radio, no network stack. It works in airplane mode, in Faraday cages, and between devices that have never communicated before.

### How much data can it transfer?

Currently: up to 5,100 bytes (255 frames × 20 bytes/frame). At 5 fps, that's about 50 seconds for maximum payload. For the primary use cases — invite codes, WiFi credentials, contact cards, short messages — a few frames is enough (under 2 seconds).

Fountain codes (planned) would remove the 255-frame limit.

### What's the effective throughput?

~100 bytes/sec at 5 fps. ~160 bytes/sec at 8 fps. This isn't competing with Bluetooth or WiFi for bulk transfer. It's optimized for small, critical payloads where the "just point your camera" UX matters more than speed.

---

## Design Decisions

### Why concentric rings instead of a grid?

Three reasons:

1. **Aesthetics.** Rings of dots look like a constellation. A grid looks like a QR code. The visual identity matters.
2. **Natural indexing.** Ring number + position within ring = unique dot address. No row/column mapping needed.
3. **Rotation-invariant geometry.** Concentric rings centered on a known point are easy to decode under rotation — you just adjust the angle offset. A grid under rotation requires perspective correction.

### Why 8 colors (3 bits per dot)?

Sweet spot. 4 colors (2 bits) wastes dot capacity — only 10 bytes/frame. 16 colors (4 bits) packs more data but the colors become too similar for a camera to distinguish under real-world conditions (varying brightness, white balance shifts, lens aberration).

8 colors — Red, Orange, Gold, Green, Cyan, Blue, Purple, Magenta — are perceptually distant enough that a phone camera can reliably distinguish them even through auto-exposure shifts.

### Why 3 anchor dots in a triangle?

Three points are the mathematical minimum to solve position, rotation, and scale simultaneously. Two points give position and scale but are ambiguous about rotation (which way is "up"?). Four points are redundant.

The equilateral triangle shape provides a built-in validation check: if the three detected blobs don't form an approximate equilateral, the detection is wrong. This catches glare spots, text, and other false positives.

### Why are the glow and transition effects disabled?

They're implemented but zeroed out (`TRANSITION_MS = 0`, `BREATHING_AMPLITUDE = 0`). During scanner development, we discovered that:

- **Glow** causes color bleeding between adjacent dots. A blue dot's glow overlaps a red dot's sample area, confusing the color matcher.
- **Color transitions** mean the camera might capture a dot mid-transition between two colors, reading neither correctly.
- **Breathing animation** changes dot sizes, which affects the sample area and can cause dots to overlap or shrink below detection threshold.

All three will be re-enabled once fountain codes provide enough redundancy that occasional misreads don't corrupt the data. The infrastructure is waiting.

### Why hue-based color matching instead of RGB distance?

The most impactful single decision in the scanner.

RGB Euclidean distance seems intuitive but fails under camera exposure variation. A dim red `(150, 30, 30)` and a bright red `(255, 70, 70)` are far apart in RGB space but identical in hue. Different phones, different ambient light, different screen brightness — RGB distance is fragile.

Hue is exposure-invariant. Convert to HSV, compare hue angles. A red dot reads as "red hue" regardless of brightness. This is why the scanner works across different devices without per-device calibration.

RGB distance is the fallback for achromatic (very low saturation) or very dark pixels where hue is undefined.

### Why does the server encode data, not the browser?

Single source of truth. The Go package is the canonical encoder — it's tested, it's deterministic, it matches the protocol spec exactly. Having the browser re-implement encoding introduces a second path that could diverge.

The browser's job is rendering (making it look good) and scanning (camera capture + decode). Encoding is a one-time operation that happens at startup — there's no performance benefit to doing it client-side.

### Why self-signed TLS?

Mobile Safari requires HTTPS for `getUserMedia` (camera access). No HTTPS = no camera = no scanner.

For LAN development, self-signed is the pragmatic choice. The server generates an ephemeral ECDSA P-256 cert at startup with the LAN IP in the certificate's SAN. User accepts the browser security warning once. No cert files to manage, no domain to register.

Production deployments would use proper certificates, but the demo server is a development tool.

---

## Scanner Reliability

### Why does the scanner need 5 captures per frame?

Camera captures are noisy. A single capture might misread 3 out of 60 dots — enough to corrupt the entire frame's payload. By capturing the same frame 5 times and majority-voting each dot position, we filter out random noise. If 3 out of 5 captures read a dot as "blue," it's blue — even if 2 captures misread it.

### Why is totalFrames consensus-locked?

The first few captures are often garbage — camera auto-focus is settling, exposure is adjusting, the transform isn't stable yet. A garbled header might say "total = 47" when the real value is "total = 3." If the decoder trusts this, it waits for 47 frames that will never arrive.

The solution: accumulate 10 header reads, take the plurality winner (needs ≥30% of votes), and lock it permanently. Even if later garbled reads disagree, the locked value holds.

### Why cache the anchor transform?

Anchor detection (finding 3 white blobs that form an equilateral triangle) is the most error-prone step. Sometimes a frame's blob detection finds the right anchors; sometimes it finds glare spots or reflections.

Once a valid transform is found, we cache it and only update if a new detection agrees closely (center within 15%, scale within 20%, rotation within 15°). The phone and screen are mostly stationary during scanning — the pattern doesn't move between frames. Caching prevents wild jumps from false detections.

### Why validate center darkness?

Three random bright spots on the screen can form an equilateral triangle. The center-darkness check verifies that the middle of the detected triangle is dark (`#0a0a1a`) — which is where the dotbeam background is. If the center is bright, the triangle is probably detecting something other than the dotbeam pattern.

### What does peak-seeking dot sampling do?

Even with a good transform, the computed dot center might be off by a few pixels (camera lens distortion, screen pixel grid, imperfect transform estimation). Sampling a single pixel at the exact center can miss the dot and hit the background instead.

Peak-seeking samples a small neighborhood around each expected dot position and picks the pixel with the highest saturation. The most colorful pixel in the neighborhood is most likely on the actual dot, not the dark background. This compensates for small positional errors.

---

## Project Context

### What's the relationship to peer-up?

dotbeam originated from peer-up's Batch J roadmap — a "visual channel" for invite code pairing between phones. It was broken out into a standalone project because the concept is useful beyond P2P networking: any scenario where you need to transfer a small payload between two devices with a screen and a camera.

peer-up will be one consumer of dotbeam. But dotbeam stands on its own.

### Why Go + JavaScript?

Go for the core logic: deterministic, testable, compiles everywhere, matches peer-up's stack. JavaScript for the browser: Canvas API for rendering, getUserMedia for camera capture. The demo uses vanilla JS with no build step — a developer can `go run` the server and open a browser. No npm install, no webpack, no framework.

### Why zero dependencies?

From peer-up's dependency policy: every dependency is a liability. It can break, change, be abandoned, or introduce supply chain risk. For a project this focused (encode dots, render dots, scan dots), there's nothing a dependency provides that can't be done in ~200 lines of application code.

The Go package uses only the standard library. The web demo uses only Canvas API and getUserMedia. The demo server uses only `net/http`, `crypto/tls`, and `image`.
