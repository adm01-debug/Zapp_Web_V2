package main

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"
	"time"
)

const testSecret = "0123456789abcdef0123456789abcdef"

func TestBlockedAddresses(t *testing.T) {
	for _, raw := range []string{"0.1.2.3", "127.0.0.1", "10.0.0.1", "169.254.169.254", "100.64.0.1", "192.0.0.1", "192.0.2.1", "198.18.0.1", "240.0.0.1", "::1", "fc00::1", "2001:db8::1"} {
		address := netip.MustParseAddr(raw)
		if !isBlockedAddress(address) {
			t.Fatalf("expected %s to be blocked", raw)
		}
	}
	for _, raw := range []string{"93.184.216.34", "192.0.78.9"} {
		if isBlockedAddress(netip.MustParseAddr(raw)) {
			t.Fatalf("public IPv4 address %s was blocked", raw)
		}
	}
}

func TestUnsafeURLsAreRejected(t *testing.T) {
	for _, raw := range []string{
		"file:///etc/passwd", "https://user:pass@example.test/", "https://example.test:8443/",
		"http://localhost/", "http://127.0.0.1/", "https://service.internal/",
	} {
		if _, err := allowedURL(raw); err == nil {
			t.Fatalf("expected %q to be rejected", raw)
		}
	}
}

func TestRequestAuthenticationAndReplay(t *testing.T) {
	s, err := newService(testSecret)
	if err != nil {
		t.Fatal(err)
	}
	body := []byte(`{"url":"http://127.0.0.1/"}`)
	now := time.Now()
	request := httptest.NewRequest(http.MethodPost, "/v1/fetch", strings.NewReader(string(body)))
	request.Header.Set("X-Zapp-Egress-Timestamp", strconvFormat(now.Unix()))
	request.Header.Set("X-Zapp-Egress-Nonce", "nonce-with-at-least-sixteen-bytes")
	request.Header.Set("X-Zapp-Egress-Signature", signature(s.secret, request.Header.Get("X-Zapp-Egress-Timestamp"), request.Header.Get("X-Zapp-Egress-Nonce"), body))
	first := httptest.NewRecorder()
	s.handler(first, request)
	if first.Code != http.StatusBadGateway {
		t.Fatalf("expected target rejection, got %d", first.Code)
	}

	replayed := httptest.NewRequest(http.MethodPost, "/v1/fetch", strings.NewReader(string(body)))
	for _, header := range []string{"X-Zapp-Egress-Timestamp", "X-Zapp-Egress-Nonce", "X-Zapp-Egress-Signature"} {
		replayed.Header.Set(header, request.Header.Get(header))
	}
	second := httptest.NewRecorder()
	s.handler(second, replayed)
	if second.Code != http.StatusUnauthorized {
		t.Fatalf("expected replay rejection, got %d", second.Code)
	}
}

func TestNonceOutlivesTimestampAcceptanceWindow(t *testing.T) {
	s, err := newService(testSecret)
	if err != nil {
		t.Fatal(err)
	}
	body := []byte(`{"url":"https://example.test/"}`)
	received := time.Unix(1_700_000_000, 500_000_000)
	// Client clock ahead by the whole window: the first request is still accepted.
	timestamp := strconvFormat(received.Unix() + int64(replayWindow/time.Second))
	nonce := "nonce-with-at-least-sixteen-bytes"
	signed := func() *http.Request {
		request := httptest.NewRequest(http.MethodPost, "/v1/fetch", strings.NewReader(string(body)))
		request.Header.Set("X-Zapp-Egress-Timestamp", timestamp)
		request.Header.Set("X-Zapp-Egress-Nonce", nonce)
		request.Header.Set("X-Zapp-Egress-Signature", signature(s.secret, timestamp, nonce, body))
		return request
	}
	if !s.authorized(signed(), body, received) {
		t.Fatal("expected first request inside the window to be accepted")
	}
	for _, offset := range []time.Duration{replayWindow + time.Second, 2 * replayWindow, 2*replayWindow + 200*time.Millisecond} {
		if s.authorized(signed(), body, received.Add(offset)) {
			t.Fatalf("replay accepted %s after the first request", offset)
		}
	}
}

func TestPinnedDialUsesValidatedAddressAndPreservesHost(t *testing.T) {
	calledHost := ""
	serverName := ""
	target := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calledHost = r.Host
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte("<title>safe preview</title>"))
	}))
	target.TLS = &tls.Config{GetConfigForClient: func(hello *tls.ClientHelloInfo) (*tls.Config, error) {
		serverName = hello.ServerName
		return nil, nil
	}}
	target.StartTLS()
	defer target.Close()
	targetAddress := target.Listener.Addr().String()
	var dialed string
	s, err := newService(testSecret)
	if err != nil {
		t.Fatal(err)
	}
	s.lookup = func(_ context.Context, host string) ([]net.IPAddr, error) {
		if host != "public.example.test" {
			t.Fatalf("unexpected DNS lookup for %s", host)
		}
		return []net.IPAddr{{IP: net.ParseIP("93.184.216.34")}}, nil
	}
	s.dial = func(ctx context.Context, network, address string) (net.Conn, error) {
		dialed = address
		return (&net.Dialer{}).DialContext(ctx, network, targetAddress)
	}
	s.tls = &tls.Config{InsecureSkipVerify: true} // #nosec G402 -- test-only server certificate
	response, err := s.fetch(context.Background(), "https://public.example.test/preview")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(dialed, "93.184.216.34:") {
		t.Fatalf("connection was not pinned to DNS result: %s", dialed)
	}
	if calledHost != "public.example.test" {
		t.Fatalf("original Host header was not preserved: %q", calledHost)
	}
	if serverName != "public.example.test" {
		t.Fatalf("original SNI was not preserved: %q", serverName)
	}
	body, decodeErr := base64.StdEncoding.DecodeString(response.BodyBase64)
	if decodeErr != nil || response.Status != http.StatusOK || !strings.Contains(string(body), "safe preview") {
		t.Fatalf("unexpected response: %+v", response)
	}
}

func TestRejectsPrivateDNSAnswerBeforeDial(t *testing.T) {
	s, err := newService(testSecret)
	if err != nil {
		t.Fatal(err)
	}
	dialed := false
	s.lookup = func(context.Context, string) ([]net.IPAddr, error) {
		return []net.IPAddr{{IP: net.ParseIP("10.0.0.9")}}, nil
	}
	s.dial = func(context.Context, string, string) (net.Conn, error) {
		dialed = true
		return nil, nil
	}
	if _, err := s.fetch(context.Background(), "https://rebind.example.test/"); err == nil {
		t.Fatal("expected private DNS response to be rejected")
	}
	if dialed {
		t.Fatal("private DNS result reached the dialer")
	}
}

func strconvFormat(value int64) string { return fmt.Sprintf("%d", value) }

// Keep test imports honest when this file is compiled with older Go tooling.
var _ = []any{json.Valid, tls.VersionTLS13}
