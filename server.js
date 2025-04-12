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

  const userMessage = req.body.Body;
  const userNumber = req.body.From;

  // Predefined response: Checklist
  if (/checklist/i.test(userMessage)) {
    res.set("Content-Type", "text/xml");
    return res.send(`
      <Response>
        <Message>
          Starting your checklist... 🔧
1. Turn on grill
2. Check fridge temps
3. Restock sauces
4. Clean surfaces
Reply 'Done' after each step ✅
        </Message>
      </Response>
    `);
  }

  // Predefined response: Maintenance
  if (/fryer|broken|repair/i.test(userMessage)) {
    res.set("Content-Type", "text/xml");
    return res.send(`
      <Response>
        <Message>
Thanks! Logging your maintenance issue: "${userMessage}". 🛠️
The manager will be notified.
        </Message>
      </Response>
    `);
  }

  // Default: AI-powered GPT response
  try {
    const aiReply = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: userMessage }],
    });

    const replyText = aiReply.choices[0].message.content;

    res.set("Content-Type", "text/xml");
    return res.send(`
      <Response>
        <Message>${replyText}</Message>
      </Response>
    `);
  } catch (error) {
    console.error("❌ GPT Error:", error);
    res.set("Content-Type", "text/xml");
    return res.send(`
      <Response>
        <Message>
Sorry! I couldn't process that right now. Please try again later.
        </Message>
      </Response>
    `);
  }
});

app.listen(3000, () => console.log("✅ Assistant is running on port 3000"));

