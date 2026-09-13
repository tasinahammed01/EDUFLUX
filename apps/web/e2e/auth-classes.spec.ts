import { expect, test } from "@playwright/test";

test("teacher creates a class and student joins without teacher permissions", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Display name").fill("E2E Teacher");
  await page.getByLabel("Email address").fill("teacher-e2e@example.com");
  await page.locator('input[name="password"]').fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/teacher\/dashboard$/);

  await page.getByLabel("Class name").fill("E2E Literature");
  await page.getByLabel(/Description/).fill("Browser verified class");
  await page.getByRole("button", { name: "Create class" }).click();
  const classCard = page.getByRole("article").filter({ hasText: "E2E Literature" });
  await expect(classCard).toBeVisible();
  const codeButton = classCard.getByRole("button", { name: /Copy join code/ });
  const joinCode = (await codeButton.getAttribute("aria-label"))?.split(" ").at(-1);
  expect(joinCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  const classLink = classCard.getByRole("link", { name: /Open class/ });
  const classHref = await classLink.getAttribute("href");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/register");
  await page.getByRole("button", { name: /Student/ }).click();
  await page.getByLabel("Display name").fill("E2E Student");
  await page.getByLabel("Email address").fill("student-e2e@example.com");
  await page.locator('input[name="password"]').fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/student\/dashboard$/);
  await page.getByLabel("Class code").fill(joinCode!);
  await page.getByRole("button", { name: "Join class" }).click();
  await expect(page.getByRole("article").filter({ hasText: "E2E Literature" })).toBeVisible();

  const classId = classHref?.split("/").at(-1);
  const forbidden = await page.request.get(`/api/v1/classes/${classId}/members`);
  expect(forbidden.status()).toBe(403);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/student/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});
