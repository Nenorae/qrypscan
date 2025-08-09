// File: frontend/lib/api.js

import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";

// [DEBUG] Tampilkan variabel env mentah dari Next.js
console.log(
  "[DEBUG] process.env.NEXT_PUBLIC_GRAPHQL_API_URL:",
  process.env.NEXT_PUBLIC_GRAPHQL_API_URL
);

// Pastikan Anda sudah menambahkan variabel ini di file .env di root proyek
const API_URL =
  process.env.NEXT_PUBLIC_GRAPHQL_API_URL ||
  "http://100.92.191.4:4000/graphql";

// [DEBUG] Tampilkan URL final yang akan digunakan oleh Apollo Client
console.log("[DEBUG] Final API_URL used:", API_URL);

const httpLink = new HttpLink({
  uri: API_URL,
});

const client = new ApolloClient({
  link: httpLink,
  cache: new InMemoryCache(),
});

export default client;
