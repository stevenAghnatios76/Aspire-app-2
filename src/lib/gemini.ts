import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export function getModel(modelName: string = "gemini-1.5-flash") {
  return genAI.getGenerativeModel({ model: modelName });
}

export { genAI };
