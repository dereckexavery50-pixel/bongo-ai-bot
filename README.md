# Bongo AI Bot — WhatsApp Baileys Connector

Autonomous WhatsApp group connector for **Bongo AI Bot**, powered by **@whiskeysockets/baileys** and **Google Gemini API** (`@google/genai`).

## ⚠️ Important Architectural Notice

> **Baileys is an unofficial WhatsApp Web library** that reverse-engineers the WhatsApp Web WebSocket protocol.
> It requires an always-running Node.js environment (VPS, Docker, PM2) with a persistent disk for `baileys_auth_info/`.
> It cannot run on serverless functions (standard Vercel/Lambda) because WhatsApp Web requires a continuous, open WebSocket connection.

## 🔐 Safe API Key Storage & Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Set your `GEMINI_API_KEY` in `.env`. Never commit `.env` or `baileys_auth_info` to Git.
3. Start the bot:
   ```bash
   npm install
   npm run dev
   ```
4. Scan the QR code displayed in the terminal with WhatsApp (Linked Devices).
5. Copy your group's JID from the terminal printout into `ALLOWED_GROUP_JIDS` in `.env`.
6. Run 24/7 with PM2:
   ```bash
   npm run build
   pm2 start dist/index.js --name "bongo-bot"
   pm2 save
   pm2 startup
   ```