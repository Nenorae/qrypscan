// src/core/routes.js
import express from "express";
import { expressMiddleware } from "@apollo/server/express4";
import path from "path";
import { fileURLToPath } from "url";
import * as contractService from "../features/contracts/contract.service.js";
import logger from "./serverLogger.js";
import { bodyParserWithLogging, multerLogger } from "./middlewares.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function registerRoutes(app, apolloServer) {
  // Serve static token image assets
  app.use('/images', express.static(path.resolve(__dirname, '../tokenAsset/image')));
  logger.info(`Serving static images from ${path.resolve(__dirname, '../tokenAsset/image')} at /images`);

  // --- API Routes untuk Hardhat Verification ---
  const apiRouter = express.Router();

  // Middleware khusus untuk API routes
  apiRouter.use((req, res, next) => {
    logger.hardhat(`API route accessed: ${req.method} ${req.originalUrl}`);
    next();
  });

  // GET route - untuk query parameters
  apiRouter.get("/", (req, res, next) => {
    logger.hardhat(`GET request query parameters`, req.query);
    contractService.handleHardhatVerification(req, res, next);
  });

  // POST route - dengan body parsing dan file upload
  apiRouter.post(
    "/",
    bodyParserWithLogging, // Parse body first
    multerLogger, // Then handle multipart
    (req, res, next) => {
      logger.hardhat(`POST request processed`, {
        body: req.body,
        files: req.files ? req.files.length : 0,
        rawBody: req.rawBody ? req.rawBody.substring(0, 500) + "..." : "No raw body",
      });
      contractService.handleHardhatVerification(req, res, next);
    }
  );

  // PUT route - untuk update operations
  apiRouter.put("/", bodyParserWithLogging, multerLogger, (req, res, next) => {
    logger.hardhat(`PUT request processed`, {
      body: req.body,
      files: req.files ? req.files.length : 0,
    });
    contractService.handleHardhatVerification(req, res, next);
  });

  // Catch-all untuk method lain
  apiRouter.all("/", (req, res, next) => {
    logger.hardhat(`Unhandled method ${req.method} for /api`);
    contractService.handleHardhatVerification(req, res, next);
  });

  // Register API router
  app.use("/api", apiRouter);

  // Route untuk verify endpoint (alternatif yang sering digunakan Hardhat)
  app.use("/verify", apiRouter);
  app.use("/contract/verify", apiRouter);

  // --- GraphQL Middleware ---
  app.use(
    "/graphql",
    express.json({ limit: "50mb" }),
    expressMiddleware(apolloServer, {
      context: async ({ req }) => {
        logger.debug("GraphQL context created", {
          headers: req.headers,
          method: req.method,
        });
        return { req };
      },
    })
  );

  // --- Health Check Endpoint ---
  app.get("/health", (req, res) => {
    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version,
    });
  });

  // --- 404 Handler ---
  app.use("*", (req, res) => {
    logger.info(`404 - Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
      status: "0",
      message: "Route not found",
      result: `${req.method} ${req.originalUrl} is not available`,
    });
  });

  // --- Global Error Handler ---
  app.use((err, req, res, next) => {
    logger.error("Global Error Handler triggered", {
      error: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      headers: req.headers,
      body: req.body,
    });

    if (res.headersSent) {
      return next(err);
    }

    // Send error response
    const isDevelopment = process.env.NODE_ENV !== "production";
    res.status(err.status || 500).json({
      status: "0",
      message: "Error",
      result: err.message || "Terjadi kesalahan internal pada server.",
      ...(isDevelopment && {
        stack: err.stack,
        details: err,
      }),
    });
  });
}
