// File: frontend/lib/api.js

import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";

// Pastikan Anda sudah menambahkan variabel ini di file .env di root proyek
const API_URL = process.env.NEXT_PUBLIC_GRAPHQL_API_URL || "http://100.92.191.4:4000/graphql";

const httpLink = new HttpLink({
  uri: API_URL,
});

const client = new ApolloClient({
  link: httpLink,
  cache: new InMemoryCache(),
});

export default client;
