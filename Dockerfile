# Dockerfile — Railway cron image for the LinkedIn GTM scan
FROM node:22-slim

# Playwright (a prod dep) must NOT download browsers — the LinkedIn scan never
# launches a browser; it only hits the Bright Data + Sheets + OpenRouter HTTP APIs.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app
# package-lock.json is gitignored in this repo, so it isn't in the build context.
# Use `npm install` (not `npm ci`, which requires a lockfile).
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

# Credentials are injected at runtime via Railway env vars (see scrapers/README-linkedin.md):
#   BRIGHT_DATA_API_KEY, OPEN_ROUTER_API_KEY, LINKEDIN_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_JSON
# The Railway cron schedule runs this command daily; override in the service if needed.
CMD ["node", "scrapers/linkedin-scan.js"]
