FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Install Playwright browsers
RUN npx playwright install chromium

EXPOSE 3000

CMD ["node", "dist/index.js"]
