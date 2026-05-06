import axios from "axios";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

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

const normalizeAnalysis = (analysis) => ({
  timeComplexity: analysis?.timeComplexity || "Unable to determine.",
  spaceComplexity: analysis?.spaceComplexity || "Unable to determine.",
  optimization:
    analysis?.optimization || "The solution is already well optimized.",
});

export const generateCodeAnalysis = async ({
  code,
  language,
  problemTitle,
  problemDescription,
}) => {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("OPENAI_API_KEY is missing.");
    error.statusCode = 503;
    throw error;
  }

  const systemPrompt = `
You are a concise competitive programming code analyzer.
Analyze only algorithmic complexity and optimization opportunities.
Support Java, C++, Python, and JavaScript.

Rules:
- Return STRICT JSON only.
- Do not use markdown.
- Keep each value short and useful.
- Estimate complexity from the submitted code and problem context.
- Suggest a better approach only when there is a genuinely better algorithm.
- If the solution is already optimal or no clear improvement is justified, set optimization exactly to:
"The solution is already well optimized."

JSON schema:
{
  "timeComplexity": "string",
  "spaceComplexity": "string",
  "optimization": "string"
}
`;

  const userPrompt = {
    language: language || "Unknown",
    problemTitle: problemTitle || "Not provided",
    problemDescription: problemDescription || "Not provided",
    code,
  };

  const response = await axios.post(
    OPENAI_API_URL,
    {
      model: MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
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
      timeout: 30000,
    }
  );

  const content = response?.data?.choices?.[0]?.message?.content;
  const parsed = extractJson(content);

  if (!parsed) {
    const error = new Error("AI returned an invalid analysis format.");
    error.statusCode = 502;
    throw error;
  }

  return normalizeAnalysis(parsed);
};
