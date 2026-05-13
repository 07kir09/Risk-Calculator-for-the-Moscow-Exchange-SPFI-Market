import { test, expect, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("onboarding_seen_v4", "1");
  });
});

async function runToDashboard(page: Page) {
  await page.goto("/import");
  await page.getByRole("button", { name: /Демо-портфель/i }).click();
  await expect(page.getByText(/Позиции считаны: 2/i)).toBeVisible();

  await page.getByRole("button", { name: /К рыночным данным/i }).click();
  await expect(page.getByRole("heading", { name: "Рыночные данные" })).toBeVisible();

  const configureButton = page.getByRole("button", { name: /К настройке расчёта/i });
  await expect(configureButton).toBeEnabled();
  await configureButton.click();
  await expect(page.getByRole("heading", { name: "Настройка расчёта" })).toBeVisible();

  const resultsButton = page.getByRole("button", { name: /результатам/i });
  await expect(resultsButton).toBeEnabled();
  await resultsButton.click();
  await expect(page.getByRole("heading", { name: "Панель риска" })).toBeVisible();
}

test("импорт → расчёт → дашборд", async ({ page }) => {
  await runToDashboard(page);
  await expect(page.getByText(/Scenario VaR|VaR/i).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Журнал валидации расчёта/i })).toBeVisible();
});

test("dashboard → stress → limits → export", async ({ page }) => {
  await runToDashboard(page);

  await page.getByRole("button", { name: "Стрессы" }).first().click();
  await expect(page.getByRole("heading", { name: "Стресс-сценарии" })).toBeVisible();
  await expect(page.getByText(/Каталог сценариев/i)).toBeVisible();

  await page.goto("/limits");
  await expect(page.getByRole("heading", { name: "Контрольные пороги риска" })).toBeVisible();

  await page.goto("/export");
  await expect(page.getByRole("heading", { name: "Экспорт" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Скачать отчёт \(Excel\)/i })).toBeEnabled();
});
