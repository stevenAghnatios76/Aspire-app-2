import { GoogleGenerativeAI } from "@google/generative-ai";

let _genAI: GoogleGenerativeAI | null = null;

function getGenAI() {
  if (!_genAI) {
    _genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
  }
  return _genAI;
}

export function getModel(modelName: string = "gemini-2.5-flash") {
  return getGenAI().getGenerativeModel({ model: modelName });
}

export const genAI = { get instance() { return getGenAI(); } };
