// File: frontend/pages/_app.js

import { ApolloProvider } from "@apollo/client";
import client from "../lib/api";
import "../styles/globals.css";
import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";
import { ThemeProvider } from "../context/ThemeContext";

function MyApp({ Component, pageProps }) {
  return (
    <ThemeProvider>
      <ApolloProvider client={client}>
        <div className="flex flex-col min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
          <Header />
          <main className="flex-grow">
            <Component {...pageProps} />
          </main>
          <Footer />
        </div>
      </ApolloProvider>
    </ThemeProvider>
  );
}

export default MyApp;
