import express from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { analyzeCode } from "../controllers/ai.controller.js";

const analyzeCodeRoutes = express.Router();

analyzeCodeRoutes.post("/", authMiddleware, analyzeCode);

export default analyzeCodeRoutes;
