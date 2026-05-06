import crypto from "crypto";
import { db } from "../libs/db.js";
import {
  getLanguageName,
  pollBatchResults,
  submitBatch,
} from "../libs/judge0.lib.js";

export const executeCode = async (req, res) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const {
      source_code,
      language_id,
      stdin,
      expected_outputs,
      problemId,
      isSubmission = true,
    } =
      req.body;

    const userId = req.user.id;
    const languageName = getLanguageName(language_id);

    console.log(`[executeCode:${requestId}] received`, {
      userId,
      problemId,
      language_id,
      language: languageName,
      testCases: Array.isArray(stdin) ? stdin.length : 0,
      isSubmission,
    });

    // Validate test cases

    if (
      !Array.isArray(stdin) ||
      stdin.length === 0 ||
      !Array.isArray(expected_outputs) ||
      expected_outputs.length !== stdin.length
    ) {
      console.warn(`[executeCode:${requestId}] invalid test case payload`, {
        stdinIsArray: Array.isArray(stdin),
        stdinLength: Array.isArray(stdin) ? stdin.length : null,
        expectedOutputsIsArray: Array.isArray(expected_outputs),
        expectedOutputsLength: Array.isArray(expected_outputs)
          ? expected_outputs.length
          : null,
      });
      return res.status(400).json({ error: "Invalid or Missing test cases" });
    }

    // 2. Prepare each test cases for judge0 batch submission
    const submissions = stdin.map((input, index) => ({
      source_code,
      language_id,
      stdin: input,
      testCase: index + 1,
    }));

    // 3. Send batch of submissions to judge0
    const submitResponse = await submitBatch(submissions);

    const tokens = submitResponse.map((res) => res.token);

    // 4. Poll judge0 for results of all submitted test cases
    const results = await pollBatchResults(tokens);

    console.log(`[executeCode:${requestId}] execution results`, {
      tokens: tokens.length,
      statuses: results.map((result, index) => ({
        testCase: index + 1,
        status: result.status?.description,
        message: result.message,
        stdoutLength: result.stdout?.length || 0,
        stderrLength: result.stderr?.length || 0,
        compileOutputLength: result.compile_output?.length || 0,
        time: result.time,
        memory: result.memory,
      })),
    });

    // Analyze test case results and preserve real failure reason (TLE/RE/CE).
    let allPassed = true;
    let finalStatus = "Accepted";
    const detailedResults = results.map((result, i) => {
      const stdout = result.stdout?.trim();
      const expected_output = expected_outputs[i]?.trim();
      const executionSucceeded = result?.status?.id === 3;
      const passed = executionSucceeded && stdout === expected_output;

      if (!passed) {
        allPassed = false;
        if (finalStatus === "Accepted") {
          finalStatus =
            executionSucceeded
              ? "Wrong Answer"
              : result?.status?.description || "Runtime Error";
        }
      }

      return {
        testCase: i + 1,
        passed,
        stdout,
        expected: expected_output,
        stderr: result.stderr || null,
        compile_output: result.compile_output || null,
        status: result.status.description,
        memory: result.memory ? `${result.memory} KB` : undefined,
        time: result.time ? `${result.time} s` : undefined,
      };

      // console.log(`Testcase #${i+1}`);
      // console.log(`Input for testcase #${i+1}: ${stdin[i]}`)
      // console.log(`Expected Output for testcase #${i+1}: ${expected_output}`)
      // console.log(`Actual output for testcase #${i+1}: ${stdout}`)

      // console.log(`Matched testcase #${i+1}: ${passed}`)
    });

    console.log(`[executeCode:${requestId}] analyzed`, {
      finalStatus,
      allPassed,
      failedTestCases: detailedResults
        .filter((result) => !result.passed)
        .map((result) => ({
          testCase: result.testCase,
          status: result.status,
          expected: result.expected,
          stdout: result.stdout,
        })),
    });

    if (!isSubmission) {
      console.log(`[executeCode:${requestId}] completed preview`, {
        finalStatus,
        durationMs: Date.now() - startedAt,
      });

      return res.status(200).json({
        success: true,
        message: "Code executed successfully",
        submission: {
          id: "preview",
          status: finalStatus,
          language: languageName,
          sourceCode: source_code,
          stdin: stdin.join("\n"),
          stdout: JSON.stringify(detailedResults.map((r) => r.stdout)),
          stderr: detailedResults.some((r) => r.stderr)
            ? JSON.stringify(detailedResults.map((r) => r.stderr))
            : null,
          compileOutput: detailedResults.some((r) => r.compile_output)
            ? JSON.stringify(detailedResults.map((r) => r.compile_output))
            : null,
          memory: detailedResults.some((r) => r.memory)
            ? JSON.stringify(detailedResults.map((r) => r.memory))
            : null,
          time: detailedResults.some((r) => r.time)
            ? JSON.stringify(detailedResults.map((r) => r.time))
            : null,
          testCases: detailedResults.map((result) => ({
            id: `preview-${result.testCase}`,
            ...result,
          })),
          createdAt: new Date().toISOString(),
        },
      });
    }

    // store submission summary
    const submission = await db.submission.create({
      data: {
        userId,
        problemId,
        sourceCode: source_code,
        language: languageName,
        stdin: stdin.join("\n"),
        stdout: JSON.stringify(detailedResults.map((r) => r.stdout)),
        stderr: detailedResults.some((r) => r.stderr)
          ? JSON.stringify(detailedResults.map((r) => r.stderr))
          : null,
        compileOutput: detailedResults.some((r) => r.compile_output)
          ? JSON.stringify(detailedResults.map((r) => r.compile_output))
          : null,
        status: finalStatus,
        memory: detailedResults.some((r) => r.memory)
          ? JSON.stringify(detailedResults.map((r) => r.memory))
          : null,
        time: detailedResults.some((r) => r.time)
          ? JSON.stringify(detailedResults.map((r) => r.time))
          : null,
      },
    });

    // If All passed = true mark problem as solved for the current user
    if (allPassed) {
      await db.problemSolved.upsert({
        where: {
          userId_problemId: {
            userId,
            problemId,
          },
        },
        update: {},
        create: {
          userId,
          problemId,
        },
      });
    }
    // 8. Save individual test case results  using detailedResult

    const testCaseResults = detailedResults.map((result) => ({
      submissionId: submission.id,
      testCase: result.testCase,
      passed: result.passed,
      stdout: result.stdout,
      expected: result.expected,
      stderr: result.stderr,
      compileOutput: result.compile_output,
      status: result.status,
      memory: result.memory,
      time: result.time,
    }));

    await db.testCaseResult.createMany({
      data: testCaseResults,
    });

    const submissionWithTestCase = await db.submission.findUnique({
      where: {
        id: submission.id,
      },
      include: {
        testCases: true,
      },
    });
    //
    console.log(`[executeCode:${requestId}] completed submission`, {
      submissionId: submission.id,
      finalStatus,
      allPassed,
      durationMs: Date.now() - startedAt,
    });

    res.status(200).json({
      success: true,
      message: "Code Executed! Successfully!",
      submission: submissionWithTestCase,
    });
  } catch (error) {
    console.error(`[executeCode:${requestId}] error`, {
      message: error.message,
      durationMs: Date.now() - startedAt,
    });
    const message = error?.message || "Failed to execute code";
    const isExecutionEngineError =
      message.toLowerCase().includes("judge0") ||
      message.toLowerCase().includes("piston");
    res.status(isExecutionEngineError ? 503 : 500).json({ error: message });
  }
};
