package dotbeam

import "math"

// Layout holds the computed positions of all dots and anchors.
type Layout struct {
	Config  Config
	Width   float64
	Height  float64
	Anchors [3]Anchor
	Rings   []RingLayout
}

// RingLayout holds dot positions for a single ring.
type RingLayout struct {
	Radius    float64
	DotCount  int
	Positions []Position
}

// Position is a point in the layout.
type Position struct {
	X, Y  float64
	Angle float64
}

// NewLayout computes dot positions for the given config and canvas size.
func NewLayout(config Config, width, height float64) Layout {
	l := Layout{
		Config: config,
		Width:  width,
		Height: height,
	}

	// Anchors form an equilateral triangle at radius 0.82
	anchorRadius := 0.82
	l.Anchors = [3]Anchor{
		angleToPoint(270, anchorRadius), // Top
		angleToPoint(30, anchorRadius),  // Bottom-right
		angleToPoint(150, anchorRadius), // Bottom-left
	}

	// Data rings
	l.Rings = make([]RingLayout, config.Rings)
	for i := 0; i < config.Rings; i++ {
		ring := i + 1
		dotCount := ring * 6
		radius := ringRadius(ring, config.Rings)

		positions := make([]Position, dotCount)
		for j := 0; j < dotCount; j++ {
			angle := float64(j) * 360.0 / float64(dotCount)
			p := angleToPoint(angle, radius)
			positions[j] = Position{X: p.X, Y: p.Y, Angle: angle}
		}

		l.Rings[i] = RingLayout{
			Radius:    radius,
			DotCount:  dotCount,
			Positions: positions,
		}
	}

	return l
}

// ringRadius returns the normalized radius for a ring (1-indexed).
// Distributes rings evenly between 0.22 and 0.70.
func ringRadius(ring, totalRings int) float64 {
	if totalRings == 1 {
		return 0.40
	}
	minR := 0.22
	maxR := 0.70
	return minR + (maxR-minR)*float64(ring-1)/float64(totalRings-1)
}

// angleToPoint converts polar coordinates (degrees, radius) to Cartesian.
// Angle 0 = right, 90 = up, 270 = down (standard math convention).
func angleToPoint(angleDeg, radius float64) Anchor {
	rad := angleDeg * math.Pi / 180.0
	return Anchor{
		X: radius * math.Cos(rad),
		Y: -radius * math.Sin(rad), // Negative because screen Y is inverted
	}
}

// ScaleToCanvas converts normalized coordinates (-1..1) to canvas pixels.
func ScaleToCanvas(nx, ny, width, height float64) (float64, float64) {
	cx := width / 2
	cy := height / 2
	scale := math.Min(cx, cy) * 0.95 // 5% margin
	return cx + nx*scale, cy + ny*scale
}
