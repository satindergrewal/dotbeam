package dotbeam

import (
	"bytes"
	"math"
	"testing"
)

func TestDefaultConfig(t *testing.T) {
	c := DefaultConfig()
	if c.Rings != 4 {
		t.Fatalf("expected 4 rings, got %d", c.Rings)
	}
	if c.BitsPerDot != 3 {
		t.Fatalf("expected 3 bits per dot, got %d", c.BitsPerDot)
	}
	if c.FPS != 5 {
		t.Fatalf("expected 5 fps, got %d", c.FPS)
	}
}

func TestTotalDots(t *testing.T) {
	c := DefaultConfig()
	// 6 + 12 + 18 + 24 = 60
	if got := c.TotalDots(); got != 60 {
		t.Fatalf("expected 60 total dots, got %d", got)
	}
}

func TestBitsPerFrame(t *testing.T) {
	c := DefaultConfig()
	// 60 dots * 3 bits = 180
	if got := c.BitsPerFrame(); got != 180 {
		t.Fatalf("expected 180 bits per frame, got %d", got)
	}
}

func TestBytesPerFrame(t *testing.T) {
	c := DefaultConfig()
	// 180 bits / 8 = 22 bytes - 2 header = 20
	if got := c.BytesPerFrame(); got != 20 {
		t.Fatalf("expected 20 bytes per frame, got %d", got)
	}
}

func TestColorHex(t *testing.T) {
	tests := []struct {
		color Color
		want  string
	}{
		{DefaultColors[0], "#ff4444"},
		{DefaultColors[1], "#ff8c00"},
		{DefaultColors[4], "#00ced1"},
		{Color{0, 0, 0}, "#000000"},
		{Color{255, 255, 255}, "#ffffff"},
	}
	for _, tt := range tests {
		if got := tt.color.Hex(); got != tt.want {
			t.Errorf("Color{%d,%d,%d}.Hex() = %q, want %q", tt.color.R, tt.color.G, tt.color.B, got, tt.want)
		}
	}
}

// --- Layout tests ---

func TestNewLayout(t *testing.T) {
	c := DefaultConfig()
	l := NewLayout(c, 1, 1)

	if len(l.Rings) != 4 {
		t.Fatalf("expected 4 rings, got %d", len(l.Rings))
	}

	// Verify dot counts per ring
	expectedCounts := []int{6, 12, 18, 24}
	for i, ring := range l.Rings {
		if ring.DotCount != expectedCounts[i] {
			t.Errorf("ring %d: expected %d dots, got %d", i+1, expectedCounts[i], ring.DotCount)
		}
		if len(ring.Positions) != expectedCounts[i] {
			t.Errorf("ring %d: expected %d positions, got %d", i+1, expectedCounts[i], len(ring.Positions))
		}
	}
}

func TestLayoutAnchors(t *testing.T) {
	c := DefaultConfig()
	l := NewLayout(c, 1, 1)

	// All anchors should be at radius ~0.82
	for i, a := range l.Anchors {
		r := math.Sqrt(a.X*a.X + a.Y*a.Y)
		if math.Abs(r-0.82) > 0.001 {
			t.Errorf("anchor %d: expected radius 0.82, got %.4f", i, r)
		}
	}

	// Check anchor separation — equilateral triangle means ~120° apart
	d01 := dist(l.Anchors[0], l.Anchors[1])
	d12 := dist(l.Anchors[1], l.Anchors[2])
	d20 := dist(l.Anchors[2], l.Anchors[0])
	if math.Abs(d01-d12) > 0.001 || math.Abs(d12-d20) > 0.001 {
		t.Errorf("anchors not equilateral: d01=%.4f d12=%.4f d20=%.4f", d01, d12, d20)
	}
}

func TestRingRadii(t *testing.T) {
	// With 4 rings: 0.22, 0.38, 0.54, 0.70
	expected := []float64{0.22, 0.38, 0.54, 0.70}
	for i, want := range expected {
		got := ringRadius(i+1, 4)
		if math.Abs(got-want) > 0.001 {
			t.Errorf("ringRadius(%d, 4) = %.4f, want %.4f", i+1, got, want)
		}
	}
}

