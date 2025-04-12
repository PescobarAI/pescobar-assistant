import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { OpenAI } from "openai";

dotenv.config();

const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
app.use(bodyParser.urlencoded({ extended: false }));

// In-memory session tracking
const sessions = {};

function getSession(userId) {
  if (!sessions[userId]) {
    sessions[userId] = {
      name: null,
      salary: 14.5,
      clockInTime: null,
      onboardingStep: 0,
      forecastMode: false,
      forecastData: [],
      cleaningMode: false,
    };
  }
  return sessions[userId];
}

app.post("/webhook", async (req, res) => {
  const userMessage = req.body.Body?.trim() || "";
  const userId = req.body.From;
  const now = new Date();
  const session = getSession(userId);

  res.set("Content-Type", "text/xml");

  // === ONBOARDING FLOW ===
  if (userMessage.toLowerCase() === "start onboarding") {
    session.onboardingStep = 1;
    return res.send(`<Response><Message>👋 Welcome to Pescobar! Let's get you started.  
What is your full name?</Message></Response>`);
  }

  if (session.onboardingStep === 1) {
    session.name = userMessage;
    session.onboardingStep = 2;
    return res.send(`<Response><Message>Thanks ${session.name}!  
Your hourly wage is set at £14.50/hour.  
Please upload your right to work documents next. 📎</Message></Response>`);
  }

  if (session.onboardingStep === 2) {
    session.onboardingStep = 3;
    return res.send(`<Response><Message>📘 Here is your employee handbook: [link]  
Reply "done" when you've read it.</Message></Response>`);
  }

  if (session.onboardingStep === 3 && userMessage.toLowerCase() === "done") {
    session.onboardingStep = 4;
    return res.send(`<Response><Message>✅ Great. Your contract will be emailed to you shortly.  
Your manager will now complete your handover today.</Message></Response>`);
  }

  // === CLOCKING ===
  if (userMessage.toLowerCase() === "clock in") {
    session.clockInTime = now;
    return res.send(`<Response><Message>✅ Clock-in recorded at ${now.toLocaleTimeString()}.</Message></Response>`);
  }

  if (userMessage.toLowerCase() === "clock out") {
    if (!session.clockInTime) {
      return res.send(`<Response><Message>You haven't clocked in yet!</Message></Response>`);
    }

    const workedMs = now - session.clockInTime;
    const workedHours = (workedMs / 1000 / 60 / 60).toFixed(2);
    const totalPay = (workedHours * session.salary).toFixed(2);
    session.clockInTime = null;

    return res.send(`<Response><Message>🕓 You worked ${workedHours} hours.  
💷 Pay = £${totalPay} at £${session.salary}/hour.  
Good job today!</Message></Response>`);
  }

  // === CLEANING CHECKLIST FLOW ===
  if (
    userMessage.toLowerCase().includes("clean") ||
    userMessage.toLowerCase().includes("start cleaning")
  ) {
    session.cleaningMode = true;
    return res.send(`<Response><Message>🧼 Cleaning started!  
Tell me what you've done or what's left.  
Type "done" when finished.</Message></Response>`);
  }

  if (session.cleaningMode) {
    if (userMessage.toLowerCase() === "done") {
      session.cleaningMode = false;
      return res.send(`<Response><Message>✅ Cleaning checklist closed. Great work!</Message></Response>`);
    }

    const gptResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: `Checklist update: ${userMessage}` }],
    });

    const reply = gptResponse.choices[0].message.content;
    return res.send(`<Response><Message>${reply}</Message></Response>`);
  }

  // === FORECAST FLOW (Open Language + GPT) ===
  if (
    userMessage.toLowerCase().includes("make a forecast") ||
    userMessage.toLowerCase().includes("help me with a forecast") ||
    userMessage.toLowerCase().includes("i would like to forecast")
  ) {
    session.forecastMode = true;
    session.forecastData = [];
    return res.send(`<Response><Message>📊 Great! Let's do a 3-day forecast.  
Please tell me how many customers you had, average spend, and sales value for **Day 1**.</Message></Response>`);
  }

  if (session.forecastMode) {
    if (session.forecastData.length < 3) {
      // Parse message via GPT to extract data
      const gpt = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "Extract 3 values from the message: customers, avgSpend, sales. Return as JSON.",
          },
          { role: "user", content: userMessage },
        ],
        response_format: "json",
      });

      try {
        const values = JSON.parse(gpt.choices[0].message.content);
        session.forecastData.push(values);
        const dayNumber = session.forecastData.length;

        if (dayNumber < 3) {
          return res.send(`<Response><Message>Got Day ${dayNumber}. Now give me Day ${dayNumber + 1} stats.</Message></Response>`);
        }

        // All 3 days collected → send summary
        session.forecastMode = false;
        let summary = `📈 3-Day Forecast Summary:\n`;

        session.forecastData.forEach((day, i) => {
          const projected = (day.customers * day.avgSpend).toFixed(2);
          summary += `Day ${i + 1} — Est. Revenue: £${projected}  
Reported Sales: £${day.sales}\n\n`;
        });

        return res.send(`<Response><Message>${summary}</Message></Response>`);
      } catch (e) {
        return res.send(`<Response><Message>❌ Sorry, I couldn't read that. Try again with customer count, avg spend, and sales value.</Message></Response>`);
      }
    }
  }

  // === DEFAULT GPT REPLY ===
  try {
    const aiReply = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: userMessage }],
    });

    return res.send(`<Response><Message>${aiReply.choices[0].message.content}</Message></Response>`);
  } catch (err) {
    console.error("GPT fallback error:", err);
    return res.send(`<Response><Message>Sorry, I'm having trouble responding. Try again soon.</Message></Response>`);
  }
});

app.listen(3000, () => console.log("✅ Assistant is running on port 3000"));

