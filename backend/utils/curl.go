package utils

import (
	"errors"
	"net/http"
	"strings"
)

type CurlContext struct {
	URL     string
	Headers map[string]string
	Cookies []*http.Cookie
}

// splitCurlArgs splits a curl command string into tokens respecting single and
// double quoted strings, so that e.g. '-H' 'Referer: https://t.me/' is kept
// as one token instead of being split on the space inside the URL.
func splitCurlArgs(curl string) []string {
	var tokens []string
	var current strings.Builder
	inSingle := false
	inDouble := false

	for i := 0; i < len(curl); i++ {
		c := curl[i]
		switch {
		case c == '\'' && !inDouble:
			inSingle = !inSingle
		case c == '"' && !inSingle:
			inDouble = !inDouble
		case (c == ' ' || c == '\t' || c == '\n' || c == '\r') && !inSingle && !inDouble:
			if current.Len() > 0 {
				tokens = append(tokens, current.String())
				current.Reset()
			}
		default:
			current.WriteByte(c)
		}
	}
	if current.Len() > 0 {
		tokens = append(tokens, current.String())
	}
	return tokens
}

func ParseCurlCommand(curl string) (*CurlContext, error) {
	parts := splitCurlArgs(curl)

	if len(parts) == 0 {
		return nil, errors.New("empty curl command")
	}

	ctx := &CurlContext{
		Headers: make(map[string]string),
		Cookies: make([]*http.Cookie, 0),
	}

	for i := 0; i < len(parts); i++ {
		part := parts[i]

		switch part {
		case "curl":
			// skip the command itself

		case "-H", "--header":
			if i+1 >= len(parts) {
				continue
			}
			i++
			header := parts[i]
			split := strings.SplitN(header, ":", 2)
			if len(split) != 2 {
				continue
			}
			key := strings.TrimSpace(split[0])
			value := strings.TrimSpace(split[1])
			ctx.Headers[key] = value

		case "-b", "--cookie":
			if i+1 >= len(parts) {
				continue
			}
			i++
			cookieString := parts[i]
			cookies := strings.Split(cookieString, ";")
			for _, c := range cookies {
				pair := strings.SplitN(strings.TrimSpace(c), "=", 2)
				if len(pair) != 2 {
					continue
				}
				ctx.Cookies = append(ctx.Cookies, &http.Cookie{
					Name:  pair[0],
					Value: pair[1],
				})
			}

		case "--compressed", "-L", "--location", "-s", "--silent",
			"-v", "--verbose", "-k", "--insecure":
			// known flags with no value — skip

		default:
			// Skip flags we don't recognise (e.g. --data, -X POST, etc.)
			if strings.HasPrefix(part, "-") {
				// If this flag takes a value (doesn't look like a URL), skip next token too.
				// Single-char flags with values: -X, -d, -u, -o, -m, -A, -e, -r, etc.
				// We only care about URL and headers, so just skip.
				if !strings.HasPrefix(part, "--") && len(part) == 2 {
					i++ // skip the value
				}
				continue
			}
			// Must be the URL — only set it if not already set (first positional arg wins)
			if ctx.URL == "" && (strings.HasPrefix(part, "http://") || strings.HasPrefix(part, "https://")) {
				ctx.URL = part
			}
		}
	}

	if ctx.URL == "" {
		return nil, errors.New("url not found")
	}

	return ctx, nil
}