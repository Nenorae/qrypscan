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
import GraphQLJSON from 'graphql-type-json'; // 1. Import tipe JSON
import * as contractService from "../features/contracts/contract.service.js";

// Helper untuk mendapatkan __dirname di ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const upload = multer(); // Inisialisasi multer

  // --- Logika Pemuatan Dinamis ---
  // Memuat semua file *.schema.js dari dalam folder features
  const typeDefsArray = loadFilesSync(path.join(__dirname, "../features/**/*.schema.js"));
  // Memuat semua file *.resolver.js dari dalam folder features
  const resolversArray = loadFilesSync(path.join(__dirname, "../features/**/*.resolver.js"));

  // 2. Buat resolver untuk tipe skalar JSON
  const scalarResolvers = {
    JSON: GraphQLJSON,
  };

  // 3. Gabungkan resolver fitur dengan resolver skalar
  const typeDefs = mergeTypeDefs(typeDefsArray);
  const resolvers = mergeResolvers([resolversArray, scalarResolvers]);
  // --------------------------------

  // Buat instance Apollo Server dengan skema yang sudah digabung
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: async ({ req }) => {
      return {};
    },
  });

  // Mulai server Apollo
  await server.start();

  // --- Middleware Global ---
  // Terapkan CORS dan body parser JSON untuk semua request yang masuk
  app.use(cors());
  app.use(express.json());


  // --- Endpoint REST untuk Verifikasi Kontrak dari Hardhat (Etherscan-compatible) ---
  // Menangani GET (untuk check status) dan POST (untuk submit verifikasi)
  app.get("/api", contractService.handleHardhatVerification);
  app.post("/api", express.urlencoded({ extended: true }), contractService.handleHardhatVerification);

  // --- Middleware GraphQL ---
  // cors() dan express.json() sudah dipindah ke level global
  app.use(
    "/graphql",
    expressMiddleware(server, {
      context: async ({ req }) => ({
        req
      }),
    })
  );

  // --- Global Error Handler ---
  // Middleware ini harus menjadi yang terakhir agar bisa menangkap semua error dari route manapun
  app.use((err, req, res, next) => {
    console.error("🚨 [DEBUG] Global Error Handler Terpicu:", err);

    // Cek jika response sudah dikirim, serahkan ke error handler default Express
    if (res.headersSent) {
      return next(err);
    }

    // Kirim response error dalam format JSON
    res.status(500).json({
      status: "0",
      message: "Error",
      result: err.message || "Terjadi kesalahan internal pada server.",
    });
  });

  return httpServer;
}
