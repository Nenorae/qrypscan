// src/core/apollo.js
import path from "path";
import { ApolloServer } from "@apollo/server";
import { loadFilesSync } from "@graphql-tools/load-files";
import { mergeTypeDefs, mergeResolvers } from "@graphql-tools/merge";
import { fileURLToPath } from "url";
import GraphQLJSON from "graphql-type-json";
import logger from "./serverLogger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createApolloServer() {
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

  return server;
}
