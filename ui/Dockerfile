FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# Only public configuration enters the browser bundle.
ARG EXPO_PUBLIC_API_URL
ARG EXPO_PUBLIC_SUPABASE_URL
ARG EXPO_PUBLIC_SUPABASE_ANON_KEY
ARG EXPO_PUBLIC_SITE_URL
ENV EXPO_NO_DOTENV=1 \
    EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL \
    EXPO_PUBLIC_SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL \
    EXPO_PUBLIC_SUPABASE_ANON_KEY=$EXPO_PUBLIC_SUPABASE_ANON_KEY \
    EXPO_PUBLIC_SITE_URL=$EXPO_PUBLIC_SITE_URL
RUN test -n "$EXPO_PUBLIC_API_URL" && test -n "$EXPO_PUBLIC_SUPABASE_URL" \
    && test -n "$EXPO_PUBLIC_SUPABASE_ANON_KEY" && test -n "$EXPO_PUBLIC_SITE_URL" \
    && npm run build:web

FROM caddy:2.10.2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/dist /srv
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
