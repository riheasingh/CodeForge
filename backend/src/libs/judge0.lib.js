import axios from "axios";
import crypto from "crypto";

const PISTON_API_URL = process.env.PISTON_API_URL || "http://localhost:2000";

const LANGUAGE_MAP = {
  PYTHON: { id: 71, runtime: "python", version: "3.10.0", name: "Python" },
  JAVA: { id: 62, runtime: "java", version: "15.0.2", name: "Java" },
  JAVASCRIPT: { id: 63, runtime: "javascript", version: "18.15.0", name: "JavaScript" },
  TYPESCRIPT: { id: 74, runtime: "typescript", version: "5.0.3", name: "TypeScript" },
};

const ID_TO_KEY = {
  71: "PYTHON",
  62: "JAVA",
  63: "JAVASCRIPT",
  74: "TYPESCRIPT",
};

const executionStore = new Map();

const resolveLanguageConfig = (languageOrId) => {
  if (typeof languageOrId === "number" || /^\d+$/.test(String(languageOrId))) {
    const key = ID_TO_KEY[Number(languageOrId)];
    return key ? LANGUAGE_MAP[key] : null;
  }
  const key = String(languageOrId || "").toUpperCase();
  return LANGUAGE_MAP[key] || null;
};

const formatAxiosError = (error) => {
  if (error?.response) {
    return `Piston request failed with status ${error.response.status}: ${JSON.stringify(error.response.data)}`;
  }
  return `Piston request failed: ${error?.message || "Unknown error"}`;
};

/**
 * Piston always saves Java as Main.java, so the public top-level class must be Main.
 * Many snippets use LeetCode-style "Solution", which fails to compile with that filename.
 */
function normalizeJavaForPiston(source_code) {
  if (typeof source_code !== "string") return source_code;
  let code = source_code;
  code = code.replace(/\bpublic\s+class\s+Solution\b/g, "public class Main");
  code = code.replace(/\bclass\s+Solution\b/g, "public class Main");
  code = code.replace(/\bnew\s+Solution\s*\(/g, "new Main(");
  const lines = code.split("\n");
  const fixed = lines.map((line) => {
    const trimmed = line.trimStart();
    if (
      /^class\s+Main\b/.test(trimmed) &&
      !/^public\s+class\s+Main\b/.test(trimmed)
    ) {
      return line.replace(/\bclass\s+Main\b/, "public class Main");
    }
    return line;
  });
  return fixed.join("\n");
}

const runSingle = async ({ source_code, language_id, stdin }) => {
  const lang = resolveLanguageConfig(language_id);
  if (!lang) {
    return {
      stdout: null,
      stderr: null,
      compile_output: null,
      message: `Language ${language_id} is not supported`,
      time: null,
      memory: null,
      status: { id: 11, description: "Unsupported Language" },
    };
  }

  try {
    const fileNameByRuntime = {
      java: "Main.java",
      python: "main.py",
      javascript: "main.js",
      typescript: "main.ts",
    };

    const fileContent =
      lang.runtime === "java"
        ? normalizeJavaForPiston(source_code)
        : source_code;

    const response = await axios.post(`${PISTON_API_URL}/api/v2/execute`, {
      language: lang.runtime,
      version: lang.version,
      files: [
        {
          name: fileNameByRuntime[lang.runtime] || "main.txt",
          content: fileContent,
        },
      ],
      stdin: stdin ?? "",
    });

    const run = response?.data?.run || {};
    const compile = response?.data?.compile || {};
    const hasRuntimeError = Boolean(run.stderr);
    const hasCompileError = Boolean(compile.stderr || compile.output);
    const status = hasCompileError
      ? { id: 6, description: "Compilation Error" }
      : hasRuntimeError
        ? { id: 11, description: "Runtime Error" }
        : { id: 3, description: "Accepted" };

    return {
      stdout: run.stdout ?? null,
      stderr: run.stderr ?? null,
      compile_output: compile.stderr || compile.output || null,
      message: run.message || null,
      time: null,
      memory: null,
      status,
    };
  } catch (error) {
    return {
      stdout: null,
      stderr: null,
      compile_output: null,
      message: formatAxiosError(error),
      time: null,
      memory: null,
      status: { id: 13, description: "Internal Error" },
    };
  }
};

export const getJudge0LanguageId = (language) => {
  const lang = resolveLanguageConfig(language);
  return lang?.id;
};

export const submitBatch = async (submissions) => {
  const results = await Promise.all(submissions.map(runSingle));
  return results.map((result) => {
    const token = crypto.randomUUID();
    executionStore.set(token, result);
    return { token };
  });
};

export const pollBatchResults = async (tokens) => {
  const results = tokens.map((token) => {
    const result = executionStore.get(token);
    if (!result) {
      return {
        stdout: null,
        stderr: null,
        compile_output: null,
        message: "Execution result not found",
        time: null,
        memory: null,
        status: { id: 13, description: "Internal Error" },
      };
    }
    return { ...result, token };
  });
  return results;
};

export function getLanguageName(languageId) {
  return resolveLanguageConfig(languageId)?.name || "Unknown";
}