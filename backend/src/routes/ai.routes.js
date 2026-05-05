import express from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { getAiCodeReview } from "../controllers/ai.controller.js";

const aiRoutes = express.Router();

aiRoutes.post("/review", authMiddleware, getAiCodeReview);

export default aiRoutes;
