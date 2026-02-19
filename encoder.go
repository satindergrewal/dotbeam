package dotbeam

// Encoder converts arbitrary bytes into a sequence of dotbeam frames.
type Encoder struct {
	config Config
	layout Layout
}

// NewEncoder creates a new encoder with the given config.
func NewEncoder(config Config) *Encoder {
	layout := NewLayout(config, 1, 1) // Normalized coordinates
	return &Encoder{config: config, layout: layout}
}

// Encode splits data into frames, each containing dot colors.
func (e *Encoder) Encode(data []byte) []Frame {
	bytesPerFrame := e.config.BytesPerFrame()
	if bytesPerFrame <= 0 {
		return nil
	}

	// Calculate total frames needed
	totalFrames := (len(data) + bytesPerFrame - 1) / bytesPerFrame
	if totalFrames > 255 {
		totalFrames = 255 // Protocol limit
	}

	frames := make([]Frame, totalFrames)
	for i := 0; i < totalFrames; i++ {
		start := i * bytesPerFrame
		end := start + bytesPerFrame
		if end > len(data) {
			end = len(data)
		}
		chunk := data[start:end]

		// Build the full frame bytes: [index, total, ...payload]
		frameBytes := make([]byte, 2+len(chunk))
		frameBytes[0] = byte(i)
		frameBytes[1] = byte(totalFrames)
		copy(frameBytes[2:], chunk)

		// Pad to fill all dots if needed (ceiling division to preserve trailing bits)
		totalBits := e.config.BitsPerFrame()
		totalBytes := (totalBits + 7) / 8
		if len(frameBytes) < totalBytes {
			padded := make([]byte, totalBytes)
			copy(padded, frameBytes)
			frameBytes = padded
		}

		// Convert bytes to dot values
		dots := e.bytesToDots(frameBytes)

		frames[i] = Frame{
			Index:   i,
			Total:   totalFrames,
			Dots:    dots,
			Payload: chunk,
		}
	}

	return frames
}

// bytesToDots converts a byte slice into dot values using the layout positions.
func (e *Encoder) bytesToDots(data []byte) []Dot {
	bits := bytesToBits(data)
	bitsPerDot := e.config.BitsPerDot
	dotIndex := 0
	var dots []Dot

	for _, ring := range e.layout.Rings {
		for j, pos := range ring.Positions {
			bitStart := dotIndex * bitsPerDot
			if bitStart+bitsPerDot > len(bits) {
				break
			}

			value := uint8(0)
			for b := 0; b < bitsPerDot; b++ {
				value = (value << 1) | bits[bitStart+b]
			}

			dots = append(dots, Dot{
				Ring:  ring.DotCount / 6, // Ring number
				Index: j,
				Value: value,
				X:     pos.X,
				Y:     pos.Y,
			})
			dotIndex++
		}
	}

	return dots
}

// bytesToBits converts a byte slice to individual bits (MSB first).
func bytesToBits(data []byte) []uint8 {
	bits := make([]uint8, len(data)*8)
	for i, b := range data {
		for j := 7; j >= 0; j-- {
			bits[i*8+(7-j)] = (b >> j) & 1
		}
	}
	return bits
}
