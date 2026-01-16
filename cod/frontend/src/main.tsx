import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { WorkflowProvider } from "./workflow/workflowStore";
import { AppDataProvider } from "./state/appDataStore";
import "./styles.css";

const storedTheme = localStorage.getItem("theme");
if (storedTheme === "light" || storedTheme === "dark") {
  document.documentElement.dataset.theme = storedTheme;
} else if (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches) {
  document.documentElement.dataset.theme = "dark";
}

const client = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        const status = error?.response?.status;
        if (status && [400, 401, 403, 404].includes(status)) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <WorkflowProvider>
        <AppDataProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AppDataProvider>
      </WorkflowProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
