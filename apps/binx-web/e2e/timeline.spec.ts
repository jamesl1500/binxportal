/**
 * timeline.spec.ts — Dashboard → Timeline against the real API: posting with
 * an @mention, comments, reactions, edit and delete; the highlights rail and
 * its "Say congrats" hand-off; and the shared @mention picker in messaging.
 */
import type { Page } from "@playwright/test";

import { DEMO, expect, test } from "./fixtures";

const TEAMMATE_HANDLE = "e2e_teammate";

function postCard(page: Page, text: string) {
  return page.getByRole("article").filter({ hasText: text });
}

async function openTimeline(page: Page) {
  await page.goto("/dashboard/timeline");
  await expect(page.getByLabel("New timeline post")).toBeVisible();
}

test.describe("team timeline", () => {
  test("post with an @mention, then comment, react, edit and delete", async ({ staffPage }) => {
    const marker = `Launch update ${Date.now()}`;
    await openTimeline(staffPage);

    const composer = staffPage.getByLabel("New timeline post");
    await composer.fill(`${marker} — thanks `);
    await composer.press("End");
    await composer.pressSequentially("@e2e_t");
    await staffPage.getByRole("option", { name: new RegExp(DEMO.teammate.name) }).click();
    await expect(composer).toHaveValue(`${marker} — thanks @${TEAMMATE_HANDLE} `);
    await staffPage.getByRole("button", { name: "Post", exact: true }).click();

    const card = postCard(staffPage, marker);
    await expect(card).toBeVisible();
    await expect(composer).toHaveValue("");

    // React: one-tap Like, then a second reaction from the picker.
    const like = card.getByRole("button", { name: "Like", exact: true });
    await like.click();
    await expect(like).toHaveAttribute("aria-pressed", "true");
    // The chip under the post counts it, and offers to take it back.
    await expect(card.getByRole("button", { name: "Like — remove yours" })).toBeVisible();
    await card.getByRole("button", { name: "React" }).click();
    await card.getByRole("group", { name: "Pick a reaction" }).getByRole("button", { name: "Celebrate" }).click();
    await expect(card.getByRole("list", { name: "Reactions" })).toContainText("🎉");

    // Comment.
    await card.getByRole("button", { name: /Comment/ }).click();
    const commentBox = card.getByLabel(`Comment on ${DEMO.staff.name}'s post`);
    await commentBox.fill("Following up on this tomorrow");
    await card.getByRole("button", { name: "Reply" }).click();
    await expect(card.getByRole("region", { name: "Comments" })).toContainText("Following up on this tomorrow");

    // Edit the post, and it survives a reload.
    await card.getByRole("button", { name: "Edit", exact: true }).first().click();
    const editBox = card.getByLabel("Edit your post");
    await editBox.fill(`${marker} (edited)`);
    await card.getByRole("button", { name: "Save" }).click();
    await staffPage.reload();
    const edited = postCard(staffPage, `${marker} (edited)`);
    await expect(edited).toBeVisible();
    await expect(edited.getByRole("region", { name: "Comments" })).toContainText("Following up on this tomorrow");

    // Delete it (through the confirm dialog).
    await edited.getByRole("button", { name: "Delete", exact: true }).first().click();
    await staffPage.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(postCard(staffPage, marker)).toHaveCount(0);
  });

  test("the owner can pin a post and post an announcement", async ({ staffPage }) => {
    const marker = `All-hands Friday ${Date.now()}`;
    await openTimeline(staffPage);
    await staffPage.getByLabel("New timeline post").fill(marker);
    await staffPage.getByLabel(/Announcement — notify everyone/).check();
    await staffPage.getByRole("button", { name: "Post announcement" }).click();
    await expect(staffPage.getByText(/everyone's been notified/)).toBeVisible();

    const card = postCard(staffPage, marker);
    await expect(card).toContainText("Announcement");
    await card.getByRole("button", { name: "Pin", exact: true }).click();
    const pinned = staffPage.getByRole("region", { name: "Pinned" });
    await expect(pinned.getByRole("article").filter({ hasText: marker })).toBeVisible();

    // Clean up so other runs start from an unpinned feed.
    await pinned.getByRole("article").filter({ hasText: marker }).getByRole("button", { name: "Unpin" }).click();
    await expect(staffPage.getByRole("region", { name: "Pinned" })).toHaveCount(0);
  });

  test("the highlights rail shows the week and 'Say congrats' starts a post", async ({ staffPage }) => {
    await openTimeline(staffPage);
    const rail = staffPage.getByRole("complementary", { name: "Timeline highlights" });
    await expect(rail.getByRole("region", { name: "Your week" })).toBeVisible();
    await expect(rail.getByRole("region", { name: "Coming up" })).toBeVisible();
    await expect(rail.getByRole("region", { name: "Recent wins" })).toBeVisible();
    await expect(rail.getByRole("region", { name: "This week on the timeline" })).toBeVisible();

    // The seed adds the teammate today, so they're "new on the team".
    const celebrate = rail.getByRole("region", { name: "Celebrate" });
    await expect(celebrate).toContainText(DEMO.teammate.name);
    await celebrate.getByRole("button", { name: `Say congrats to ${DEMO.teammate.name}` }).click();
    const composer = staffPage.getByLabel("New timeline post");
    await expect(composer).toHaveValue(`👋 Welcome to the team, @${TEAMMATE_HANDLE}! `);
    await expect(composer).toBeFocused();

    // The rail sits to the right of the feed on a desktop-width screen.
    const railBox = await rail.boundingBox();
    const composerBox = await composer.boundingBox();
    expect(railBox && composerBox && railBox.x > composerBox.x + composerBox.width).toBeTruthy();
  });

  test("the timeline tab is reachable from the dashboard", async ({ staffPage }) => {
    await staffPage.goto("/dashboard");
    await staffPage.getByRole("link", { name: "Timeline" }).click();
    await expect(staffPage).toHaveURL(/\/dashboard\/timeline$/);
    await expect(staffPage.getByLabel("New timeline post")).toBeVisible();
  });
});

test.describe("messaging @mentions (shared picker)", () => {
  test("Enter picks a teammate while the picker is open, then sends", async ({ staffPage }) => {
    const marker = `ping ${Date.now()}`;
    await staffPage.goto("/messages");
    await staffPage.getByRole("button", { name: /Refresh — internal/ }).click();

    const box = staffPage.getByLabel("Message", { exact: true });
    await box.fill(`${marker} `);
    await box.press("End");
    await box.pressSequentially("@e2e_t");
    const picker = staffPage.getByRole("listbox", { name: "Mention a teammate" });
    await expect(picker.getByRole("option", { name: new RegExp(DEMO.teammate.name) })).toBeVisible();

    await box.press("Enter");
    await expect(box).toHaveValue(`${marker} @${TEAMMATE_HANDLE} `);
    await box.press("Enter");
    await expect(box).toHaveValue("");
    await expect(staffPage.getByText(`${marker} @${TEAMMATE_HANDLE}`)).toBeVisible();
  });
});
