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

      // 1. RULE: Only process group messages
      const isGroup = chatJid.endsWith("@g.us");
      if (!isGroup) continue;

      // 2. CRITICAL RULE: AVOID REPLYING TO ITS OWN MESSAGES
      if (m.key.fromMe) continue;

      // 3. CRITICAL RULE: ONLY RESPOND IN ALLOWLISTED TEST GROUP(S)
      const isAllowlisted = config.allowedGroupJids.includes(chatJid);
      if (!isAllowlisted) continue;

      const text = extractMessageText(m);
      if (!text) continue;

      const senderJid = m.key.participant || chatJid;
      const senderName = m.pushName || senderJid.split("@")[0] || "Mwanagroup";

      console.log(`📩 [Group: ${chatJid.slice(0, 15)}...] ${senderName}: "${text}"`);

      // 4. RULE: Store message in sliding-window context memory
      memoryManager.addMessage(chatJid, {
        id: m.key.id || String(Date.now()),
        senderJid,
        senderName,
        text,
        timestamp: Date.now(),
        isBot: false,
      });

      // 5. RULE: Check cooldown to prevent group spamming
      if (cooldownTracker.isCoolingDown(chatJid)) {
        const remaining = cooldownTracker.getRemainingSeconds(chatJid);
        console.log(`⏳ Cooldown active (${remaining}s remaining in this group). Bot stays silent.`);
        continue;
      }

      // 6. RULE: Determine if bot should reply naturally without needing @mention
      const shouldReply = config.botMode === "natural" 
        ? shouldReplyNaturally(text, config.botName) 
        : text.includes(config.botName);

      if (!shouldReply) {
        console.log(`💤 Message did not trigger natural response heuristic.`);
        continue;
      }

      console.log(`🤖 Trigger activated! Generating contextual Bongo Swahili reply...`);

      // 7. Send "typing..." presence to look natural
      try {
        await sock.sendPresenceUpdate("composing", chatJid);
      } catch {}

      // 8. Generate reply with Gemini using recent context
      try {
        const recentContext = memoryManager.formatContextForGemini(chatJid);

        const replyText = await generateBongoReply({
          senderName,
          currentMessage: text,
          chatContext: recentContext,
        });

        if (!replyText) continue;

        // Human-like delay (1.5 seconds)
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // 9. Send response back to the WhatsApp group, quoting user message
        await sock.sendMessage(chatJid, { text: replyText }, { quoted: m });
        console.log(`✅ Sent reply: "${replyText}"`);

        // 10. Record bot's reply in memory and update cooldown timer
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