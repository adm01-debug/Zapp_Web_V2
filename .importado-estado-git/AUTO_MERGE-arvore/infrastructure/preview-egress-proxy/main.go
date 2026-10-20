// preview-egress-proxy is the only component allowed to open arbitrary public
// web connections for link previews. It resolves a hostname once, rejects
// non-public results and dials the approved IP directly, preserving SNI/Host.
package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"crypto/tls"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	maxRequestBytes  = 4 * 1024
	maxResponseBytes = 512 * 1024
	maxRedirects     = 3
	requestLifetime  = 6 * time.Second
	replayWindow     = 90 * time.Second
	maxNonces        = 10_000
)

type lookupIPAddr func(context.Context, string) ([]net.IPAddr, error)
type dialContext func(context.Context, string, string) (net.Conn, error)

type fetchRequest struct {
	URL string `json:"url"`
}

type fetchResponse struct {
	URL         string `json:"url"`
	Status      int    `json:"status"`
	ContentType string `json:"content_type"`
	BodyBase64  string `json:"body_base64"`
}

type service struct {
	secret  []byte
	lookup  lookupIPAddr
	dial    dialContext
	tls     *tls.Config
	nonces  map[string]time.Time
	nonceMu sync.Mutex
}

func newService(secret string) (*service, error) {
	if len(secret) < 32 {
		return nil, errors.New("PREVIEW_EGRESS_SHARED_SECRET must be at least 32 bytes")
	}
	dialer := &net.Dialer{Timeout: requestLifetime}
	return &service{
		secret: []byte(secret),
		lookup: net.DefaultResolver.LookupIPAddr,
		dial:   dialer.DialContext,
		nonces: map[string]time.Time{},
	}, nil
}

func isBlockedAddress(address netip.Addr) bool {
	address = address.Unmap()
	if address.Is4() {
		v4 := address.As4()
		if v4[0] == 0 || v4[0] == 127 || v4[0] >= 224 ||
			(v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127) ||
			(v4[0] == 192 && v4[1] == 0 && (v4[2] == 0 || v4[2] == 2)) ||
			(v4[0] == 198 && v4[1] == 51 && v4[2] == 100) ||
			(v4[0] == 203 && v4[1] == 0 && v4[2] == 113) {
			return true
		}
	}
	if address.Is6() {
		v6 := address.As16()
		if v6[0] == 0x20 && v6[1] == 0x01 && v6[2] == 0x0d && v6[3] == 0xb8 {
			return true
		}
	}
	return !address.IsValid() || address.IsLoopback() || address.IsUnspecified() ||
		address.IsPrivate() || address.IsLinkLocalUnicast() || address.IsLinkLocalMulticast() ||
		address.IsMulticast() || address.IsInterfaceLocalMulticast() ||
		address.Is4In6() ||
		(address.Is4() && address.As4()[0] == 100 && address.As4()[1] >= 64 && address.As4()[1] <= 127) ||
		(address.Is4() && address.As4()[0] == 198 && (address.As4()[1] == 18 || address.As4()[1] == 19))
}

func blockedHost(host string) bool {
	host = strings.TrimSuffix(strings.ToLower(host), ".")
	return host == "" || host == "localhost" || strings.HasSuffix(host, ".local") ||
		strings.HasSuffix(host, ".internal")
}

func allowedURL(raw string) (*url.URL, error) {
	if len(raw) == 0 || len(raw) > 2048 {
		return nil, errors.New("invalid URL length")
	}
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.Hostname() == "" {
		return nil, errors.New("invalid URL")
	}
	if u.Port() != "" && u.Port() != "80" && u.Port() != "443" {
		return nil, errors.New("port is not allowed")
	}
	if blockedHost(u.Hostname()) {
		return nil, errors.New("host is not allowed")
	}
	if literal, err := netip.ParseAddr(u.Hostname()); err == nil && isBlockedAddress(literal) {
		return nil, errors.New("address is not public")
	}
	return u, nil
}

func (s *service) resolvePublic(ctx context.Context, u *url.URL) ([]netip.Addr, error) {
	addresses, err := s.lookup(ctx, u.Hostname())
	if err != nil || len(addresses) == 0 {
		return nil, errors.New("DNS resolution failed")
	}
	seen := map[netip.Addr]struct{}{}
	public := make([]netip.Addr, 0, len(addresses))
	for _, item := range addresses {
		address, ok := netip.AddrFromSlice(item.IP)
		if !ok || isBlockedAddress(address) {
			// A mixed public/private DNS answer is unsafe: fail closed instead of
			// selecting a record whose answer can later be manipulated.
			return nil, errors.New("DNS answer is not exclusively public")
		}
		address = address.Unmap()
		if _, exists := seen[address]; !exists {
			seen[address] = struct{}{}
			public = append(public, address)
		}
	}
	return public, nil
}

func targetPort(u *url.URL) string {
	if u.Port() != "" {
		return u.Port()
	}
	if u.Scheme == "https" {
		return "443"
	}
	return "80"
}

