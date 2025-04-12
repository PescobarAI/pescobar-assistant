import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { OpenAI } from "openai";

dotenv.config();

const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
app.use(bodyParser.urlencoded({ extended: false }));

// In-memory data (simulate session memory)
const sessions = {};

function getSession(userId) {
  if (!sessions[userId]) {
    sessions[userId] = {
      name: null,
      salary: 14.5,
      clockInTime: null,
      forecastData: [],
      onboardingStep: 0,
      forecastStep: 0,
      checklistMode: false,
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

  // 1. Conversational onboarding
  if (userMessage.toLowerCase() === "start onboarding") {
    session.onboardingStep = 1;
    return res.send(`
      <Response>
        <Message>👋 Welcome to Pescobar! Let's get you started.  
What is your full name?</Message>
      </Response>
    `);
  }

  if (session.onboardingStep === 1) {
    session.name = userMessage;
    session.onboardingStep = 2;
    return res.send(`
      <Response>
        <Message>Thanks ${session.name}!  
Your hourly wage is set at £14.50/hour.  
Please upload your right to work documents next. 📎</Message>
      </Response>
    `);
  }

  if (session.onboardingStep === 2) {
    session.onboardingStep = 3;
    return res.send(`
      <Response>
        <Message>📘 Here is your employee handbook: [link]  
Reply "done" when you've read it.</Message>
      </Response>
    `);
  }

  if (session.onboardingStep === 3 && userMessage.toLowerCase() === "done") {
    session.onboardingStep = 4;
    return res.send(`
      <Response>
        <Message>✅ Great. Your contract will be emailed to you shortly.  
Your manager will now complete your handover today.</Message>
      </Response>
    `);
  }

  // 2. Clock in
  if (userMessage.toLowerCase() === "clock in") {
    session.clockInTime = now;
    return res.send(`
      <Response>
        <Message>✅ Clock-in recorded at ${now.toLocaleTimeString()}.</Message>
      </Response>
    `);
  }

  // 3. Clock out
  if (userMessage.toLowerCase() === "clock out") {
    if (!session.clockInTime) {
      return res.send(`
        <Response>
          <Message>You haven't clocked in yet!</Message>
        </Response>
      `);
    }

    const workedMs = now - session.clockInTime;
    const workedHours = (workedMs / 1000 / 60 / 60).toFixed(2);
    const totalPay = (workedHours * session.salary).toFixed(2);

    session.clockInTime = null;

    return res.send(`
      <Response>
        <Message>🕓 You worked ${workedHours} hours.  
💷 Pay = £${totalPay} at £${session.salary}/hour.  
Good job today!</Message>
      </Response>
    `);
  }

  // 4. Cleaning checklist trigger
  if (userMessage.toLowerCase().includes("cleaning checklist")) {
    session.checklistMode = true;
    return res.send(`
      <Response>
        <Message>🧼 Cleaning Checklist Started:  
- Wipe tables  
- Empty bins  
- Sanitize kitchen  
- Sweep floor  
Reply with updates and I’ll assist!</Message>
      </Response>
    `);
  }

  // 5. GPT-enhanced cleaning assistant
  if (session.checklistMode) {
    try {
      const chat = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: `A team member said: "${userMessage}". Help track checklist progress or encourage them.` }],
      });

      const aiReply = chat.choices[0].message.content;

      return res.send(`
        <Response>
          <Message>${aiReply}</Message>
        </Response>
      `);
    } catch (e) {
      console.error("GPT error:", e);
      return res.send(`
        <Response>
          <Message>Error processing message. Try again later.</Message>
        </Response>
      `);
    }
  }

  // 6. Start forecast
  if (userMessage.toLowerCase().includes("make forecast")) {
    session.forecastData = [];
    session.forecastStep = 1;
    return res.send(`
      <Response>
        <Message>📊 Forecast — Day 1:  
How many customers did you have?</Message>
      </Response>
    `);
  }

  // 7. Forecast step-by-step input
  if (session.forecastStep >= 1 && session.forecastStep <= 9) {
    const currentDay = Math.ceil(session.forecastStep / 3) - 1;
    const type = session.forecastStep % 3;

    if (!session.forecastData[currentDay]) {
      session.forecastData[currentDay] = {};
    }

    const input = parseFloat(userMessage);
    if (isNaN(input)) {
      return res.send(`
        <Response>
          <Message>Please enter a number.</Message>
        </Response>
      `);
    }

    if (type === 1) session.forecastData[currentDay].customers = input;
    if (type === 2) session.forecastData[currentDay].avgSpend = input;
    if (type === 0) session.forecastData[currentDay].sales = input;

    session.forecastStep++;

    const prompts = [
      "How many customers did you have?",
      "What was the average spend?",
      "What was the total sales value?",
    ];

    if (session.forecastStep <= 9) {
      const stepPrompt = prompts[(session.forecastStep - 1) % 3];
      return res.send(`
        <Response>
          <Message>Day ${Math.ceil(session.forecastStep / 3)}: ${stepPrompt}</Message>
        </Response>
      `);
    } else {
      // All data received, generate forecast summary
      let summary = `📊 3-Day Forecast Summary:\n`;
      session.forecastData.forEach((day, i) => {
        const proj = (day.customers * day.avgSpend).toFixed(2);
        summary += `Day ${i + 1} — Est. Revenue: £${proj}  
Reported: £${day.sales}  
\n`;
      });

      session.forecastStep = 0;
      return res.send(`<Response><Message>${summary}</Message></Response>`);
    }
  }

  // 8. GPT fallback
  try {
    const chat = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: userMessage }],
    });

    return res.send(`
      <Response>
        <Message>${chat.choices[0].message.content}</Message>
      </Response>
    `);
  } catch (err) {
    console.error("GPT error:", err);
    return res.send(`
      <Response>
        <Message>Sorry, I’m having trouble right now. Please try again soon.</Message>
      </Response>
    `);
  }
});

app.listen(3000, () => console.log("✅ Assistant is running on port 3000"));
