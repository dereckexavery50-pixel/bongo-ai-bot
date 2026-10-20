import makeWASocket, { DisconnectReason, useMultiFileAuthState } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import { config } from "./config";
import { memoryManager } from "./memory";
import { cooldownTracker } from "./cooldown";
import { generateBongoReply } from "./gemini";

async function startBongoBaileysBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: true,
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("Connection closed due to ", lastDisconnect?.error, ", reconnecting ", shouldReconnect);
      if (shouldReconnect) {
        startBongoBaileysBot();
      }
    } else if (connection === "open") {
      console.log("✅ BongoBot connected successfully to WhatsApp!");
      
      // Hapa ndipo hiyo sehemu yako inapoanzia:
      try {
        const groups = await sock.groupFetchAllParticipating();
        console.log("\n------------------------------------------");
        console.log("📋 FETCHED CONNECTED GROUPS:");
        for (const jid in groups) {
          const groupData = groups[jid];
          const isAllowed = config.allowedGroupJids.includes(jid);
          console.log(`📋 Name: "${groupData.subject}" | JID: "${jid}" | [${isAllowed ? "✅ ALLOWLISTED" : "⛔ IGNORED"}]`);
        }
        console.log("------------------------------------------\n");
      } catch (err) {
        console.warn("Could not list groups automatically:", err);
      }
    }
  });

  // Persist updated credentials automatically
  sock.ev.on("creds.update", saveCreds);

  // Listen to incoming messages
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const m of messages) {
      const chatJid = m.key.remoteJid;
      if (!chatJid) continue;

      const isGroup = chatJid.endsWith("@g.us");
      if (!isGroup) continue;

      if (m.key.fromMe) continue;

      const isAllowlisted = config.allowedGroupJids.includes(chatJid);
      if (!isAllowlisted) continue;

      const text = m.message?.conversation || m.message?.extendedTextMessage?.text;
      if (!text) continue;

      const senderJid = m.key.participant || chatJid;
      const senderName = m.pushName || senderJid.split("@")[0] || "Mwanagroup";

      console.log(`📩 [Group: ${chatJid.slice(0, 15)}...] ${senderName}: "${text}"`);

      memoryManager.addMessage(chatJid, {
        id: m.key.id || String(Date.now()),
        senderJid,
        senderName,
        text,
        timestamp: Date.now(),
        isBot: false,
      });

      if (cooldownTracker.isCoolingDown(chatJid)) {
        const remaining = cooldownTracker.getRemainingSeconds(chatJid);
        console.log(`⏳ Cooldown active (${remaining}s remaining in this group). Bot stays silent.`);
        continue;
      }

      const shouldReply = config.botMode === "natural" 
        ? text.toLowerCase().includes(config.botName.toLowerCase()) 
        : text.includes(config.botName);

      if (!shouldReply) {
        console.log(`💤 Message did not trigger response heuristic.`);
        continue;
      }

      console.log(`🤖 Trigger activated! Generating contextual Bongo Swahili reply...`);

      try {
        await sock.sendPresenceUpdate("composing", chatJid);
      } catch {}

      try {
        const recentContext = memoryManager.formatContextForGemini(chatJid);

        const replyText = await generateBongoReply({
          senderName,
          currentMessage: text,
          chatContext: recentContext,
        });

        if (!replyText) continue;

        await new Promise((resolve) => setTimeout(resolve, 1500));

        await sock.sendMessage(chatJid, { text: replyText }, { quoted: m });
        console.log(`✅ Sent reply: "${replyText}"`);

        memoryManager.addMessage(chatJid, {
          id: String(Date.now()),
          senderJid: "bot",
          senderName: config.botName,
          text: replyText,
          timestamp: Date.now(),
          isBot: true,
        });

        cooldownTracker.recordReply(chatJid);
        console.log(`⏱️ Cooldown started for ${config.cooldownSeconds}s`);
      } catch (err) {
        console.error("❌ Failed to generate or send WhatsApp reply:", err);
      } finally {
        try {
          await sock.sendPresenceUpdate("paused", chatJid);
        } catch {}
      }
    }
  });
}

// Start the bot connector
startBongoBaileysBot().catch((err) => {
  console.error("Fatal error starting Bongo Baileys Bot:", err);
  process.exit(1);
});
