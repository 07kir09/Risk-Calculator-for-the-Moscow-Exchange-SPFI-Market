import { test, expect, type Page } from "@playwright/test";

async function runToDashboard(page: Page) {
  await page.goto("/import");
  await page.getByRole("button", { name: "Загрузить демо" }).click();
  await page.getByRole("button", { name: "Продолжить: проверка данных" }).click();
  await page.getByTestId("go-market").click();
  await page.getByTestId("fetch-market").click();
  await expect(page.getByTestId("go-configure")).toBeEnabled();
  await page.getByTestId("go-configure").click();
  await expect(page.getByTestId("save-config")).toBeEnabled();
  await page.getByTestId("save-config").click();
  await expect(page.getByTestId("run-calc")).toBeEnabled();
  await page.getByTestId("run-calc").click();
  await expect(page.getByRole("heading", { name: "Шаг 6. Панель риска" })).toBeVisible();
}

test("импорт → расчёт → дашборд", async ({ page }) => {
  await runToDashboard(page);
  await expect(page.getByText("VaR (hist)")).toBeVisible();
});

test("стресс → просмотр топ‑вкладчиков", async ({ page }) => {
  await runToDashboard(page);
  await page.getByRole("button", { name: "Открыть стрессы" }).click();
  await expect(page.getByRole("heading", { name: "Шаг 7. Стресс‑сценарии" })).toBeVisible();
  await page.getByRole("button", { name: /Запустить пересчёт/i }).click();
  await expect(page.getByText("Топ‑вкладчики (демо)")).toBeVisible();
});
