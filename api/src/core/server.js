// src/core/server.js
import express from "express";
import http from "http";
import cors from "cors";
import path from "path";
import multer from "multer";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { loadFilesSync } from "@graphql-tools/load-files";
import { mergeTypeDefs, mergeResolvers } from "@graphql-tools/merge";
import { fileURLToPath } from "url";
import GraphQLJSON from "graphql-type-json";
import * as contractService from "../features/contracts/contract.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Enhanced logging utility
const logger = {
  info: (message, data) => {
    console.log(`🔵 [INFO] ${new Date().toISOString()} - ${message}`);
    if (data) console.log(JSON.stringify(data, null, 2));
  },
  debug: (message, data) => {
    console.log(`🟡 [DEBUG] ${new Date().toISOString()} - ${message}`);
    if (data) console.log(JSON.stringify(data, null, 2));
  },
  error: (message, error) => {
    console.error(`🔴 [ERROR] ${new Date().toISOString()} - ${message}`);
    if (error) {
      console.error("Error details:", error);
      if (error.stack) console.error("Stack trace:", error.stack);
    }
  },
  hardhat: (message, data) => {
    console.log(`⚡ [HARDHAT] ${new Date().toISOString()} - ${message}`);
    if (data) console.log(JSON.stringify(data, null, 2));
  },
};

// Middleware untuk logging semua request
const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Log basic request info
  logger.info(`Incoming ${req.method} request to ${req.originalUrl}`, {
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    headers: req.headers,
    query: req.query,
    userAgent: req.get("User-Agent"),
    contentType: req.get("Content-Type"),
    contentLength: req.get("Content-Length"),
    ip: req.ip,
    ips: req.ips,
  });

  // Detect if request is from Hardhat
  const userAgent = req.get("User-Agent") || "";
  const isHardhatRequest = userAgent.includes("hardhat") || userAgent.includes("ethers") || req.originalUrl.includes("verify") || req.originalUrl.includes("api");

  if (isHardhatRequest) {
    logger.hardhat(`Hardhat verification request detected`, {
      method: req.method,
      url: req.originalUrl,
      userAgent: userAgent,
      contentType: req.get("Content-Type"),
    });
  }

  // Log response
  const originalSend = res.send;
  res.send = function (body) {
    const duration = Date.now() - startTime;
    logger.info(`Response sent for ${req.method} ${req.originalUrl}`, {
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      responseSize: body ? body.length : 0,
    });

    if (isHardhatRequest) {
      logger.hardhat(`Hardhat response`, {
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        responseBody: body ? (body.length > 1000 ? body.substring(0, 1000) + "..." : body) : null,
      });
    }

    return originalSend.call(this, body);
  };

  next();
};

// Middleware untuk parsing body dengan logging
const bodyParserWithLogging = (req, res, next) => {
  let body = "";

  req.on("data", (chunk) => {
    body += chunk.toString();
  });

  req.on("end", () => {
    if (body) {
      try {
        req.rawBody = body;

        // Log raw body untuk debugging
        logger.debug(`Raw body received for ${req.method} ${req.originalUrl}`, {
          rawBody: body,
          length: body.length,
          contentType: req.get("Content-Type"),
        });

        // Coba parse sebagai JSON jika content-type adalah JSON
        const contentType = req.get("Content-Type") || "";
        if (contentType.includes("application/json")) {
          try {
            req.body = JSON.parse(body);
            logger.debug(`Parsed JSON body`, req.body);
          } catch (parseError) {
            logger.error(`Failed to parse JSON body`, parseError);
            req.body = {};
          }
        } else if (contentType.includes("application/x-www-form-urlencoded")) {
          // Parse form data
          req.body = new URLSearchParams(body);
          const formData = Object.fromEntries(req.body);
          logger.debug(`Parsed form data`, formData);
          req.body = formData;
        } else {
          // Keep as raw text
          req.body = { rawData: body };
        }
      } catch (error) {
        logger.error(`Error processing request body`, error);
        req.body = { rawData: body };
      }
    } else {
      req.body = {};
    }
    next();
  });
};

// Custom multer configuration untuk debugging
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Middleware untuk logging multipart data
const multerLogger = (req, res, next) => {
  const originalMiddleware = upload.any();

  originalMiddleware(req, res, (err) => {
    if (err) {
      logger.error(`Multer error`, err);
      return next(err);
    }

    // Log multipart form data
    if (req.files && req.files.length > 0) {
      logger.hardhat(`Files uploaded`, {
        fileCount: req.files.length,
        files: req.files.map((file) => ({
          fieldname: file.fieldname,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
        })),
      });
    }

    if (req.body && Object.keys(req.body).length > 0) {
      logger.hardhat(`Form fields`, req.body);
    }

    next();
  });
};

export async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  // Trust proxy untuk mendapatkan IP yang benar
  app.set("trust proxy", true);

  // --- Apollo Server Setup ---
  const typeDefsArray = loadFilesSync(path.join(__dirname, "../features/**/*.schema.js"));
  const resolversArray = loadFilesSync(path.join(__dirname, "../features/**/*.resolver.js"));
  const scalarResolvers = { JSON: GraphQLJSON };
  const typeDefs = mergeTypeDefs(typeDefsArray);
  const resolvers = mergeResolvers([resolversArray, scalarResolvers]);

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    // Enable introspection and playground for debugging
    introspection: process.env.NODE_ENV !== "production",
    plugins: [
      {
        requestDidStart() {
          return {
            didResolveOperation(requestContext) {
              logger.debug("GraphQL Operation", {
                operationName: requestContext.request.operationName,
                query: requestContext.request.query,
              });
            },
            didEncounterErrors(requestContext) {
              logger.error("GraphQL Errors", requestContext.errors);
            },
          };
        },
      },
    ],
  });

  await server.start();
  logger.info("Apollo Server started successfully");

  // --- Global Middleware ---
  app.use(
    cors({
      origin: true,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    })
  );

  // Serve static token image assets
  app.use('/images', express.static(path.resolve(__dirname, '../tokenAsset/image')));
  logger.info(`Serving static images from ${path.resolve(__dirname, '../tokenAsset/image')} at /images`);

  // Apply request logging to all routes
  app.use(requestLogger);

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
    expressMiddleware(server, {
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

  // Log server startup info
  logger.info("Server configuration completed", {
    environment: process.env.NODE_ENV || "development",
    nodeVersion: process.version,
    routes: ["GET /health", "GET|POST|PUT /api", "GET|POST|PUT /verify", "GET|POST|PUT /contract/verify", "POST /graphql"],
  });

  return httpServer;
}
