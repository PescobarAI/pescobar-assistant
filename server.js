import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { OpenAI } from "openai";

dotenv.config();

const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
app.use(bodyParser.urlencoded({ extended: false }));

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

  // ====== ONBOARDING FLOW ======
  if (userMessage.toLowerCase() === "start onboarding") {
    session.onboardingStep = 1;
    return respond("👋 Welcome to Pescobar! Let's get you started.\nWhat is your full name?");
  }

  if (session.onboardingStep === 1) {
    session.name = userMessage;
    session.onboardingStep = 2;
    return respond(`Thanks ${session.name}! Your hourly wage is set at £14.50/hour.\nPlease upload your right to work documents. 📎`);
  }

  if (session.onboardingStep === 2) {
    session.onboardingStep = 3;
    return respond("📘 Here’s your employee handbook: [link]\nReply 'done' once you’ve read it.");
  }

  if (session.onboardingStep === 3 && userMessage.toLowerCase() === "done") {
    session.onboardingStep = 0;
    return respond("✅ Awesome. Your contract will be sent shortly. Your manager will now complete your handover.\nLet me know if you need anything else!");
  }

  // ====== CLOCK IN/OUT (Available Anytime) ======
  if (userMessage.toLowerCase() === "clock in") {
    session.clockInTime = now;
    return respond(`✅ Clock-in recorded at ${now.toLocaleTimeString()}.`);
  }

  if (userMessage.toLowerCase() === "clock out") {
    if (!session.clockInTime) return respond("⚠️ You haven't clocked in yet.");

    const workedMs = now - session.clockInTime;
    const workedHours = (workedMs / 1000 / 60 / 60).toFixed(2);
    const pay = (workedHours * session.salary).toFixed(2);
    session.clockInTime = null;

    return respond(`🕓 You worked ${workedHours} hours.\n💷 Estimated pay: £${pay}`);
  }

  // ====== CLEANING MODE (GPT interpreted) ======
  if (userMessage.toLowerCase().includes("clean")) {
    session.cleaningMode = true;
    return respond("🧼 Cleaning checklist started. Let me know what you've done — I'll track and respond. Type 'done' when finished.");
  }

  if (session.cleaningMode) {
    if (userMessage.toLowerCase() === "done") {
      session.cleaningMode = false;
      return respond("✅ Cleaning session completed. Great job!");
    }

    const gptReply = await askGPT(`User said: "${userMessage}". They're doing cleaning. Reply in an encouraging or helpful way.`);
    return respond(gptReply);
  }

  // ====== FORECAST FLOW (Natural Language) ======
  if (
    userMessage.toLowerCase().includes("make a forecast") ||
    userMessage.toLowerCase().includes("can you help me with a forecast") ||
    userMessage.toLowerCase().includes("i want to forecast")
  ) {
    session.forecastMode = true;
    session.forecastData = [];
    return respond("📊 Great! Please tell me the number of customers, average spend, and sales for Day 1.");
  }

  if (session.forecastMode) {
    if (session.forecastData.length < 3) {
      try {
        const extract = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content:
                "Extract customer count, average spend, and sales value from the user's message. Return as JSON with keys: customers, avgSpend, sales.",
            },
            { role: "user", content: userMessage },
          ],
          response_format: "json",
        });

        const parsed = JSON.parse(extract.choices[0].message.content);
        session.forecastData.push(parsed);

        const day = session.forecastData.length;
        if (day < 3) {
          return respond(`✅ Got Day ${day}.\nNow, tell me about Day ${day + 1}.`);
        } else {
          session.forecastMode = false;
          let summary = `📈 3-Day Forecast:\n`;
          session.forecastData.forEach((day, i) => {
            const projected = (day.customers * day.avgSpend).toFixed(2);
            summary += `Day ${i + 1}: Projected £${projected}, Reported £${day.sales}\n`;
          });
          return respond(summary);
        }
      } catch (err) {
        return respond("⚠️ Sorry, I couldn’t read that. Please include number of customers, avg spend, and sales value.");
      }
    }
  }

  // ====== MAINTENANCE REQUESTS ======
  if (
    userMessage.toLowerCase().includes("broken") ||
    userMessage.toLowerCase().includes("not working") ||
    userMessage.toLowerCase().includes("stopped working")
  ) {
    const gpt = await askGPT(`The user said: "${userMessage}". Turn this into a maintenance log reply confirming the issue is recorded and forwarded.`);
    return respond(`🛠️ ${gpt}`);
  }

  // ====== DEFAULT CATCH-ALL GPT RESPONSE ======
  const fallback = await askGPT(userMessage);
  return respond(fallback);

  // === Internal reply function ===
  function respond(message) {
    return res.send(`<Response><Message>${message}</Message></Response>`);
  }

  async function askGPT(prompt) {
    try {
      const gpt = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
      });
      return gpt.choices[0].message.content;
    } catch (err) {
      console.error("GPT error:", err);
      return "⚠️ I couldn’t generate a reply just now. Try again soon.";
    }
  }
});

app.listen(3000, () => console.log("✅ Assistant is live on port 3000"));
