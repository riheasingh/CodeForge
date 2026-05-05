import React from 'react';
import { CheckCircle2, XCircle, Clock, MemoryStick as Memory } from 'lucide-react';

const SubmissionResults = ({ submission, aiReview, isReviewLoading }) => {
  // Parse stringified arrays
  const memoryArr = JSON.parse(submission.memory || '[]');
  const timeArr = JSON.parse(submission.time || '[]');

  // Calculate averages
  const avgMemory = memoryArr.length
    ? memoryArr.map(m => parseFloat(m)).reduce((a, b) => a + b, 0) / memoryArr.length
    : 0;

  const avgTime = timeArr.length
    ? timeArr.map(t => parseFloat(t)).reduce((a, b) => a + b, 0) / timeArr.length
    : 0;

  const passedTests = submission.testCases.filter(tc => tc.passed).length;
  const totalTests = submission.testCases.length;
  const successRate = (passedTests / totalTests) * 100;

  return (
    <div className="space-y-6">
      {/* Overall Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <h3 className="card-title text-sm">Status</h3>
            <div className={`text-lg font-bold ${
              submission.status === 'Accepted' ? 'text-success' : 'text-error'
            }`}>
              {submission.status}
            </div>
          </div>
        </div>

        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <h3 className="card-title text-sm">Success Rate</h3>
            <div className="text-lg font-bold">
              {successRate.toFixed(1)}%
            </div>
          </div>
        </div>

        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <h3 className="card-title text-sm flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Avg. Runtime
            </h3>
            <div className="text-lg font-bold">
              {avgTime.toFixed(3)} s
            </div>
          </div>
        </div>

        <div className="card bg-base-200 shadow-lg">
          <div className="card-body p-4">
            <h3 className="card-title text-sm flex items-center gap-2">
              <Memory className="w-4 h-4" />
              Avg. Memory
            </h3>
            <div className="text-lg font-bold">
              {avgMemory.toFixed(0)} KB
            </div>
          </div>
        </div>
      </div>

      {/* Test Cases Results */}
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
                    <td className="font-mono">{testCase.stdout || 'null'}</td>
                    <td>{testCase.memory}</td>
                    <td>{testCase.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title mb-2">AI Code Review</h2>

          {isReviewLoading ? (
            <div className="flex items-center gap-2 text-base-content/70">
              <span className="loading loading-spinner loading-sm"></span>
              Generating AI review...
            </div>
          ) : aiReview ? (
            <div className="space-y-4">
              <p className="text-base-content/80">
                {aiReview.correctnessAnalysis || aiReview.summary}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="badge badge-outline p-4 justify-start">
                  Time: {aiReview.timeComplexity}
                </div>
                <div className="badge badge-outline p-4 justify-start">
                  Space: {aiReview.spaceComplexity}
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Bug Analysis</h3>
                <p className="text-base-content/80">
                  {aiReview.bugAnalysis || "No specific bug detected."}
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Optimality</h3>
                <p className="text-base-content/80">
                  {aiReview.isOptimal
                    ? "Your solution appears optimal for this problem."
                    : "Your solution can likely be optimized further."}
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Code Smells / Readability</h3>
                <ul className="list-disc ml-5 space-y-1">
                  {(aiReview.codeQualityReview || aiReview.codeSmells || []).map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Better Approach Suggestions</h3>
                <ul className="list-disc ml-5 space-y-1">
                  {(aiReview.optimizationSuggestions || aiReview.suggestions || []).map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Interview Feedback</h3>
                <ul className="list-disc ml-5 space-y-1">
                  {(aiReview.interviewFeedback || []).map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="text-base-content/70">
              AI review unavailable for this run.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SubmissionResults;