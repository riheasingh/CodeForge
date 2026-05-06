import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import toast from "react-hot-toast";

const getAnalysisCacheKey = ({ submissionId, code, language, problemTitle }) =>
  submissionId && submissionId !== "preview"
    ? submissionId
    : `${language || ""}:${problemTitle || ""}:${code || ""}`;

export const useExecutionStore = create((set, get) => ({
  isExecuting: false,
  submission: null,
  codeAnalysis: null,
  isAnalysisLoading: false,
  analysisError: null,
  analysisCache: {},

  executeCode: async (
    source_code,
    language_id,
    stdin,
    expected_outputs,
    problemId,
    isSubmission = true
  ) => {
    try {
      set({
        isExecuting: true,
        codeAnalysis: null,
        analysisError: null,
        isAnalysisLoading: false,
      });

      const res = await axiosInstance.post("/execute-code", {
        source_code,
        language_id,
        stdin,
        expected_outputs,
        problemId,
        isSubmission,
      });

      set({ submission: res.data.submission });
      toast.success(res.data.message);
    } catch (error) {
      console.log("Error executing code", error);
      toast.error("Error executing code");
    } finally {
      set({ isExecuting: false });
    }
  },

  analyzeCode: async ({
    code,
    language,
    problemTitle,
    problemDescription,
    submissionId,
  }) => {
    const cacheKey = getAnalysisCacheKey({
      submissionId,
      code,
      language,
      problemTitle,
    });
    const cached = get().analysisCache[cacheKey];

    if (cached) {
      set({ codeAnalysis: cached, analysisError: null });
      return;
    }

    try {
      set({ isAnalysisLoading: true, analysisError: null });

      const res = await axiosInstance.post("/analyze-code", {
        code,
        language,
        problemTitle,
        problemDescription,
      });

      const analysis = res.data.analysis;
      set((state) => ({
        codeAnalysis: analysis,
        analysisCache: {
          ...state.analysisCache,
          [cacheKey]: analysis,
        },
      }));
    } catch (error) {
      console.log("Error analyzing code", error);
      const message =
        error?.response?.data?.error || "Failed to analyze code";
      set({ analysisError: message, codeAnalysis: null });
      toast.error(message);
    } finally {
      set({ isAnalysisLoading: false });
    }
  },
}));