func TestScaleToCanvas(t *testing.T) {
	// Center of unit space should map to center of canvas
	cx, cy := ScaleToCanvas(0, 0, 500, 500)
	if cx != 250 || cy != 250 {
		t.Errorf("ScaleToCanvas(0,0,500,500) = (%.1f,%.1f), want (250,250)", cx, cy)
	}
}

// --- Encoder tests ---

func TestEncodeSmall(t *testing.T) {
	enc := NewEncoder(DefaultConfig())
	data := []byte("hello")
	frames := enc.Encode(data)

	if len(frames) != 1 {
		t.Fatalf("expected 1 frame for 5 bytes, got %d", len(frames))
	}
	if frames[0].Index != 0 {
		t.Errorf("frame index = %d, want 0", frames[0].Index)
	}
	if frames[0].Total != 1 {
		t.Errorf("frame total = %d, want 1", frames[0].Total)
	}
	if !bytes.Equal(frames[0].Payload, data) {
		t.Errorf("payload = %q, want %q", frames[0].Payload, data)
	}
	if len(frames[0].Dots) != 60 {
		t.Errorf("expected 60 dots, got %d", len(frames[0].Dots))
	}
}

func TestEncodeMultiFrame(t *testing.T) {
	enc := NewEncoder(DefaultConfig())
	// 20 bytes per frame, so 50 bytes = 3 frames
	data := bytes.Repeat([]byte("A"), 50)
	frames := enc.Encode(data)

	if len(frames) != 3 {
		t.Fatalf("expected 3 frames for 50 bytes, got %d", len(frames))
	}
	for i, f := range frames {
		if f.Index != i {
			t.Errorf("frame %d: index = %d", i, f.Index)
		}
		if f.Total != 3 {
			t.Errorf("frame %d: total = %d, want 3", i, f.Total)
		}
	}
}

func TestEncodeEmpty(t *testing.T) {
	enc := NewEncoder(DefaultConfig())
	frames := enc.Encode([]byte{})
	if len(frames) != 0 {
		t.Fatalf("expected 0 frames for empty data, got %d", len(frames))
	}
}

func TestDotValues(t *testing.T) {
	enc := NewEncoder(DefaultConfig())
	frames := enc.Encode([]byte("A"))

	for _, d := range frames[0].Dots {
		if d.Value > 7 {
			t.Errorf("dot value %d exceeds 3-bit max", d.Value)
		}
	}
}

// --- Decoder tests ---

func TestDecoderSingleFrame(t *testing.T) {
	config := DefaultConfig()
	enc := NewEncoder(config)
	dec := NewDecoder(config)

	data := []byte("hello dotbeam!")
	frames := enc.Encode(data)

	for _, f := range frames {
		done, err := dec.AddFrame(f.Dots)
		if err != nil {
			t.Fatalf("AddFrame error: %v", err)
		}
		if !done {
			t.Fatal("expected done after single frame")
		}
	}

	got, err := dec.Data()
	if err != nil {
		t.Fatalf("Data() error: %v", err)
	}

	// Decoded data may have trailing zeros from padding
	if !bytes.HasPrefix(got, data) {
		t.Fatalf("round-trip failed: got %q, want prefix %q", got, data)
	}
}

func TestRoundTripMultiFrame(t *testing.T) {
	config := DefaultConfig()
	enc := NewEncoder(config)
	dec := NewDecoder(config)

	// Exactly 40 bytes = 2 full frames
	data := bytes.Repeat([]byte("ABCDEFGHIJKLMNOPQRST"), 2)
	frames := enc.Encode(data)

	if len(frames) != 2 {
		t.Fatalf("expected 2 frames, got %d", len(frames))
	}

	for i, f := range frames {
		done, err := dec.AddFrame(f.Dots)
		if err != nil {
			t.Fatalf("AddFrame(%d) error: %v", i, err)
		}
		if i < len(frames)-1 && done {
			t.Fatalf("shouldn't be done after frame %d", i)
		}
	}

	got, err := dec.Data()
	if err != nil {
		t.Fatalf("Data() error: %v", err)
	}

	if !bytes.Equal(got, data) {
		t.Fatalf("round-trip failed:\n got: %q\nwant: %q", got, data)
	}
}

