import React from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  MemoryStick as Memory,
  Sparkles,
} from "lucide-react";

const safeParseArray = (value) => {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const SubmissionResults = ({
  submission,
  codeAnalysis,
  isAnalysisLoading,
  analysisError,
  onAnalyzeCode,
}) => {
  const memoryArr = safeParseArray(submission.memory);
  const timeArr = safeParseArray(submission.time);

  const avgMemory = memoryArr.length
    ? memoryArr.map((m) => parseFloat(m)).reduce((a, b) => a + b, 0) /
      memoryArr.length
    : 0;

  const avgTime = timeArr.length
    ? timeArr.map((t) => parseFloat(t)).reduce((a, b) => a + b, 0) /
      timeArr.length
    : 0;

  const passedTests = submission.testCases.filter((tc) => tc.passed).length;
  const totalTests = submission.testCases.length;
  const successRate = totalTests ? (passedTests / totalTests) * 100 : 0;
  const canAnalyze = submission.id !== "preview";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <h3 className="card-title text-sm">Status</h3>
            <div
              className={`text-lg font-bold ${
                submission.status === "Accepted" ? "text-success" : "text-error"
              }`}
            >
              {submission.status}
            </div>
          </div>
        </div>

        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <h3 className="card-title text-sm">Success Rate</h3>
            <div className="text-lg font-bold">{successRate.toFixed(1)}%</div>
          </div>
        </div>

        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <h3 className="card-title text-sm flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Avg. Runtime
            </h3>
            <div className="text-lg font-bold">{avgTime.toFixed(3)} s</div>
          </div>
        </div>

        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <h3 className="card-title text-sm flex items-center gap-2">
              <Memory className="w-4 h-4" />
              Avg. Memory
            </h3>
            <div className="text-lg font-bold">{avgMemory.toFixed(0)} KB</div>
          </div>
        </div>
      </div>

      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title mb-4">Test Cases Results</h2>
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Expected Output</th>
                  <th>Your Output</th>
                  <th>Memory</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {submission.testCases.map((testCase) => (
                  <tr key={testCase.id}>
                    <td>
                      {testCase.passed ? (
                        <div className="flex items-center gap-2 text-success">
                          <CheckCircle2 className="w-5 h-5" />
                          Passed
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-error">
                          <XCircle className="w-5 h-5" />
                          Failed
                        </div>
                      )}
                    </td>
                    <td className="font-mono">{testCase.expected}</td>
                    <td className="font-mono">{testCase.stdout || "null"}</td>
                    <td>{testCase.memory}</td>
                    <td>{testCase.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {canAnalyze && (
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <div className="flex items-center justify-between gap-3">
              <h2 className="card-title">AI Code Analyzer</h2>
              <button
                className="btn btn-primary btn-sm gap-2"
                onClick={onAnalyzeCode}
                disabled={isAnalysisLoading}
              >
                {isAnalysisLoading ? (
                  <span className="loading loading-spinner loading-xs"></span>
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Analyze Code
              </button>
            </div>

            {analysisError && (
              <div className="alert alert-error mt-4">
                <span>{analysisError}</span>
              </div>
            )}

            {codeAnalysis && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-base-200 rounded-lg p-4">
                  <h3 className="font-semibold mb-2">Time Complexity</h3>
                  <p>{codeAnalysis.timeComplexity}</p>
                </div>
                <div className="bg-base-200 rounded-lg p-4">
                  <h3 className="font-semibold mb-2">Space Complexity</h3>
                  <p>{codeAnalysis.spaceComplexity}</p>
                </div>
                <div className="bg-base-200 rounded-lg p-4">
                  <h3 className="font-semibold mb-2">Better Approach</h3>
                  <p>{codeAnalysis.optimization}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SubmissionResults;
