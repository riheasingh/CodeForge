import axios from "axios";
import { db } from "../libs/db.js";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const LANGUAGE_LABELS = {
  62: "Java",
  63: "JavaScript",
  71: "Python",
  74: "TypeScript",
};

const buildTestcasePerformanceSummary = (testCases = []) => {
  const passed = testCases.filter((tc) => tc.passed).length;
  const total = testCases.length;
  const failed = total - passed;
  const failedDetails = testCases
    .filter((tc) => !tc.passed)
    .slice(0, 5)
    .map((tc) => ({
      testCase: tc.testCase,
      expected: tc.expected,
      actual: tc.stdout,
      stderr: tc.stderr,
      status: tc.status,
    }));

  return { total, passed, failed, failedDetails };
};

const extractJson = (content) => {
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
};

export const getAiCodeReview = async (req, res) => {
  try {
    const { sourceCode, language, status, testCases, problemId, stdin, expectedOutputs } = req.body;

    if (!sourceCode || typeof sourceCode !== "string") {
      return res.status(400).json({ error: "sourceCode is required for AI review" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        error: "OPENAI_API_KEY is missing. Add it in backend/.env to enable dynamic AI review.",
      });
    }

    const languageLabel = LANGUAGE_LABELS[Number(language)] || language || "Unknown";
    const problem = problemId
      ? await db.problem.findUnique({
          where: { id: problemId },
          select: {
            title: true,
            description: true,
            constraints: true,
            difficulty: true,
            tags: true,
          },
        })
      : null;

    const performance = buildTestcasePerformanceSummary(testCases || []);

    const systemPrompt = `
You are an expert coding interviewer and reviewer.
You MUST give problem-specific and code-specific analysis.
Do NOT give generic repeated feedback.
If code is optimal, explicitly say it is optimal.
If code has a bug, explain the exact bug and where/why it fails.
If brute force is used, explain a better approach with reason.

Return STRICT JSON only with this schema:
{
  "correctnessAnalysis": "string",
  "timeComplexity": "string",
  "spaceComplexity": "string",
  "optimizationSuggestions": ["string"],
  "codeQualityReview": ["string"],
  "interviewFeedback": ["string"],
  "isOptimal": boolean,
  "bugAnalysis": "string"
}
`;

    const userPrompt = {
      problem: {
        title: problem?.title || "Unknown problem",
        statement: problem?.description || "Not provided",
        constraints: problem?.constraints || "Not provided",
        difficulty: problem?.difficulty || "Unknown",
        tags: problem?.tags || [],
      },
      submission: {
        language: languageLabel,
        status: status || "Unknown",
        sourceCode,
      },
      testcasePerformance: performance,
      testcaseInputs: Array.isArray(stdin) ? stdin.slice(0, 10) : [],
      expectedOutputs: Array.isArray(expectedOutputs) ? expectedOutputs.slice(0, 10) : [],
    };

    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: MODEL,
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt.trim() },
          { role: "user", content: JSON.stringify(userPrompt) },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const content = response?.data?.choices?.[0]?.message?.content;
    const parsed = extractJson(content);

    if (!parsed) {
      return res.status(502).json({
        error: "AI returned an invalid format. Please retry.",
      });
    }

    return res.status(200).json({
      success: true,
      review: {
        language: languageLabel,
        ...parsed,
      },
    });
  } catch (error) {
    console.error("AI Review Error:", error?.response?.data || error.message);
    return res.status(500).json({
      error: "Failed to generate AI review",
      details: error?.response?.data || error.message,
    });
  }
};
