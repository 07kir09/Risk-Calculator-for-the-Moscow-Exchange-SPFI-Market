import { render, screen } from "@testing-library/react";
import App from "../App";
import { AppProviders } from "../app/providers/AppProviders";

describe("App", () => {
  it("renders shell and dashboard route", () => {
    render(
      <AppProviders>
        <App />
      </AppProviders>
    );

    expect(screen.getByText(/риск-калькулятор/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /дашборд/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /распределение риска/i })).toBeInTheDocument();
  });
});
