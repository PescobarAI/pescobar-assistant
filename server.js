import express from "express";
import bodyParser from "body-parser";
import { OpenAI } from "openai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(bodyParser.urlencoded({ extended: false }));

app.post("/webhook", async (req, res) => {
  console.log("✅ Webhook was hit!");

  const userMessage = req.body.Body?.toLowerCase() || "";

  // Always set TwiML headers
  res.set("Content-Type", "text/xml");

  // Respond to "checklist"
  if (userMessage.includes("checklist")) {
    return res.send(`
      <Response>
        <Message>
Starting your checklist:  
1. Turn on grill  
2. Check fridge temp  
3. Refill sauces  
Reply "done" after each step ✅
        </Message>
      </Response>
    `);
  }

  // Respond to maintenance
  if (userMessage.includes("fryer") || userMessage.includes("broken") || userMessage.includes("repair")) {
    return res.send(`
      <Response>
        <Message>
Thanks! Logging your maintenance issue: "${userMessage}".  
A manager has been notified 🛠️
        </Message>
      </Response>
    `);
  }

  // GPT fallback for everything else
  try {
    const aiReply = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: userMessage }],
    });

    const replyText = aiReply.choices[0].message.content || "I'm not sure how to help with that.";

    return res.send(`
      <Response>
        <Message>${replyText}</Message>
      </Response>
    `);
  } catch (err) {
    console.error("❌ GPT error:", err);
    return res.send(`
      <Response>
        <Message>Sorry, I'm having trouble responding right now. Please try again shortly.</Message>
      </Response>
    `);
  }
});

app.listen(3000, () => console.log("✅ Assistant is running on port 3000"));

