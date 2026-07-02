FROM ghcr.io/puppeteer/puppeteer:21.11.0

WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY --chown=pptruser:pptruser package*.json ./
RUN npm install --omit=dev

COPY --chown=pptruser:pptruser *.js ./

ENTRYPOINT ["node"]
