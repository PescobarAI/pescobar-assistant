import express from "express";
import bodyParser from "body-parser";
import { OpenAI } from "openai";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post("/webhook", async (req, res) => {
  console.log("✅ Webhook was hit!");
  const userMessage = req.body.Body;
  const userNumber = req.body.From;

  if (/checklist/i.test(userMessage)) {
    return res.send(`<Response><Message>Starting your checklist... \n1. Turn on grill\n2. Check fridge temp\nReply 'Done' after each step.</Message></Response>`);
  }

  if (/fryer|broken|repair/i.test(userMessage)) {
    return res.send(`<Response><Message>Thanks! Logging your maintenance issue: "${userMessage}". A manager will be notified.</Message></Response>`);
  }

  const aiReply = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: userMessage }],
  });

  const replyText = aiReply.choices[0].message.content;
  res.send(`<Response><Message>${replyText}</Message></Response>`);
});

app.listen(3000, () => console.log("Webhook running on port 3000"));
