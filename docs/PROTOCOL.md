# dotbeam Protocol Specification

Version: 0.1.0 (draft)

## Overview

dotbeam is a visual data transfer protocol that encodes arbitrary bytes into animated patterns of colored dots. A transmitting device displays the animation on screen; a receiving device captures it with a camera and decodes the data.

## Layout

### Coordinate System

The layout is defined in a unit circle (radius 1.0) centered at (0, 0). Implementations scale this to their display/capture resolution.

### Anchor Dots

Three anchor dots form an equilateral triangle for orientation detection:

| Anchor | Angle (from top) | Radius | Color  |
|--------|------------------|--------|--------|
| A0     | 270° (top)       | 0.82   | White  |
| A1     | 30° (bottom-right)| 0.82  | White  |
| A2     | 150° (bottom-left)| 0.82  | White  |

Anchor dots are 1.5x the size of data dots. Their fixed white color and larger size make them identifiable for orientation and scale detection.

### Data Rings

Data dots are arranged in concentric rings from center outward:

| Ring | Radius | Dot Count | Bits   |
|------|--------|-----------|--------|
| 1    | 0.22   | 6         | 18     |
| 2    | 0.38   | 12        | 36     |
| 3    | 0.54   | 18        | 54     |
| 4    | 0.70   | 24        | 72     |
| **Total** |   | **60**    | **180** |

Dots in each ring are evenly spaced. Ring 1 starts at angle 0° (right), proceeding counter-clockwise.

### Dot Sizing

- Data dot radius: 0.035 (relative to unit circle)
- Anchor dot radius: 0.052 (1.5x data dot)

## Color Encoding

Each dot encodes 3 bits using 8 perceptually distinct colors:

| Value | Binary | Color   | Hex     |
|-------|--------|---------|---------|
| 0     | 000    | Red     | #FF4444 |
| 1     | 001    | Orange  | #FF8C00 |
| 2     | 010    | Gold    | #FFD700 |
| 3     | 011    | Green   | #44FF44 |
| 4     | 100    | Cyan    | #00CED1 |
| 5     | 101    | Blue    | #4488FF |
| 6     | 110    | Purple  | #AA44FF |
| 7     | 111    | Magenta | #FF44FF |

Colors are chosen for maximum perceptual distance on dark backgrounds.

## Frame Structure

Each frame encodes a header followed by payload data.

### Bit Packing

Data dots are read ring-by-ring (ring 1 first), within each ring from dot index 0 upward. Each dot contributes 3 bits (MSB first), concatenated into a byte stream.

### Header (2 bytes)

| Byte | Field       | Description                          |
|------|-------------|--------------------------------------|
| 0    | Frame index | 0-indexed frame number (0-254)       |
| 1    | Frame total | Total frames in sequence (1-255)     |

### Payload

Remaining bytes (up to 20 per frame with 4-ring layout) carry the data chunk for this frame.

### Final Frame Padding

If the last frame's payload is shorter than the frame capacity, it is padded with 0x00. The total data length is inferred from the original encoding or transmitted out-of-band.

## Fountain Coding (Optional)

When fountain coding is enabled, frames use LT (Luby Transform) codes:

- The header changes to include a seed value for the random selection
- Each frame is an XOR combination of randomly selected source blocks
- The receiver needs slightly more than K frames to decode (K = source block count)
- Frames can be received in any order, from any starting point

## Animation

### Timing

- Default frame rate: 5 fps (200ms per frame)
- Frames loop continuously until the receiver signals completion
- Color transitions between frames use 150ms ease-in-out interpolation

### Visual Requirements

Transmitting displays SHOULD:
- Use a dark background (recommended: #0a0a1a)
- Render dot glow effects for visual appeal
- Show faint ring tracks as visual guides
- Maintain consistent brightness across the animation

## Decoding

### Anchor Detection

1. Identify three bright, large circles in the captured frame
2. Verify they form an approximate equilateral triangle
3. Compute rotation angle from expected anchor positions
4. Derive scale factor from anchor distances

### Dot Sampling

1. Apply rotation and scale transform
2. For each expected dot position, sample the pixel color
3. Find the nearest matching color from the 8-color palette
4. Extract the 3-bit value

### Error Handling

- If fewer than 3 anchors are detected, skip the frame
- If a dot color is ambiguous (distance to nearest palette entry exceeds threshold), mark the frame as unreliable
- With fountain coding, unreliable frames are simply discarded (redundant frames will compensate)