func TestRoundTripOutOfOrder(t *testing.T) {
	config := DefaultConfig()
	enc := NewEncoder(config)
	dec := NewDecoder(config)

	// 60 bytes = 3 frames
	data := bytes.Repeat([]byte("X"), 60)
	frames := enc.Encode(data)

	// Feed in reverse order
	for i := len(frames) - 1; i >= 0; i-- {
		dec.AddFrame(frames[i].Dots)
	}

	got, err := dec.Data()
	if err != nil {
		t.Fatalf("Data() error: %v", err)
	}

	if !bytes.Equal(got, data) {
		t.Fatalf("out-of-order round-trip failed")
	}
}

func TestDecoderDuplicateFrame(t *testing.T) {
	config := DefaultConfig()
	enc := NewEncoder(config)
	dec := NewDecoder(config)

	data := []byte("test")
	frames := enc.Encode(data)

	// Add same frame twice — should not double count
	dec.AddFrame(frames[0].Dots)
	done, _ := dec.AddFrame(frames[0].Dots)

	if !done {
		t.Fatal("expected done after adding the only frame twice")
	}

	if dec.Progress() != 1.0 {
		t.Errorf("progress = %f, want 1.0", dec.Progress())
	}
}

func TestDecoderProgress(t *testing.T) {
	config := DefaultConfig()
	enc := NewEncoder(config)
	dec := NewDecoder(config)

	data := bytes.Repeat([]byte("Z"), 60) // 3 frames
	frames := enc.Encode(data)

	if dec.Progress() != 0 {
		t.Errorf("initial progress = %f, want 0", dec.Progress())
	}

	dec.AddFrame(frames[0].Dots)
	p := dec.Progress()
	if math.Abs(p-1.0/3.0) > 0.01 {
		t.Errorf("progress after 1/3 frames = %f", p)
	}
}

func TestDecoderReset(t *testing.T) {
	config := DefaultConfig()
	enc := NewEncoder(config)
	dec := NewDecoder(config)

	data := []byte("reset test")
	frames := enc.Encode(data)
	dec.AddFrame(frames[0].Dots)

	dec.Reset()
	if dec.Progress() != 0 {
		t.Errorf("progress after reset = %f, want 0", dec.Progress())
	}
}

func TestDecoderInvalidFrame(t *testing.T) {
	dec := NewDecoder(DefaultConfig())
	_, err := dec.AddFrame(nil)
	if err != ErrInvalidFrame {
		t.Errorf("expected ErrInvalidFrame for nil dots, got %v", err)
	}
	_, err = dec.AddFrame([]Dot{})
	if err != ErrInvalidFrame {
		t.Errorf("expected ErrInvalidFrame for empty dots, got %v", err)
	}
}

func TestDecoderDataBeforeComplete(t *testing.T) {
	config := DefaultConfig()
	enc := NewEncoder(config)
	dec := NewDecoder(config)

	data := bytes.Repeat([]byte("Y"), 60) // 3 frames
	frames := enc.Encode(data)
	dec.AddFrame(frames[0].Dots)

	_, err := dec.Data()
	if err != ErrIncompleteData {
		t.Errorf("expected ErrIncompleteData, got %v", err)
	}
}

// --- Byte/bit conversion tests ---

func TestBytesToBits(t *testing.T) {
	bits := bytesToBits([]byte{0xA5}) // 10100101
	expected := []uint8{1, 0, 1, 0, 0, 1, 0, 1}
	if len(bits) != 8 {
		t.Fatalf("expected 8 bits, got %d", len(bits))
	}
	for i, b := range expected {
		if bits[i] != b {
			t.Errorf("bit %d: got %d, want %d", i, bits[i], b)
		}
	}
}

// --- Helper ---

func dist(a, b Anchor) float64 {
	dx := a.X - b.X
	dy := a.Y - b.Y
	return math.Sqrt(dx*dx + dy*dy)
}
