package dotbeam

import (
	"image"
	"strings"
	"testing"
)

// matchColorFromImage finds the closest palette color for an RGB sample.
func matchColorFromImage(r, g, b uint8) uint8 {
	bestIdx := uint8(0)
	bestDist := 1<<31 - 1
	for i, c := range DefaultColors {
		dr := int(r) - int(c.R)
		dg := int(g) - int(c.G)
		db := int(b) - int(c.B)
		d := dr*dr + dg*dg + db*db
		if d < bestDist {
			bestDist = d
			bestIdx = uint8(i)
		}
	}
	return bestIdx
}

// sampleDotFromImage reads the pixel at the dot's canvas position and
// returns a Dot with the matched palette Value.
func sampleDotFromImage(img *image.RGBA, dot Dot, width, height int) Dot {
	px, py := ScaleToCanvas(dot.X, dot.Y, float64(width), float64(height))
	x := int(px)
	y := int(py)

	// Clamp to image bounds
	if x < 0 {
		x = 0
	}
	if x >= width {
		x = width - 1
	}
	if y < 0 {
		y = 0
	}
	if y >= height {
		y = height - 1
	}

	c := img.RGBAAt(x, y)
	return Dot{
		Ring:  dot.Ring,
		Index: dot.Index,
		Value: matchColorFromImage(c.R, c.G, c.B),
		X:     dot.X,
		Y:     dot.Y,
	}
}

func TestRenderRoundTrip(t *testing.T) {
	msg := "Hello"
	cfg := DefaultConfig()
	enc := NewEncoder(cfg)
	frames := enc.Encode([]byte(msg))

	if len(frames) == 0 {
		t.Fatal("encoder produced no frames")
	}

	layout := NewLayout(cfg, 1, 1) // normalized
	const imgSize = 800
	dec := NewDecoder(cfg)

	for _, frame := range frames {
		img := RenderFrame(frame, layout, imgSize, imgSize)

		// Read dot colors back from the rendered image
		var sampledDots []Dot
		for _, dot := range frame.Dots {
			sampledDots = append(sampledDots, sampleDotFromImage(img, dot, imgSize, imgSize))
		}

		done, err := dec.AddFrame(sampledDots)
		if err != nil {
			t.Fatalf("frame %d: AddFrame error: %v", frame.Index, err)
		}
		if frame.Index == len(frames)-1 && !done {
			t.Fatalf("expected done after last frame")
		}
	}

	data, err := dec.Data()
	if err != nil {
		t.Fatalf("Data() error: %v", err)
	}

	// Trim trailing null padding
	got := strings.TrimRight(string(data), "\x00")
	if got != msg {
		t.Errorf("round-trip mismatch: got %q, want %q", got, msg)
	}
}

func TestRenderRoundTripLonger(t *testing.T) {
	msg := "The quick brown fox jumps over the lazy dog"
	cfg := DefaultConfig()
	enc := NewEncoder(cfg)
	frames := enc.Encode([]byte(msg))

	if len(frames) < 2 {
		t.Fatalf("expected multiple frames for long message, got %d", len(frames))
	}

	layout := NewLayout(cfg, 1, 1)
	const imgSize = 800
	dec := NewDecoder(cfg)

	for _, frame := range frames {
		img := RenderFrame(frame, layout, imgSize, imgSize)

		var sampledDots []Dot
		for _, dot := range frame.Dots {
			sampledDots = append(sampledDots, sampleDotFromImage(img, dot, imgSize, imgSize))
		}

		done, err := dec.AddFrame(sampledDots)
		if err != nil {
			t.Fatalf("frame %d: AddFrame error: %v", frame.Index, err)
		}
		if frame.Index == len(frames)-1 && !done {
			t.Fatalf("expected done after last frame")
		}
	}

	data, err := dec.Data()
	if err != nil {
		t.Fatalf("Data() error: %v", err)
	}

	got := strings.TrimRight(string(data), "\x00")
	if got != msg {
		t.Errorf("round-trip mismatch:\n got: %q\nwant: %q", got, msg)
	}
}

func TestRenderFrameSize(t *testing.T) {
	cfg := DefaultConfig()
	enc := NewEncoder(cfg)
	frames := enc.Encode([]byte("test"))
	layout := NewLayout(cfg, 1, 1)

	img := RenderFrame(frames[0], layout, 400, 400)
	bounds := img.Bounds()

	if bounds.Dx() != 400 || bounds.Dy() != 400 {
		t.Errorf("image size = %dx%d, want 400x400", bounds.Dx(), bounds.Dy())
	}

	// Center pixel should be dark background
	c := img.RGBAAt(200, 200)
	if c.R > 20 || c.G > 20 || c.B > 40 {
		t.Errorf("center pixel = (%d,%d,%d), expected dark background", c.R, c.G, c.B)
	}
}
