FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json tsconfig.json ./
RUN npm install

COPY src/ ./src/
RUN npm run build

# Volume for persisting Baileys auth tokens across container restarts
VOLUME ["/app/baileys_auth_info"]

ENV NODE_ENV=production

CMD ["npm", "start"]