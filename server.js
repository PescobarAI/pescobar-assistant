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
      language: null, // 'en' or 'ro'
    };
  }
  return sessions[userId];
}

function detectLanguage(text) {
  const romanianTriggers = ["bună", "salut", "mulțumesc", "da", "nu", "vreau", "pot"];
  const lower = text.toLowerCase();
  return romanianTriggers.some(word => lower.includes(word)) ? "ro" : "en";
}

app.post("/webhook", async (req, res) => {
  const userMessage = req.body.Body?.trim() || "";
  const userId = req.body.From;
  const now = new Date();
  const session = getSession(userId);

  res.set("Content-Type", "text/xml");

  // 0. Language setting: greeting triggers
  if (["hi", "hello", "salut"].includes(userMessage.toLowerCase())) {
    session.language = null; // wait for user to reply
    return respond(`👋 Hello! / Bună!  
I’m your assistant. You can talk to me in English or Romanian.  
Sunt asistentul tău. Poți vorbi cu mine în engleză sau română.`);
  }

  // 1. If no language set, detect it from this message
  if (!session.language) {
    session.language = detectLanguage(userMessage);
  }

  const lang = session.language;

  // === SAFE WORD: RESET ===
  if (userMessage.toLowerCase() === "reset") {
    sessions[userId] = getSession(userId); // reset session
    return respond(lang === "ro"
      ? "🔄 Asistentul a fost resetat. Scrie „start onboarding” pentru a începe din nou."
      : "🔄 Assistant reset. Type 'start onboarding' to begin again.");
  }

  // === ONBOARDING FLOW ===
  if (userMessage.toLowerCase() === "start onboarding") {
    session.onboardingStep = 1;
    return respond(lang === "ro"
      ? "👋 Bun venit la Pescobar! Hai să începem. Care este numele tău complet?"
      : "👋 Welcome to Pescobar! Let's get you started. What is your full name?");
  }

  if (session.onboardingStep === 1) {
    session.name = userMessage;
    session.onboardingStep = 2;
    return respond(lang === "ro"
      ? `Mulțumim, ${session.name}! Salariul tău orar este £14.50.  
Te rog să trimiți documentele pentru dreptul de muncă. 📎`
      : `Thanks ${session.name}! Your hourly wage is £14.50.  
Please upload your right to work documents. 📎`);
  }

  if (session.onboardingStep === 2) {
    session.onboardingStep = 3;
    return respond(lang === "ro"
      ? "📘 Aici este manualul angajatului: [link]\nScrie 'done' când l-ai citit."
      : "📘 Here’s your employee handbook: [link]\nReply 'done' when you’ve read it.");
  }

  if (session.onboardingStep === 3 && userMessage.toLowerCase() === "done") {
    session.onboardingStep = 0;
    return respond(lang === "ro"
      ? `✅ Perfect, ${session.name}! Contractul tău va fi trimis și managerul va face instructajul.`
      : `✅ Great, ${session.name}! Your contract will be sent shortly and your manager will complete the handover.`);
  }

  // === CLOCK IN / OUT ===
  if (userMessage.toLowerCase() === "clock in") {
    session.clockInTime = now;
    return respond(lang === "ro"
      ? `⏱️ Pontaj înregistrat la ${now.toLocaleTimeString()}, ${session.name || "angajat"}!`
      : `⏱️ Clock-in recorded at ${now.toLocaleTimeString()}, ${session.name || "team member"}!`);
  }

  if (userMessage.toLowerCase() === "clock out") {
    if (!session.clockInTime) {
      return respond(lang === "ro"
        ? "⚠️ Nu te-ai pontat la începutul programului!"
        : "⚠️ You haven’t clocked in yet!");
    }

    const workedMs = now - session.clockInTime;
    const workedHours = (workedMs / 1000 / 60 / 60).toFixed(2);
    const pay = (workedHours * session.salary).toFixed(2);
    session.clockInTime = null;

    return respond(lang === "ro"
      ? `🕓 Felicitări, ${session.name || "angajat"}! Ai lucrat ${workedHours} ore.  
💷 Salariu estimat: £${pay}`
      : `🕓 Great job, ${session.name || "team member"}! You worked ${workedHours} hours.  
💷 Estimated pay: £${pay}`);
  }

  // === CLEANING MODE ===
  if (userMessage.toLowerCase().includes("clean") || userMessage.toLowerCase().includes("curăț")) {
    session.cleaningMode = true;
    return respond(lang === "ro"
      ? "🧽 Hai să facem curățenie. Spune-mi ce faci. Scrie 'done' când termini."
      : "🧽 Let’s clean! Tell me what you're doing. Type 'done' when you finish.");
  }

  if (session.cleaningMode) {
    if (userMessage.toLowerCase() === "done") {
      session.cleaningMode = false;
      return respond(lang === "ro"
        ? `✅ Super treabă, ${session.name || "coleg"}! Curățenia este completă.`
        : `✅ Nice job, ${session.name || "team member"}! Cleaning complete.`);
    }

    const prompt = lang === "ro"
      ? `Un angajat face curățenie și spune: "${userMessage}". Încurajează-l sau oferă-i ajutor.`
      : `A team member said: "${userMessage}" during cleaning. Respond helpfully or with encouragement.`;

    const reply = await askGPT(prompt);
    return respond(reply);
  }

  // === FORECAST FLOW ===
  if (userMessage.toLowerCase().includes("forecast") || userMessage.toLowerCase().includes("prognoz")) {
    session.forecastMode = true;
    session.forecastData = [];
    return respond(lang === "ro"
      ? "📊 Să facem o prognoză pe 3 zile. Spune-mi pentru Ziua 1: câți clienți, cheltuială medie și încasări?"
      : "📊 Let's make a 3-day forecast. Tell me about Day 1: number of customers, average spend, and sales.");
  }

  if (session.forecastMode) {
    try {
      const extract = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "Extract customer count, average spend, and sales value from the user's message. Return as JSON: customers, avgSpend, sales.",
          },
          { role: "user", content: userMessage },
        ],
        response_format: "json",
      });

      const parsed = JSON.parse(extract.choices[0].message.content);
      session.forecastData.push(parsed);

      const day = session.forecastData.length;
      if (day < 3) {
        return respond(lang === "ro"
          ? `✅ Ziua ${day} înregistrată. Acum Ziua ${day + 1}?`
          : `✅ Got Day ${day}. Now tell me about Day ${day + 1}.`);
      } else {
        session.forecastMode = false;
        let summary = lang === "ro" ? "📈 Prognoză pe 3 zile:\n" : "📈 3-Day Forecast:\n";
        session.forecastData.forEach((d, i) => {
          const proj = (d.customers * d.avgSpend).toFixed(2);
          summary += `Ziua ${i + 1}: Prognoză £${proj}, Încasări raportate: £${d.sales}\n`;
        });
        return respond(summary);
      }
    } catch {
      return respond(lang === "ro"
        ? "⚠️ Nu am putut înțelege. Include clienți, cheltuială medie și încasări."
        : "⚠️ Couldn't understand. Please include customers, avg spend, and sales.");
    }
  }

  // === MAINTENANCE TRIGGER ===
  if (
    userMessage.toLowerCase().includes("broken") ||
    userMessage.toLowerCase().includes("not working") ||
    userMessage.toLowerCase().includes("nu merge") ||
    userMessage.toLowerCase().includes("s-a stricat")
  ) {
    const prompt = lang === "ro"
      ? `Angajatul spune: "${userMessage}". Răspunde ca și cum ai înregistra o problemă de mentenanță.`
      : `User said: "${userMessage}". Reply as if logging a maintenance issue.`;
    const reply = await askGPT(prompt);
    return respond(`🛠️ ${reply}`);
  }

  // === DEFAULT GPT CATCH-ALL ===
  const fallback = await askGPT(userMessage, lang);
  return respond(fallback);

  // === HELPERS ===
  function respond(msg) {
    return res.send(`<Response><Message>${msg}</Message></Response>`);
  }

  async function askGPT(prompt, language = "en") {
    try {
      const messages = [
        { role: "system", content: language === "ro" ? "Răspunde în română." : "Reply in English." },
        { role: "user", content: prompt },
      ];

      const gpt = await openai.chat.completions.create({
        model: "gpt-4o",
        messages,
      });

      return gpt.choices[0].message.content;
    } catch (err) {
      console.error("GPT error:", err);
      return language === "ro"
        ? "⚠️ Momentan nu pot răspunde. Încearcă din nou."
        : "⚠️ I'm having trouble responding. Please try again.";
    }
  }
});

app.listen(3000, () => console.log("✅ Assistant running (EN/RO)"));
