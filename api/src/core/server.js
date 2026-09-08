// src/core/server.js
import express from "express";
import http from "http";
import cors from "cors";
import logger from "./serverLogger.js";
import { requestLogger } from "./middlewares.js";
import { createApolloServer } from "./apollo.js";
import { registerRoutes } from "./routes.js";

export async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  // Trust proxy untuk mendapatkan IP yang benar
  app.set("trust proxy", true);

  // --- Apollo Server Setup ---
  const server = await createApolloServer();

  // --- Global Middleware ---
  app.use(
    cors({
      origin: true,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    })
  );

  // Apply request logging to all routes
  app.use(requestLogger);

  // --- Register all routes ---
  registerRoutes(app, server);

  // Log server startup info
  logger.info("Server configuration completed", {
    environment: process.env.NODE_ENV || "development",
    nodeVersion: process.version,
    routes: ["GET /health", "GET|POST|PUT /api", "GET|POST|PUT /verify", "GET|POST|PUT /contract/verify", "POST /graphql"],
  });

  return httpServer;
}
