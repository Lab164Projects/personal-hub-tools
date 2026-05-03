
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config({ path: '.env.local' });

const key = process.env.GEMINI_API_KEY?.split(',')[0];
if (!key) {
    console.error("No API key found");
    process.exit(1);
}

try {
    const genAI = new GoogleGenAI(key);
    console.log("Constructor OK with string");
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    console.log("getGenerativeModel OK");
} catch (e) {
    console.log("Standard way FAILED:", e.message);
}

try {
    const genAI = new GoogleGenAI({ apiKey: key } as any);
    console.log("Constructor OK with object");
    const model = (genAI as any).models.generateContent;
    if (model) console.log("ai.models.generateContent exists");
    else console.log("ai.models.generateContent MISSING");
} catch (e) {
    console.log("Object way FAILED:", e.message);
}
