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

function resetSession(userId) {
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

app.post("/webhook", async (req, res) => {
  const userMessage = req.body.Body?.trim() || "";
  const userId = req.body.From;
  const now = new Date();
  const session = getSession(userId);

  res.set("Content-Type", "text/xml");

  // === SAFE WORD: RESET ===
  if (userMessage.toLowerCase() === "reset") {
    resetSession(userId);
    return respond("🔄 Session reset. We’re starting fresh! Say 'start onboarding' to begin again.");
  }

  // === ONBOARDING FLOW ===
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
    return respond(`✅ Great, ${session.name}. Your contract will be sent shortly. Your manager will complete your handover.\nLet me know if you need anything else.`);
  }

  // === CLOCKING (anytime) ===
  if (userMessage.toLowerCase() === "clock in") {
    session.clockInTime = now;
    return respond(`✅ Clock-in recorded at ${now.toLocaleTimeString()}, ${session.name || "team member"}.`);
  }

  if (userMessage.toLowerCase() === "clock out") {
    if (!session.clockInTime) return respond("⚠️ You haven't clocked in yet.");

    const workedMs = now - session.clockInTime;
    const workedHours = (workedMs / 1000 / 60 / 60).toFixed(2);
    const pay = (workedHours * session.salary).toFixed(2);
    session.clockInTime = null;

    return respond(`🕓 Great work today, ${session.name || "team member"}!  
You worked ${workedHours} hours.  
💷 Estimated pay: £${pay}`);
  }

  // === CLEANING MODE ===
  if (userMessage.toLowerCase().includes("clean")) {
    session.cleaningMode = true;
    return respond("🧽 Cleaning checklist started.\nTell me what you're doing. I’ll keep track and support you.\nType 'done' when finished.");
  }

  if (session.cleaningMode) {
    if (userMessage.toLowerCase() === "done") {
      session.cleaningMode = false;
      return respond(`✅ All done, ${session.name || "chef"}! Nice job keeping things spotless.`);
    }

    const reply = await askGPT(`A cleaner said: "${userMessage}". Help them progress or encourage them.`);
    return respond(reply);
  }

  // === FORECAST FLOW ===
  if (
    userMessage.toLowerCase().includes("make a forecast") ||
    userMessage.toLowerCase().includes("can you help me with a forecast") ||
    userMessage.toLowerCase().includes("i want to forecast")
  ) {
    session.forecastMode = true;
    session.forecastData = [];
    return respond("📊 Sure! Let’s build a 3-day forecast.\nTell me about Day 1: number of customers, average spend, and total sales.");
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
          return respond(`✅ Got Day ${day}.\nTell me about Day ${day + 1}.`);
        } else {
          session.forecastMode = false;
          let summary = `📈 3-Day Forecast Summary:\n`;
          session.forecastData.forEach((day, i) => {
            const projected = (day.customers * day.avgSpend).toFixed(2);
            summary += `Day ${i + 1}: Projected £${projected}, Reported £${day.sales}\n`;
          });
          return respond(summary);
        }
      } catch {
        return respond("⚠️ Couldn’t understand. Please include customers, average spend, and sales.");
      }
    }
  }

  // === MAINTENANCE TRIGGERS ===
  if (
    userMessage.toLowerCase().includes("broken") ||
    userMessage.toLowerCase().includes("not working") ||
    userMessage.toLowerCase().includes("stopped working")
  ) {
    const gpt = await askGPT(`This is a maintenance issue: "${userMessage}". Write a reply confirming the problem was logged and will be handled.`);
    return respond(`🛠️ ${gpt}`);
  }

  // === DEFAULT GPT CATCH-ALL ===
  const fallback = await askGPT(userMessage);
  return respond(fallback);

  // === HELPERS ===
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
      return "⚠️ I'm having trouble responding right now. Try again soon.";
    }
  }
});

app.listen(3000, () => console.log("✅ Assistant is running on port 3000"));
