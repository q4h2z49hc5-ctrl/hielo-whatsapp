FROM node:18-slim

RUN apt-get update && apt-get install -y git chromium fonts-ipafont-gothic fonts-wqy-zenhei libxss1 --no-install-recommends && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

COPY package.json ./
RUN npm install --legacy-peer-deps

COPY . .

RUN mkdir -p /app/wa_auth

EXPOSE 3000

CMD ["node", "index.js"]