import { generateCodeAnalysis } from "../services/aiAnalyzer.service.js";

const LANGUAGE_LABELS = {
  62: "Java",
  63: "JavaScript",
  71: "Python",
  74: "TypeScript",
};

const normalizeLanguage = (language) =>
  LANGUAGE_LABELS[Number(language)] || language || "Unknown";

export const analyzeCode = async (req, res) => {
  try {
    const {
      code,
      sourceCode,
      language,
      problemTitle,
      problemDescription,
    } = req.body;

    const submittedCode = code || sourceCode;

    if (!submittedCode || typeof submittedCode !== "string") {
      return res.status(400).json({ error: "code is required" });
    }

    const analysis = await generateCodeAnalysis({
      code: submittedCode,
      language: normalizeLanguage(language),
      problemTitle,
      problemDescription,
    });

    return res.status(200).json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error("AI Code Analysis Error:", error?.response?.data || error.message);
    return res.status(error.statusCode || 500).json({
      error: error.message || "Failed to analyze code",
    });
  }
};

export const getAiCodeReview = analyzeCode;
