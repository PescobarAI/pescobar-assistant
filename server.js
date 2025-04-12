// server.js
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
      email: null,
      salary: 14.5,
      clockInTime: null,
      onboardingStep: 0,
      forecastMode: false,
      forecastData: [],
      checklistMode: null,
      checklistProgress: 0,
    };
  }
  return sessions[userId];
}

const checklists = {
  "kitchen checklist": [
    "Check fridge/freezer temperature",
    "Clean all worktops and cutting boards",
    "Refill soap/sanitiser at sinks",
    "Inspect food storage areas",
    "Sweep and mop floor"
  ],
  "sitting area checklist": [
    "Wipe tables and chairs",
    "Check and refill napkins & condiments",
    "Sweep floor and vacuum if needed",
    "Empty rubbish bins",
    "Clean customer touchpoints (door handles, etc.)"
  ],
  "equipment checklist": [
    "Test fryer and grill for proper heating",
    "Check fridge and freezer seals",
    "Ensure extractor fan is functioning",
    "Inspect small appliances (blender, mixer)",
    "Note anything due for maintenance"
  ]
};

app.post("/webhook", async (req, res) => {
  const userMessage = req.body.Body?.trim() || "";
  const userId = req.body.From;
  const now = new Date();
  const session = getSession(userId);

  res.set("Content-Type", "text/xml");

  function respond(msg) {
    return res.send(`<Response><Message>${msg}</Message></Response>`);
  }

  // RESET
  if (userMessage.toLowerCase() === "reset") {
    sessions[userId] = getSession(userId);
    return respond("🔄 Session reset. Type 'start onboarding' to begin again.");
  }

  // ONBOARDING
  if (userMessage.toLowerCase() === "start onboarding") {
    session.onboardingStep = 1;
    return respond("👋 Welcome to Pescobar! Let's get started. What's your full name?");
  }

  if (session.onboardingStep === 1) {
    session.name = userMessage;
    session.onboardingStep = 2;
    return respond(`Nice to meet you, ${session.name}! What's your email address?`);
  }

  if (session.onboardingStep === 2) {
    session.email = userMessage;
    session.onboardingStep = 3;
    return respond(`📎 Please upload your right to work documents. Then reply 'done'.`);
  }

  if (session.onboardingStep === 3 && userMessage.toLowerCase() === "done") {
    session.onboardingStep = 4;
    return respond(`📘 Here's your employee handbook: [link]. Reply 'done' once you've reviewed it.`);
  }

  if (session.onboardingStep === 4 && userMessage.toLowerCase() === "done") {
    session.onboardingStep = 0;
    return respond(`✅ All set, ${session.name}! Your contract will be sent to ${session.email}. Let me know if you need anything else.`);
  }

  // CLOCK IN/OUT
  if (userMessage.toLowerCase() === "clock in") {
    session.clockInTime = now;
    return respond(`✅ Clock-in recorded at ${now.toLocaleTimeString()}, ${session.name || "team member"}.`);
  }

  if (userMessage.toLowerCase() === "clock out") {
    if (!session.clockInTime) return respond("⚠️ You haven't clocked in yet.");
    const hoursWorked = ((now - session.clockInTime) / 1000 / 60 / 60).toFixed(2);
    const pay = (hoursWorked * session.salary).toFixed(2);
    session.clockInTime = null;
    return respond(`🕓 Great work today, ${session.name || "team member"}! You worked ${hoursWorked} hours.
💷 Estimated pay: £${pay}`);
  }

  // START CHECKLISTS
  const checklistName = Object.keys(checklists).find(name => userMessage.toLowerCase().includes(`start ${name}`));
  if (checklistName) {
    session.checklistMode = checklistName;
    session.checklistProgress = 0;
    return respond(`✅ Starting ${checklistName}...
Task 1: ${checklists[checklistName][0]}`);
  }

  // CHECKLIST STEP
  if (session.checklistMode) {
    if (userMessage.toLowerCase() === "done") {
      const currentList = checklists[session.checklistMode];
      session.checklistProgress++;
      if (session.checklistProgress < currentList.length) {
        return respond(`Next task: ${currentList[session.checklistProgress]}`);
      } else {
        session.checklistMode = null;
        return respond("✅ Checklist complete. Well done!");
      }
    } else {
      const feedback = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: `Checklist update: ${userMessage}` }],
      });
      return respond(feedback.choices[0].message.content);
    }
  }

  // FORECAST
  if (userMessage.toLowerCase().includes("forecast")) {
    session.forecastMode = true;
    session.forecastData = [];
    return respond("📊 Let's begin your 3-day forecast. Please give me data for Day 1 (customers, avg spend, sales)");
  }

  if (session.forecastMode) {
    try {
      const extract = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "Extract customers, avgSpend, and sales as JSON."
          },
          { role: "user", content: userMessage }
        ],
        response_format: "json"
      });
      const data = JSON.parse(extract.choices[0].message.content);
      session.forecastData.push(data);
      const nextDay = session.forecastData.length + 1;
      if (session.forecastData.length < 3) {
        return respond(`✅ Got it! Now give me Day ${nextDay}'s data.`);
      } else {
        session.forecastMode = false;
        const summary = session.forecastData.map((d, i) => {
          const proj = (d.customers * d.avgSpend).toFixed(2);
          return `Day ${i + 1}: Projected £${proj}, Reported: £${d.sales}`;
        }).join("\n");
        return respond(`📈 Forecast Summary:\n${summary}`);
      }
    } catch (err) {
      return respond("⚠️ Couldn't understand. Please try again with customers, avg spend, and sales.");
    }
  }

  // DEFAULT GPT
  const reply = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: userMessage }],
  });
  return respond(reply.choices[0].message.content);
});

app.listen(3000, () => console.log("✅ Assistant running on port 3000"));