import { expect,test } from "@playwright/test";
const viewports=[{width:320,height:568},{width:390,height:844},{width:768,height:1024},{width:1024,height:768},{width:1440,height:900},{width:1920,height:1080}];
test("marketing experience stays stable across motion tiers and navigation",async({page})=>{
 test.setTimeout(90_000);
 const errors:string[]=[];page.on("console",message=>{if(message.type()==="error")errors.push(message.text())});page.on("pageerror",error=>errors.push(error.message));
 for(const viewport of viewports){await page.setViewportSize(viewport);await page.goto("/");await page.waitForLoadState("networkidle");await expect(page.getByRole("heading",{name:/Teach with clarity/})).toBeVisible();await expect(page.locator("canvas")).toHaveCount(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),JSON.stringify(viewport)).toBeLessThanOrEqual(1);await page.mouse.wheel(0,Math.round(await page.evaluate(()=>document.body.scrollHeight*.42)));await page.waitForTimeout(100);await page.mouse.wheel(0,-500)}
 await page.setViewportSize({width:1440,height:900});await page.goto("/");await page.getByRole("link",{name:"Sign in"}).first().click();await expect(page).toHaveURL(/\/login$/);await page.goBack();await expect(page.locator("canvas")).toHaveCount(1);await page.evaluate(()=>window.scrollTo(0,0));await page.getByRole("link",{name:"Join Now"}).first().click();await expect(page).toHaveURL(/\/register$/);await page.goBack();await expect(page.locator("canvas")).toHaveCount(1);expect(errors).toEqual([]);
});
test("reduced motion keeps critical content visible",async({page})=>{await page.emulateMedia({reducedMotion:"reduce"});await page.goto("/");await expect(page.getByRole("heading",{name:/Teach with clarity/})).toBeVisible();await expect(page.getByText(/Feedback shouldn/)).toBeAttached();await expect(page.getByRole("link",{name:"Join Now"}).first()).toBeVisible()});
test("light, dark, and system themes persist without remounting the hero",async({page})=>{
 test.setTimeout(90_000);
 await page.emulateMedia({colorScheme:"dark"});
 await page.goto("/");
 const toggle=page.getByRole("button",{name:"Change theme"}).first();
 await toggle.click();
 await page.getByRole("menuitemradio",{name:"Light"}).click();
 await expect(page.locator("html")).toHaveClass(/light/);
 await expect(page.locator(".hero-line > span").first()).toHaveCSS("color","rgb(21, 34, 56)");
 await expect(page.locator(".hero-line.serif > span")).toHaveCSS("color","rgb(49, 94, 174)");
 await expect(page.locator("canvas")).toHaveCount(1);
 await page.goto("/login");
 await expect(page.locator("html")).toHaveClass(/light/);
 await page.reload();
 await expect(page.locator("html")).toHaveClass(/light/);
 await page.goto("/");
 await page.getByRole("button",{name:"Change theme"}).first().click();
 await page.getByRole("menuitemradio",{name:"Dark"}).click();
 await expect(page.locator("html")).toHaveClass(/dark/);
 await page.reload();
 await expect(page.locator("html")).toHaveClass(/dark/);
 await page.getByRole("button",{name:"Change theme"}).first().click();
 await page.getByRole("menuitemradio",{name:"System"}).click();
 await expect(page.locator("html")).toHaveClass(/dark/);
 await page.emulateMedia({colorScheme:"light"});
 await expect(page.locator("html")).toHaveClass(/light/);
});
