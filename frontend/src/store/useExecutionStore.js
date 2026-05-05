import {create} from "zustand";
import { axiosInstance } from "../lib/axios";
import toast from "react-hot-toast";



export const useExecutionStore = create((set)=>({
    isExecuting:false,
    submission:null,
    aiReview:null,
    isReviewLoading:false,

       executeCode:async ( source_code, language_id, stdin, expected_outputs, problemId, isSubmission = true)=>{
        try {
            set({isExecuting:true, aiReview:null, isReviewLoading:false});
            console.log("Submission:",JSON.stringify({
                source_code,
                language_id,
                stdin,
                expected_outputs,
                problemId,
                isSubmission
            }));
            const res = await axiosInstance.post("/execute-code" , { source_code, language_id, stdin, expected_outputs, problemId, isSubmission });

            set({submission:res.data.submission});

            try {
                set({ isReviewLoading: true });
                const reviewRes = await axiosInstance.post("/ai/review", {
                    sourceCode: source_code,
                    language: language_id,
                    status: res.data?.submission?.status,
                    testCases: res.data?.submission?.testCases || [],
                    problemId,
                    stdin,
                    expectedOutputs: expected_outputs,
                });
                set({ aiReview: reviewRes.data?.review || null });
            } catch (reviewError) {
                console.log("AI review generation failed", reviewError);
                set({ aiReview: null });
            } finally {
                set({ isReviewLoading: false });
            }
      
            toast.success(res.data.message);
        } catch (error) {
            console.log("Error executing code",error);
            toast.error("Error executing code");
        }
        finally{
            set({isExecuting:false});
        }
    }
}))