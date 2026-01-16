import { ReactElement } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { WorkflowProvider } from "../workflow/workflowStore";
import { AppDataProvider } from "../state/appDataStore";

export function renderWithProviders(ui: ReactElement, opts?: { route?: string }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const route = opts?.route ?? "/";
  return render(
    <QueryClientProvider client={client}>
      <WorkflowProvider>
        <AppDataProvider>
          <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        </AppDataProvider>
      </WorkflowProvider>
    </QueryClientProvider>
  );
}

