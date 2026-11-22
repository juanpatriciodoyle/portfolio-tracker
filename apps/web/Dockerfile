# The web app for a small always-on machine. Build:
#   docker build --build-arg VITE_GOOGLE_CLIENT_ID=<your client id> -t portfolio-web apps/web
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The Google client id is public but belongs to one deployment, so it is set at build time.
ARG VITE_GOOGLE_CLIENT_ID=
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN npm run build \
 && chmod -R a+rX /app/dist

# nginx that never runs as root: it listens on 8080 and writes only to its own temporary folders.
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
