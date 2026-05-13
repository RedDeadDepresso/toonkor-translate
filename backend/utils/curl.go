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

func ParseCurlCommand(curl string) (*CurlContext, error) {

	parts := strings.Fields(curl)

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

		case "-H", "--header":

			if i+1 >= len(parts) {
				continue
			}

			i++

			header := strings.Trim(parts[i], `"'`)

			split := strings.SplitN(
				header,
				":",
				2,
			)

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

			cookieString := strings.Trim(
				parts[i],
				`"'`,
			)

			cookies := strings.Split(
				cookieString,
				";",
			)

			for _, c := range cookies {

				pair := strings.SplitN(
					strings.TrimSpace(c),
					"=",
					2,
				)

				if len(pair) != 2 {
					continue
				}

				ctx.Cookies = append(
					ctx.Cookies,
					&http.Cookie{
						Name:  pair[0],
						Value: pair[1],
					},
				)
			}

		default:

			if strings.HasPrefix(part, "http://") ||
				strings.HasPrefix(part, "https://") {

				ctx.URL = strings.Trim(
					part,
					`"'`,
				)
			}
		}
	}

	if ctx.URL == "" {
		return nil, errors.New("url not found")
	}

	return ctx, nil
}