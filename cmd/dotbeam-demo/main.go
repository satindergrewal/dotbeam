// Command dotbeam-demo is an HTTPS demo server that encodes data using the
// dotbeam package and serves the resulting frames as JSON alongside a static
// web directory.  A self-signed TLS certificate is generated at startup so
// that mobile browsers can access the camera (secure-context requirement).
package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"flag"
	"fmt"
	"log"
	"math/big"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/satindergrewal/dotbeam"
)

// ---------- JSON response types ----------

type dotJSON struct {
	Ring  int     `json:"ring"`
	Index int     `json:"index"`
	Value uint8   `json:"value"`
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
}

type frameJSON struct {
	Index int       `json:"index"`
	Total int       `json:"total"`
	Dots  []dotJSON `json:"dots"`
}

type anchorJSON struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type configJSON struct {
	Rings      int  `json:"rings"`
	BitsPerDot int  `json:"bitsPerDot"`
	FPS        int  `json:"fps"`
	UseFountain bool `json:"useFountain"`
}

type apiResponse struct {
	Frames     []frameJSON `json:"frames"`
	Config     configJSON  `json:"config"`
	Colors     []string    `json:"colors"`
	Anchors    []anchorJSON `json:"anchors"`
	DataLength int         `json:"dataLength"`
	Data       string      `json:"data"`
}

// ---------- main ----------

func main() {
	data := flag.String("data", "Hello from dotbeam!", "message to encode")
	port := flag.Int("port", 8443, "HTTPS listen port")
	flag.Parse()

	// Encode the data.
	cfg := dotbeam.DefaultConfig()
	enc := dotbeam.NewEncoder(cfg)
	frames := enc.Encode([]byte(*data))

	// Build a layout so we can pass anchor positions to the client.
	// Use a 400x400 canvas as the reference size; the renderer can scale.
	layout := dotbeam.NewLayout(cfg, 400, 400)

	// Build JSON payload once (it never changes).
	resp := buildResponse(frames, cfg, layout, *data)
	payload, err := json.Marshal(resp)
	if err != nil {
		log.Fatalf("json marshal: %v", err)
	}

	// Routes.
	mux := http.NewServeMux()

	mux.HandleFunc("/api/frames", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		w.Write(payload)
	})

	// Static files from web/ directory (index.html, scan.html, static/*).
	webDir := findWebDir()
	mux.Handle("/", http.FileServer(http.Dir(webDir)))

	// Generate self-signed TLS certificate in memory.
	tlsCert, err := selfSignedCert()
	if err != nil {
		log.Fatalf("tls cert: %v", err)
	}

	srv := &http.Server{
		Addr:    fmt.Sprintf(":%d", *port),
		Handler: mux,
		TLSConfig: &tls.Config{
			Certificates: []tls.Certificate{tlsCert},
		},
	}

	// Print helpful startup info.
	lanIP := getLANIP()
	fmt.Printf("dotbeam demo server\n")
	fmt.Printf("  data:   %q (%d bytes, %d frames)\n", *data, len(*data), len(frames))
	fmt.Printf("  listen: https://%s:%d\n", lanIP, *port)
	fmt.Printf("\nOpen the URL above on your phone (accept the self-signed cert warning).\n")

	// ListenAndServeTLS with empty cert/key paths because we set TLSConfig directly.
	log.Fatal(srv.ListenAndServeTLS("", ""))
}

// ---------- helpers ----------

func buildResponse(frames []dotbeam.Frame, cfg dotbeam.Config, layout dotbeam.Layout, dataStr string) apiResponse {
	// Frames.
	fj := make([]frameJSON, len(frames))
	for i, f := range frames {
		dots := make([]dotJSON, len(f.Dots))
		for j, d := range f.Dots {
			dots[j] = dotJSON{
				Ring:  d.Ring,
				Index: d.Index,
				Value: d.Value,
				X:     d.X,
				Y:     d.Y,
			}
		}
		fj[i] = frameJSON{
			Index: f.Index,
			Total: f.Total,
			Dots:  dots,
		}
	}

	// Colors.
	colors := make([]string, len(dotbeam.DefaultColors))
	for i, c := range dotbeam.DefaultColors {
		colors[i] = c.Hex()
	}

	// Anchors.
	anchors := make([]anchorJSON, len(layout.Anchors))
	for i, a := range layout.Anchors {
		anchors[i] = anchorJSON{X: a.X, Y: a.Y}
	}

	return apiResponse{
		Frames: fj,
		Config: configJSON{
			Rings:      cfg.Rings,
			BitsPerDot: cfg.BitsPerDot,
			FPS:        cfg.FPS,
			UseFountain: cfg.UseFountain,
		},
		Colors:     colors,
		Anchors:    anchors,
		DataLength: len(dataStr),
		Data:       dataStr,
	}
}

// selfSignedCert generates an in-memory self-signed TLS certificate valid for
// 24 hours.  No files are written to disk.
func selfSignedCert() (tls.Certificate, error) {
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("generate key: %w", err)
	}

	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("serial: %w", err)
	}

	tmpl := x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: "dotbeam-demo"},
		NotBefore:    time.Now().Add(-5 * time.Minute),
		NotAfter:     time.Now().Add(24 * time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		IPAddresses:  []net.IP{net.ParseIP("127.0.0.1")},
	}

	// Include the LAN IP so the cert is valid when accessed from other devices.
	if ip := net.ParseIP(getLANIP()); ip != nil {
		tmpl.IPAddresses = append(tmpl.IPAddresses, ip)
	}

	certDER, err := x509.CreateCertificate(rand.Reader, &tmpl, &tmpl, &priv.PublicKey, priv)
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("create cert: %w", err)
	}

	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	keyDER, err := x509.MarshalECPrivateKey(priv)
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("marshal key: %w", err)
	}
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER})

	return tls.X509KeyPair(certPEM, keyPEM)
}

// findWebDir locates the web/ directory by checking common paths relative to
// the working directory. This handles running from the project root or from
// cmd/dotbeam-demo/.
func findWebDir() string {
	candidates := []string{
		"web",
		"../../web",
	}
	for _, c := range candidates {
		abs, err := filepath.Abs(c)
		if err != nil {
			continue
		}
		if info, err := os.Stat(abs); err == nil && info.IsDir() {
			return abs
		}
	}
	log.Fatal("cannot find web/ directory — run from the project root or cmd/dotbeam-demo/")
	return ""
}

// getLANIP returns the first non-loopback IPv4 address, or "127.0.0.1" as a
// fallback.
func getLANIP() string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return "127.0.0.1"
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip == nil || ip.IsLoopback() {
				continue
			}
			if ip4 := ip.To4(); ip4 != nil {
				return ip4.String()
			}
		}
	}
	return "127.0.0.1"
}