func (s *service) fetchPinned(ctx context.Context, u *url.URL, address netip.Addr) (*http.Response, error) {
	target := net.JoinHostPort(address.String(), targetPort(u))
	tlsConfig := &tls.Config{MinVersion: tls.VersionTLS12, ServerName: u.Hostname()}
	if s.tls != nil {
		tlsConfig = s.tls.Clone()
		tlsConfig.ServerName = u.Hostname()
	}
	transport := &http.Transport{
		Proxy:                 nil,
		ForceAttemptHTTP2:     false,
		DisableKeepAlives:     true,
		ResponseHeaderTimeout: requestLifetime,
		DialContext: func(ctx context.Context, network, _ string) (net.Conn, error) {
			return s.dial(ctx, "tcp", target)
		},
		TLSClientConfig: tlsConfig,
	}
	client := &http.Client{
		Transport: transport,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept", "text/html,application/xhtml+xml")
	request.Header.Set("User-Agent", "ZAPPLinkPreview/2.0")
	return client.Do(request)
}

func (s *service) fetch(ctx context.Context, raw string) (fetchResponse, error) {
	current, err := allowedURL(raw)
	if err != nil {
		return fetchResponse{}, err
	}

	for redirects := 0; redirects <= maxRedirects; redirects++ {
		addresses, err := s.resolvePublic(ctx, current)
		if err != nil {
			return fetchResponse{}, err
		}

		var response *http.Response
		for _, address := range addresses {
			response, err = s.fetchPinned(ctx, current, address)
			if err == nil {
				break
			}
		}
		if err != nil || response == nil {
			return fetchResponse{}, errors.New("pinned request failed")
		}

		if response.StatusCode >= 300 && response.StatusCode <= 399 {
			location := response.Header.Get("Location")
			response.Body.Close()
			if location == "" || redirects == maxRedirects {
				return fetchResponse{}, errors.New("redirect is not allowed")
			}
			next, err := current.Parse(location)
			if err != nil {
				return fetchResponse{}, errors.New("invalid redirect")
			}
			current, err = allowedURL(next.String())
			if err != nil {
				return fetchResponse{}, err
			}
			continue
		}

		defer response.Body.Close()
		contentType := response.Header.Get("Content-Type")
		if !strings.Contains(strings.ToLower(contentType), "text/html") && !strings.Contains(strings.ToLower(contentType), "application/xhtml+xml") {
			return fetchResponse{}, errors.New("content type is not previewable")
		}
		body, err := io.ReadAll(io.LimitReader(response.Body, maxResponseBytes+1))
		if err != nil || len(body) > maxResponseBytes {
			return fetchResponse{}, errors.New("response body is too large")
		}
		return fetchResponse{
			URL:         current.String(),
			Status:      response.StatusCode,
			ContentType: contentType,
			BodyBase64:  base64.StdEncoding.EncodeToString(body),
		}, nil
	}
	return fetchResponse{}, errors.New("redirect limit exceeded")
}

func signature(secret []byte, timestamp, nonce string, body []byte) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(timestamp))
	mac.Write([]byte("\n"))
	mac.Write([]byte(nonce))
	mac.Write([]byte("\n"))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

func (s *service) reserveNonce(nonce string, now, expiry time.Time) bool {
	s.nonceMu.Lock()
	defer s.nonceMu.Unlock()
	for value, expiry := range s.nonces {
		if !expiry.After(now) {
			delete(s.nonces, value)
		}
	}
	if _, exists := s.nonces[nonce]; exists || len(s.nonces) >= maxNonces {
		return false
	}
	s.nonces[nonce] = expiry
	return true
}

func (s *service) authorized(r *http.Request, body []byte, now time.Time) bool {
	timestamp := r.Header.Get("X-Zapp-Egress-Timestamp")
	nonce := r.Header.Get("X-Zapp-Egress-Nonce")
	provided := r.Header.Get("X-Zapp-Egress-Signature")
	seconds, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil || len(nonce) < 16 || len(nonce) > 128 || len(provided) != 64 ||
		abs(now.Unix()-seconds) > int64(replayWindow/time.Second) {
		return false
	}
	expected := signature(s.secret, timestamp, nonce, body)
	if subtle.ConstantTimeCompare([]byte(expected), []byte(provided)) != 1 {
		return false
	}
	// Retain the nonce until its signed timestamp can no longer pass the
	// ±replayWindow check; the extra second covers Unix-second truncation.
	return s.reserveNonce(nonce, now, time.Unix(seconds, 0).Add(replayWindow+time.Second))
}

func abs(value int64) int64 {
	if value < 0 {
		return -value
	}
	return value
}

func (s *service) handler(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/healthz" && r.Method == http.MethodGet {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
		return
	}
	if r.URL.Path != "/v1/fetch" || r.Method != http.MethodPost {
		http.NotFound(w, r)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, maxRequestBytes+1))
	if err != nil || len(body) > maxRequestBytes {
		http.Error(w, `{"error":"invalid_request"}`, http.StatusBadRequest)
		return
	}
	if !s.authorized(r, body, time.Now()) {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	var input fetchRequest
	if json.Unmarshal(body, &input) != nil {
		http.Error(w, `{"error":"invalid_request"}`, http.StatusBadRequest)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestLifetime)
	defer cancel()
	output, err := s.fetch(ctx, input.URL)
	if err != nil {
		// Do not expose DNS, connection, or target details to callers.
		http.Error(w, `{"error":"preview_unavailable"}`, http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(output)
}

func main() {
	service, err := newService(os.Getenv("PREVIEW_EGRESS_SHARED_SECRET"))
	if err != nil {
		log.Fatal(err)
	}
	address := os.Getenv("PREVIEW_EGRESS_LISTEN_ADDR")
	if address == "" {
		address = ":8080"
	}
	server := &http.Server{
		Addr:              address,
		Handler:           http.HandlerFunc(service.handler),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       30 * time.Second,
	}
	log.Printf("preview egress proxy listening on %s", address)
	log.Fatal(server.ListenAndServe())
}
