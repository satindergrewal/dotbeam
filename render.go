package dotbeam

import (
	"image"
	"image/color"
	"math"
)

// Background color for rendered frames (#0a0a1a).
var bgColor = color.RGBA{R: 0x0a, G: 0x0a, B: 0x1a, A: 0xff}

// Dot radius factors (relative to scale = min(w,h)/2 * 0.95).
const (
	dataDotRadiusFactor   = 0.06  // matches renderer.js
	anchorDotRadiusFactor = 0.065 // slightly larger than data dots
)

// RenderFrame draws a single dotbeam frame as an RGBA image.
// The layout should be created with NewLayout(config, 1, 1) (normalized).
func RenderFrame(frame Frame, layout Layout, width, height int) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, width, height))

	// Fill background
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.SetRGBA(x, y, bgColor)
		}
	}

	w := float64(width)
	h := float64(height)
	scale := math.Min(w, h) / 2 * 0.95

	dataDotR := dataDotRadiusFactor * scale
	anchorDotR := anchorDotRadiusFactor * scale

	// Draw data dots
	for _, dot := range frame.Dots {
		px, py := ScaleToCanvas(dot.X, dot.Y, w, h)
		c := DefaultColors[dot.Value&0x07]
		fillCircle(img, px, py, dataDotR, color.RGBA{R: c.R, G: c.G, B: c.B, A: 0xff})
	}

	// Draw anchor dots (white, on top)
	white := color.RGBA{R: 0xff, G: 0xff, B: 0xff, A: 0xff}
	for _, anchor := range layout.Anchors {
		px, py := ScaleToCanvas(anchor.X, anchor.Y, w, h)
		fillCircle(img, px, py, anchorDotR, white)
	}

	return img
}

// fillCircle draws a filled circle on the image.
func fillCircle(img *image.RGBA, cx, cy, radius float64, col color.RGBA) {
	bounds := img.Bounds()
	r2 := radius * radius

	minX := int(math.Floor(cx - radius))
	maxX := int(math.Ceil(cx + radius))
	minY := int(math.Floor(cy - radius))
	maxY := int(math.Ceil(cy + radius))

	for y := minY; y <= maxY; y++ {
		if y < bounds.Min.Y || y >= bounds.Max.Y {
			continue
		}
		dy := float64(y) + 0.5 - cy
		for x := minX; x <= maxX; x++ {
			if x < bounds.Min.X || x >= bounds.Max.X {
				continue
			}
			dx := float64(x) + 0.5 - cx
			if dx*dx+dy*dy <= r2 {
				img.SetRGBA(x, y, col)
			}
		}
	}
}
