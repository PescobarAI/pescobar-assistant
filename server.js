import express from "express";
import bodyParser from "body-parser";
import { OpenAI } from "openai";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(bodyParser.urlencoded({ extended: false }));

app.post("/webhook", async (req, res) => {
  const userMessage = req.body.Body?.toLowerCase() || "";
  const now = new Date().toLocaleString("en-UK", { timeZone: "Europe/London" });

  res.set("Content-Type", "text/xml");

  // 1. Onboarding new staff
  if (userMessage.includes("start onboarding")) {
    return res.send(`
      <Response>
        <Message>
Welcome to Pescobar! 🧾 Let's get you set up:
1. Please upload your right to work docs.
2. Here’s your employee handbook: [link]
3. You'll receive your contract next for signing.
4. Manager will complete your handover today. ✅
        </Message>
      </Response>
    `);
  }

  // 2. Cleaning Checklist
  if (userMessage.includes("cleaning checklist")) {
    return res.send(`
      <Response>
        <Message>
🧽 Cleaning Checklist:
1. Sweep the floor  
2. Sanitize tables  
3. Clean kitchen surfaces  
4. Empty bins  
Reply "done" once complete!
        </Message>
      </Response>
    `);
  }

  // 3. Forecast
  if (userMessage.includes("forecast")) {
    const footfall = Math.floor(Math.random() * 101) + 100; // 100–200
    const avgSpend = (5 + Math.random() * 10).toFixed(2);   // £5–£15
    const revenue = (footfall * avgSpend).toFixed(2);

    return res.send(`
      <Response>
        <Message>
📊 Daily Forecast:
- Estimated customers: ${footfall}
- Avg spend: £${avgSpend}
- Projected revenue: £${revenue}
        </Message>
      </Response>
    `);
  }

  // 4. Clock In / Clock Out
  if (userMessage.includes("clock in")) {
    return res.send(`
      <Response>
        <Message>✅ Clock-in recorded at ${now}</Message>
      </Response>
    `);
  }

  if (userMessage.includes("clock out")) {
    return res.send(`
      <Response>
        <Message>🕓 Clock-out recorded at ${now}</Message>
      </Response>
    `);
  }

  // 5. Default GPT fallback
  try {
    const aiReply = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: userMessage }],
    });

    const replyText = aiReply.choices[0].message.content || "I'm not sure how to help with that.";

    return res.send(`
      <Response>
        <Message>${replyText}</Message>
      </Response>
    `);
  } catch (err) {
    console.error("GPT error:", err);
    return res.send(`
      <Response>
        <Message>Sorry, I’m having trouble right now. Please try again shortly.</Message>
      </Response>
    `);
  }
});

app.listen(3000, () => console.log("✅ Assistant is running on port 3000"));
