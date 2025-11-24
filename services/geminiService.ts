import { GoogleGenAI, Type } from "@google/genai";

const getKey = () =>
  process.env.API_KEY || process.env.GEMINI_API_KEY || "";

export const extractBillDetails = async (base64Image: string) => {
  const apiKey = getKey();
  if (!apiKey) {
    return { customerName: "", address: "", invoiceNo: "", billDate: "" };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const cleanBase64 = base64Image.split(",")[1] || base64Image;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: cleanBase64,
            },
          },
          {
            text: `
Extract shop/customer name, full address, invoice number, and bill date.
Return date as YYYY-MM-DD.
If any value missing return empty string.
`,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            customerName: { type: Type.STRING },
            address: { type: Type.STRING },
            invoiceNo: { type: Type.STRING },
            billDate: { type: Type.STRING },
          },
        },
      },
    });

    let text = response.text;
    if (text) {
      text = text.replace(/^```json/, "").replace(/```$/, "");
      return JSON.parse(text);
    }

    throw new Error("missing output");
  } catch (err) {
    console.error("gemini error", err);
    return { customerName: "", address: "", invoiceNo: "", billDate: "" };
  }
};

export const sendGeminiChat = async (history, newMessage, context) => {
  const apiKey = getKey();
  if (!apiKey) return "Missing API Key.";

  try {
    const ai = new GoogleGenAI({ apiKey });

    const chat = ai.chats.create({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: `You are Grace AI. Keep replies short and helpful. Context: ${context}`,
      },
      history,
    });

    const result = await chat.sendMessage({ message: newMessage });
    return result.text || "no reply";
  } catch (e) {
    console.error(e);
    return "chat offline rn";
  }
};
