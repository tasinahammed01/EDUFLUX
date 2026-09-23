import { expect, test, type Page } from "@playwright/test";
let sequence = 0;
function testToken(persona: "TEACHER" | "STUDENT") {
  const id = ++sequence;
  return (
    "test-id." +
    Buffer.from(
      JSON.stringify({
        uid: `e2e-${persona.toLowerCase()}-${id}`,
        email: `${persona.toLowerCase()}-${id}@e2e.example`,
        name: `E2E ${persona}`,
        email_verified: true,
        auth_time: Math.floor(Date.now() / 1000),
        firebase: { sign_in_provider: "password" },
      }),
    ).toString("base64url")
  );
}
async function authenticate(page: Page, persona: "TEACHER" | "STUDENT") {
  await page.goto("/login");
  const csrf = await page.request.get("/api/v1/auth/csrf"),
    token = (await csrf.json()).data.csrfToken;
  const response = await page.request.post("/api/v1/auth/session-login", {
    headers: { origin: "http://127.0.0.1:3100", "x-csrf-token": token },
    data: { idToken: testToken(persona), primaryPersona: persona },
  });
  expect(response.ok(), await response.text()).toBe(true);
  await page.goto(
    persona === "TEACHER" ? "/teacher/dashboard" : "/student/dashboard",
  );
}
async function signOut(page: Page) {
  await page.locator(".app-profile-trigger").click();
  await page
    .getByRole("menu")
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
}
test("Google actions remain readable on login and registration", async ({
  page,
}) => {
  for (const route of ["/login", "/register"]) {
    await page.goto(route);
    const button = page.getByRole("button", { name: "Continue with Google" });
    await expect(button).toBeVisible();
    expect(
      await button.evaluate((element) => ({
        color: getComputedStyle(element).color,
        background: getComputedStyle(element).backgroundColor,
      })),
    ).toEqual({ color: "rgb(23, 32, 51)", background: "rgb(255, 255, 255)" });
  }
});
test("teacher publishes an assignment and student joins by secure link", async ({
  page,
}) => {
  test.setTimeout(90_000);
  let nativeDialogCount = 0;
  page.on("dialog", async (nativeDialog) => {
    nativeDialogCount += 1;
    await nativeDialog.dismiss();
  });
  await authenticate(page, "TEACHER");
  const trigger = page.getByRole("button", { name: "Create class" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Create New Class" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Class Name").fill("E2E Literature");
  await dialog.getByLabel("Subject / Level").selectOption("English Literature");
  await dialog.getByLabel(/Description/).fill("Browser verified class");
  await dialog
    .getByRole("button", { name: "Create Class", exact: true })
    .click();
  await expect(page.getByText("Class created", { exact: true })).toHaveCount(1);
  const card = page.getByRole("article").filter({ hasText: "E2E Literature" });
  await expect(card).toBeVisible();
  const joinCode = (
    await card
      .getByRole("button", { name: /Copy join code/ })
      .getAttribute("aria-label")
  )
    ?.split(" ")
    .at(-1);
  const classHref = await card
    .getByRole("link", { name: /Open class/ })
    .getAttribute("href");
  expect(joinCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  await page.evaluate(() => localStorage.setItem("theme", "light"));
  await page.goto(classHref!);
  await expect(page.locator("html")).toHaveClass(/light/);
  await expect(
    page.getByRole("heading", { name: "E2E Literature" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "0 Assignments", exact: true }),
  ).toBeVisible();
  await page.getByText("Show QR").click();
  await expect(
    page.getByRole("img", { name: /QR code to join/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Rotate invite link" }).click();
  const rotateDialog = page.getByRole("dialog", { name: "Rotate invite link?" });
  await expect(rotateDialog).toBeVisible();
  await rotateDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(rotateDialog).toBeHidden();
  await page.getByRole("button", { name: "Rotate invite link" }).click();
  await rotateDialog.getByRole("button", { name: "Rotate link" }).click();
  await expect(page.getByText("Invite link rotated", { exact: true })).toHaveCount(1);
  expect(nativeDialogCount).toBe(0);
  const detailResponse = await page.request.get(
      `/api/v1/classes/${classHref?.split("/").at(-1)}`,
    ),
    detail = (await detailResponse.json()).data;
  await page
    .getByRole("button", { name: "Create Assignment", exact: true })
    .click();
  await page.getByLabel("Title").fill("Persuasive essay");
  await page.getByLabel("Description").fill("Write a persuasive essay.");
  await page.getByLabel("Allow late submissions").check();
  await expect(page.getByLabel("Allow late submissions")).toBeChecked();
  await page
    .locator("[data-assignment-form]")
    .getByRole("button", { name: "Create assignment", exact: true })
    .click();
  await page.getByRole("button", { name: "Add rubric now" }).click();
  await page.getByRole("button", { name: "Add Criterion" }).click();
  await page.getByPlaceholder("Criterion title").fill("Argument quality");
  await page.getByLabel(/Weight for/).fill("100");
  await page.getByRole("button", { name: "Apply Changes" }).click();
  await expect(
    page.getByRole("heading", { name: "Persuasive essay", exact: true }),
  ).toBeVisible();
  const assignmentsResponse = await page.request.get(
      `/api/v1/classes/${classHref?.split("/").at(-1)}/assignments`,
    ),
    assignment = (await assignmentsResponse.json()).data.assignments.find(
      (value: { title: string }) => value.title === "Persuasive essay",
    );
  await page.goto(
    `/teacher/classes/${classHref?.split("/").at(-1)}/assignments/${assignment.id}`,
  );
  await page.getByRole("button", { name: "Publish assignment" }).click();
  await expect(page.getByText("PUBLISHED", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Change theme" }).click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await signOut(page);
  await authenticate(page, "STUDENT");
  await page.goto(new URL(detail.joinUrl).pathname);
  await page.getByRole("button", { name: "Join class" }).click();
  await expect(
    page.getByRole("heading", { name: "E2E Literature" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Persuasive essay", exact: true }),
  ).toBeVisible();
  expect(
    (
      await page.request.get(
        `/api/v1/classes/${classHref?.split("/").at(-1)}/members`,
      )
    ).status(),
  ).toBe(200);
  await signOut(page);
  await page.goto("/student/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});
