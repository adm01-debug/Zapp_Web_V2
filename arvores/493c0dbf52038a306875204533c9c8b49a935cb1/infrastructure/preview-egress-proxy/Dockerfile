FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY main.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /preview-egress-proxy .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /preview-egress-proxy /preview-egress-proxy
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/preview-egress-proxy"]
