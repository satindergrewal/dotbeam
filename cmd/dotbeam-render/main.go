// Command dotbeam-render encodes a message into dotbeam frames and renders
// them as PNG images. Optionally stitches them into an animated GIF using ffmpeg.
//
// Usage:
//
//	dotbeam-render -msg "Hello world" -out frames/ -gif output.gif
package main

import (
	"flag"
	"fmt"
	"image/png"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/satindergrewal/dotbeam"
)

func main() {
	msg := flag.String("msg", "Hello, dotbeam!", "Message to encode")
	outDir := flag.String("out", "frames", "Output directory for PNG frames")
	gifPath := flag.String("gif", "", "Output GIF path (requires ffmpeg)")
	size := flag.Int("size", 800, "Image size in pixels (square)")
	flag.Parse()

	cfg := dotbeam.DefaultConfig()
	enc := dotbeam.NewEncoder(cfg)
	frames := enc.Encode([]byte(*msg))

	if len(frames) == 0 {
		fmt.Fprintln(os.Stderr, "error: message produced no frames")
		os.Exit(1)
	}

	// Create output directory
	if err := os.MkdirAll(*outDir, 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "error creating output dir: %v\n", err)
		os.Exit(1)
	}

	layout := dotbeam.NewLayout(cfg, 1, 1) // normalized coordinates

	fmt.Printf("Encoding %d bytes into %d frames (%d dots/frame, %d bits/dot)\n",
		len(*msg), len(frames), cfg.TotalDots(), cfg.BitsPerDot)

	for _, frame := range frames {
		img := dotbeam.RenderFrame(frame, layout, *size, *size)

		filename := filepath.Join(*outDir, fmt.Sprintf("frame_%03d.png", frame.Index))
		f, err := os.Create(filename)
		if err != nil {
			fmt.Fprintf(os.Stderr, "error creating %s: %v\n", filename, err)
			os.Exit(1)
		}
		if err := png.Encode(f, img); err != nil {
			f.Close()
			fmt.Fprintf(os.Stderr, "error encoding PNG: %v\n", err)
			os.Exit(1)
		}
		f.Close()
		fmt.Printf("  frame %d/%d → %s\n", frame.Index+1, len(frames), filename)
	}

	// Generate GIF with ffmpeg if requested
	if *gifPath != "" {
		if _, err := exec.LookPath("ffmpeg"); err != nil {
			fmt.Fprintln(os.Stderr, "warning: ffmpeg not found, skipping GIF generation")
		} else {
			inputPattern := filepath.Join(*outDir, "frame_%03d.png")
			fps := fmt.Sprintf("%d", cfg.FPS)

			// Two-pass for better GIF quality: generate palette first, then apply
			palettePath := filepath.Join(*outDir, "palette.png")
			cmd1 := exec.Command("ffmpeg", "-y",
				"-framerate", fps,
				"-i", inputPattern,
				"-vf", "palettegen=max_colors=64",
				palettePath,
			)
			cmd1.Stderr = os.Stderr
			if err := cmd1.Run(); err != nil {
				fmt.Fprintf(os.Stderr, "ffmpeg palette error: %v\n", err)
				os.Exit(1)
			}

			cmd2 := exec.Command("ffmpeg", "-y",
				"-framerate", fps,
				"-i", inputPattern,
				"-i", palettePath,
				"-lavfi", "paletteuse=dither=none",
				"-loop", "0",
				*gifPath,
			)
			cmd2.Stderr = os.Stderr
			if err := cmd2.Run(); err != nil {
				fmt.Fprintf(os.Stderr, "ffmpeg GIF error: %v\n", err)
				os.Exit(1)
			}

			// Clean up palette
			os.Remove(palettePath)
			fmt.Printf("  GIF → %s (%d FPS, loop forever)\n", *gifPath, cfg.FPS)
		}
	}

	fmt.Println("Done.")
}
