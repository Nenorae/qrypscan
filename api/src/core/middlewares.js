// src/core/middlewares.js
import multer from "multer";
import logger from "./serverLogger.js";

// Middleware untuk logging semua request
export const requestLogger = (req, res, next) => {
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
export const bodyParserWithLogging = (req, res, next) => {
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
export const multerLogger = (req, res, next) => {
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
