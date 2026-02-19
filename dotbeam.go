// Package dotbeam implements beautiful animated visual data transfer.
//
// Data is encoded into animated constellations of colored dots arranged
// in concentric circles. A camera captures the animation and decodes
// the data — no network required.
package dotbeam

// DefaultColors defines the 8-color palette (3 bits per dot).
// Colors are chosen for maximum perceptual distance on dark backgrounds.
var DefaultColors = [8]Color{
	{R: 0xFF, G: 0x44, B: 0x44}, // 000: Red
	{R: 0xFF, G: 0x8C, B: 0x00}, // 001: Orange
	{R: 0xFF, G: 0xD7, B: 0x00}, // 010: Gold
	{R: 0x44, G: 0xFF, B: 0x44}, // 011: Green
	{R: 0x00, G: 0xCE, B: 0xD1}, // 100: Cyan
	{R: 0x44, G: 0x88, B: 0xFF}, // 101: Blue
	{R: 0xAA, G: 0x44, B: 0xFF}, // 110: Purple
	{R: 0xFF, G: 0x44, B: 0xFF}, // 111: Magenta
}

// Color represents an RGB color value.
type Color struct {
	R, G, B uint8
}

// Hex returns the color as a CSS hex string.
func (c Color) Hex() string {
	return "#" + hexByte(c.R) + hexByte(c.G) + hexByte(c.B)
}

func hexByte(b uint8) string {
	const hex = "0123456789abcdef"
	return string([]byte{hex[b>>4], hex[b&0x0f]})
}

// Config controls the encoding parameters.
type Config struct {
	// Rings is the number of concentric data rings (default: 4).
	// Ring dot counts: 6, 12, 18, 24, ... (6*ring_number).
	Rings int

	// BitsPerDot is the number of bits per dot color (default: 3 for 8 colors).
	BitsPerDot int

	// FPS is the frame display rate (default: 5).
	FPS int

	// UseFountain enables fountain (LT) coding for out-of-order frame tolerance.
	UseFountain bool
}

// DefaultConfig returns a sensible default configuration.
func DefaultConfig() Config {
	return Config{
		Rings:      4,
		BitsPerDot: 3,
		FPS:        5,
	}
}

// Frame represents a single animation frame.
type Frame struct {
	Index   int   // Frame number (0-indexed)
	Total   int   // Total frames in sequence
	Dots    []Dot // Data dots for this frame
	Payload []byte
}

// Dot represents a single data dot in the constellation.
type Dot struct {
	Ring  int     // Ring number (1-indexed)
	Index int     // Position within ring (0-indexed)
	Value uint8   // Encoded value (0-7 for 3-bit)
	X     float64 // Normalized X position (-1.0 to 1.0)
	Y     float64 // Normalized Y position (-1.0 to 1.0)
}

// Anchor represents an orientation anchor dot.
type Anchor struct {
	X, Y float64
}

// TotalDots returns the total number of data dots for this config.
func (c Config) TotalDots() int {
	total := 0
	for ring := 1; ring <= c.Rings; ring++ {
		total += ring * 6
	}
	return total
}

// BitsPerFrame returns the number of data bits per frame.
func (c Config) BitsPerFrame() int {
	return c.TotalDots() * c.BitsPerDot
}

// BytesPerFrame returns the usable data bytes per frame (excluding header).
func (c Config) BytesPerFrame() int {
	// 2 header bytes (frame index + total), rest is payload
	return (c.BitsPerFrame() / 8) - 2
}
