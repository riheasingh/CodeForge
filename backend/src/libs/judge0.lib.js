import axios from "axios";
import crypto from "crypto";

const PISTON_API_URL = process.env.PISTON_API_URL || "http://localhost:2000";

const readPositiveNumberEnv = (keys, fallback) => {
  for (const key of keys) {
    const value = Number(process.env[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return fallback;
};

const readOptionalPositiveNumberEnv = (keys) => {
  for (const key of keys) {
    const value = Number(process.env[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return undefined;
};

const parseJsonEnv = (key, fallback) => {
  const raw = process.env[key];
  if (!raw) return fallback;

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`[execution] Ignoring invalid ${key}: ${error.message}`);
    return fallback;
  }
};

const PISTON_DEFAULT_LIMITS = {
  run_timeout: readPositiveNumberEnv(
    ["PISTON_RUN_TIMEOUT_MS", "PISTON_RUN_TIMEOUT"],
    8000
  ),
  compile_timeout: readPositiveNumberEnv(
    ["PISTON_COMPILE_TIMEOUT_MS", "PISTON_COMPILE_TIMEOUT"],
    15000
  ),
};

const PISTON_DEFAULT_CPU_LIMITS = {
  run_cpu_time: readOptionalPositiveNumberEnv([
    "PISTON_RUN_CPU_TIME_MS",
    "PISTON_RUN_CPU_TIME",
  ]),
  compile_cpu_time: readOptionalPositiveNumberEnv([
    "PISTON_COMPILE_CPU_TIME_MS",
    "PISTON_COMPILE_CPU_TIME",
  ]),
};

const PISTON_LIMIT_OVERRIDES = parseJsonEnv("PISTON_LIMIT_OVERRIDES", {});
const PISTON_BATCH_CONCURRENCY = readPositiveNumberEnv(
  ["PISTON_BATCH_CONCURRENCY"],
  4
);
const PISTON_JAVA_BATCH_CONCURRENCY = readPositiveNumberEnv(
  ["PISTON_JAVA_BATCH_CONCURRENCY"],
  1
);
const EXECUTION_DEBUG =
  String(process.env.EXECUTION_DEBUG || "").toLowerCase() === "true" ||
  process.env.EXECUTION_DEBUG === "1";

const debugExecution = (event, details = {}) => {
  if (EXECUTION_DEBUG) {
    console.log(`[execution:${event}]`, details);
  }
};

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
  if (error?.code) {
    return `Piston request failed (${error.code}): ${error.message || "Unknown error"}`;
  }
  return `Piston request failed: ${error?.message || "Unknown error"}`;
};

const normalizeLimitValue = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
};

const getPistonLimits = (lang) => {
  const override =
    PISTON_LIMIT_OVERRIDES?.[`${lang.runtime}-${lang.version}`] ||
    PISTON_LIMIT_OVERRIDES?.[lang.runtime] ||
    {};

  const limits = { ...PISTON_DEFAULT_LIMITS };

  for (const key of ["run_cpu_time", "compile_cpu_time"]) {
    const value = PISTON_DEFAULT_CPU_LIMITS[key];
    if (value) limits[key] = value;
  }

  for (const key of [
    "run_timeout",
    "compile_timeout",
    "run_cpu_time",
    "compile_cpu_time",
  ]) {
    const value = normalizeLimitValue(override[key]);
    if (value) limits[key] = value;
  }

  return limits;
};

const hasTimedOut = (stage = {}) => {
  const message = String(stage.message || "").toLowerCase();
  return (
    stage.status === "TO" ||
    message.includes("time limit") ||
    message.includes("timed out")
  );
};

const hasMemoryExceeded = (stage = {}) => {
  const message = String(stage.message || "").toLowerCase();
  return message.includes("memory");
};

const stageFailed = (stage = {}) =>
  Boolean(stage.status) ||
  Boolean(stage.signal) ||
  (typeof stage.code === "number" && stage.code !== 0);

const stageSummary = (stage = {}) => ({
  status: stage.status ?? null,
  code: stage.code ?? null,
  signal: stage.signal ?? null,
  message: stage.message ?? null,
  stdoutLength: stage.stdout?.length || 0,
  stderrLength: stage.stderr?.length || 0,
  wall_time: stage.wall_time ?? null,
  cpu_time: stage.cpu_time ?? null,
  memory: stage.memory ?? null,
});

const hasJavaCompileErrorInRun = (run = {}) => {
  const stderr = String(run.stderr || "");
  return (
    stderr.includes("error: compilation failed") ||
    /(^|\n).+\.java(?:\.java)?:\d+:\s+error:/m.test(stderr)
  );
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

const runSingle = async ({ source_code, language_id, stdin, testCase }) => {
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
    const startedAt = Date.now();
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

    const normalizedStdin = (() => {
      const input = stdin == null ? "" : String(stdin);
      if (!input) return "";
      return input.endsWith("\n") ? input : `${input}\n`;
    })();

    const limits = getPistonLimits(lang);
    const payload = {
      language: lang.runtime,
      version: lang.version,
      files: [
        {
          name: fileNameByRuntime[lang.runtime] || "main.txt",
          content: fileContent,
        },
      ],
      stdin: normalizedStdin,
      ...limits,
    };

    debugExecution("piston.request", {
      testCase,
      language: lang.name,
      runtime: lang.runtime,
      version: lang.version,
      sourceLength: fileContent?.length || 0,
      stdinLength: normalizedStdin.length,
      limits,
    });

    const response = await axios.post(
      `${PISTON_API_URL}/api/v2/execute`,
      payload,
      {
        timeout: limits.compile_timeout + limits.run_timeout + 5000,
      }
    );

    const run = response?.data?.run || {};
    const compile = response?.data?.compile || {};
    const compileTimedOut = hasTimedOut(compile);
    const runTimedOut = hasTimedOut(run);
    const runHasCompileError =
      lang.runtime === "java" && hasJavaCompileErrorInRun(run);
    const hasCompileError = stageFailed(compile) || runHasCompileError;
    const hasRuntimeError = stageFailed(run) || Boolean(run.stderr);
    const isTimeLimitExceeded = compileTimedOut || runTimedOut;
    const isMemoryLimitExceeded =
      hasMemoryExceeded(compile) || hasMemoryExceeded(run);

    const status = hasCompileError
      ? compileTimedOut
        ? { id: 5, description: "Time Limit Exceeded" }
        : { id: 6, description: "Compilation Error" }
      : isTimeLimitExceeded
        ? { id: 5, description: "Time Limit Exceeded" }
        : isMemoryLimitExceeded
          ? { id: 12, description: "Memory Limit Exceeded" }
          : hasRuntimeError
            ? { id: 11, description: "Runtime Error" }
            : { id: 3, description: "Accepted" };

    debugExecution("piston.response", {
      testCase,
      language: lang.name,
      durationMs: Date.now() - startedAt,
      status,
      compile: stageSummary(compile),
      run: stageSummary(run),
    });

    return {
      stdout: run.stdout ?? null,
      stderr: runHasCompileError ? null : run.stderr ?? null,
      compile_output:
        compile.stderr ||
        compile.output ||
        (runHasCompileError ? run.stderr : null),
      message: run.message || null,
      time:
        typeof run.wall_time === "number"
          ? (run.wall_time / 1000).toFixed(3)
          : null,
      memory:
        typeof run.memory === "number"
          ? Math.ceil(run.memory / 1024)
          : null,
      status,
    };
  } catch (error) {
    debugExecution("piston.error", {
      testCase,
      language: lang.name,
      message: formatAxiosError(error),
    });

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

const runWithConcurrency = async (items, concurrency, worker) => {
  const results = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await worker(items[currentIndex], currentIndex);
      }
    }
  );

  await Promise.all(workers);
  return results;
};

const getBatchConcurrency = (submissions) => {
  const lang = resolveLanguageConfig(submissions?.[0]?.language_id);
  return lang?.runtime === "java"
    ? PISTON_JAVA_BATCH_CONCURRENCY
    : PISTON_BATCH_CONCURRENCY;
};

export const submitBatch = async (submissions) => {
  const concurrency = getBatchConcurrency(submissions);
  debugExecution("batch.start", {
    size: submissions.length,
    concurrency,
    language: getLanguageName(submissions?.[0]?.language_id),
  });

  const results = await runWithConcurrency(
    submissions,
    concurrency,
    (submission, index) =>
      runSingle({ ...submission, testCase: submission.testCase || index + 1 })
  );

  debugExecution("batch.finish", {
    size: submissions.length,
    status: results.map((result) => result.status?.description),
  });

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
    executionStore.delete(token);
    return { ...result, token };
  });
  return results;
};

export function getLanguageName(languageId) {
  return resolveLanguageConfig(languageId)?.name || "Unknown";
}
