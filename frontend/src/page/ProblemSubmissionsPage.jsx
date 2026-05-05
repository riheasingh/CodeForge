import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, FileText } from "lucide-react";
import { useSubmissionStore } from "../store/useSubmissionStore";
import { useProblemStore } from "../store/useProblemStore";
import SubmissionsList from "../components/SubmissionList";

const ProblemSubmissionsPage = () => {
  const { id } = useParams();
  const [statusFilter, setStatusFilter] = useState("ALL");

  const { getProblemById, problem } = useProblemStore();
  const { submissions, isLoading, getSubmissionForProblem } = useSubmissionStore();

  useEffect(() => {
    getProblemById(id);
    getSubmissionForProblem(id);
  }, [id, getProblemById, getSubmissionForProblem]);

  const filteredSubmissions = useMemo(() => {
    if (statusFilter === "ALL") return submissions || [];
    return (submissions || []).filter((item) => item.status === statusFilter);
  }, [submissions, statusFilter]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-base-300 to-base-200 w-full">
      <div className="max-w-7xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to={`/problem/${id}`} className="btn btn-ghost btn-sm gap-2">
              <ChevronLeft className="w-4 h-4" />
              Back to Problem
            </Link>
            <h1 className="text-2xl font-bold">
              {problem?.title || "Problem"} - Submissions History
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-base-content/70" />
            <span className="font-semibold">{submissions?.length || 0} Attempts</span>
          </div>
        </div>

        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold">All Submission Attempts</h2>
              <select
                className="select select-bordered select-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Status</option>
                <option value="Accepted">Accepted</option>
                <option value="Wrong Answer">Wrong Answer</option>
              </select>
            </div>

            <SubmissionsList submissions={filteredSubmissions} isLoading={isLoading} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProblemSubmissionsPage;
