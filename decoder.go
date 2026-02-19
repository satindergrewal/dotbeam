package dotbeam

import "errors"

var (
	ErrIncompleteData = errors.New("dotbeam: incomplete data, not all frames received")
	ErrInvalidFrame   = errors.New("dotbeam: invalid frame header")
)

// Decoder reassembles data from captured dotbeam frames.
type Decoder struct {
	config   Config
	frames   map[int][]byte // frame index → payload
	total    int
	received int
}

// NewDecoder creates a new decoder with the given config.
func NewDecoder(config Config) *Decoder {
	return &Decoder{
		config: config,
		frames: make(map[int][]byte),
	}
}

// AddFrame processes a decoded frame's dot values and stores the payload.
// Returns true if all frames have been received.
func (d *Decoder) AddFrame(dots []Dot) (bool, error) {
	if len(dots) == 0 {
		return false, ErrInvalidFrame
	}

	// Convert dot values back to bytes
	data := d.dotsToBytes(dots)
	if len(data) < 2 {
		return false, ErrInvalidFrame
	}

	frameIndex := int(data[0])
	frameTotal := int(data[1])

	if frameTotal == 0 {
		return false, ErrInvalidFrame
	}

	d.total = frameTotal
	payload := data[2:]

	if _, exists := d.frames[frameIndex]; !exists {
		d.frames[frameIndex] = payload
		d.received++
	}

	return d.received >= d.total, nil
}

// Data returns the reassembled data. Returns error if incomplete.
func (d *Decoder) Data() ([]byte, error) {
	if d.received < d.total {
		return nil, ErrIncompleteData
	}

	var result []byte
	for i := 0; i < d.total; i++ {
		payload, ok := d.frames[i]
		if !ok {
			return nil, ErrIncompleteData
		}
		result = append(result, payload...)
	}

	return result, nil
}

// Progress returns the fraction of frames received (0.0 to 1.0).
func (d *Decoder) Progress() float64 {
	if d.total == 0 {
		return 0
	}
	return float64(d.received) / float64(d.total)
}

// Reset clears all received frames.
func (d *Decoder) Reset() {
	d.frames = make(map[int][]byte)
	d.total = 0
	d.received = 0
}

// dotsToBytes converts dot values back into a byte slice.
func (d *Decoder) dotsToBytes(dots []Dot) []byte {
	bitsPerDot := d.config.BitsPerDot
	bits := make([]uint8, len(dots)*bitsPerDot)

	for i, dot := range dots {
		for b := bitsPerDot - 1; b >= 0; b-- {
			bits[i*bitsPerDot+(bitsPerDot-1-b)] = (dot.Value >> b) & 1
		}
	}

	// Pack bits into bytes
	numBytes := len(bits) / 8
	data := make([]byte, numBytes)
	for i := 0; i < numBytes; i++ {
		var val byte
		for j := 0; j < 8; j++ {
			val = (val << 1) | bits[i*8+j]
		}
		data[i] = val
	}

	return data
}
