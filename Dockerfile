FROM node:18-slim

RUN apt-get update && apt-get install -y \
    chromium \
        fonts-ipafont-gothic \
            fonts-wqy-zenhei \
                fonts-thai-tlwg \
                    fonts-freefont-ttf \
                        libxss1 \
                            --no-install-recommends \
                                && rm -rf /var/lib/apt/lists/*

                                ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
                                ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

                                WORKDIR /app

                                COPY package.json ./
                                RUN npm install

                                COPY . .

                                RUN mkdir -p /app/.wwebjs_auth

                                EXPOSE 3000

                                CMD ["node", "index.js"]
