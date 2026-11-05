import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { clearTestRows, TAG } from "./support.ts";

const { addGalleryItem, updateGalleryItem, listHomeGallery, listGalleryPage, listGalleryForAdmin, deleteGalleryItem, galleryStyles, GALLERY_FILE } = await import("../lib/gallery.ts");

before(clearTestRows);
after(clearTestRows);

// Adds n TEST photos. Each gets a later timestamp, so the last one is the newest in the gallery.
async function seed(n: number, styleName = galleryStyles[0]) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const id = randomUUID();
    out.push(
      await addGalleryItem(`${id}.webp`, `${id}.thumb.webp`, 1600, 1000,
        { style: styleName, state: "Fresh", alt: `${TAG}piece ${i}` }, Date.now() + i)
    );
  }
  return out;
}

test("the home page shows the newest photo first when nothing is featured", async (t) => {
  const anyFeatured = (await listGalleryForAdmin()).some((i) => i.featured);
  if (anyFeatured) return t.skip("the live gallery already has featured photos");
  const seeded = await seed(3);
  const home = await listHomeGallery();
  assert.equal(home[0].alt, `${TAG}piece 2`, "newest TEST photo is first");
  assert.ok(home.length <= 12);
  assert.ok(seeded.length === 3);
});

test("featuring a photo marks it, and unfeaturing clears it", async () => {
  const [item] = await seed(1);
  await updateGalleryItem(item.id, { style: item.style, state: item.state, alt: item.alt, featured: true });
  assert.equal((await listGalleryForAdmin()).find((i) => i.id === item.id)!.featured, true);
  await updateGalleryItem(item.id, { style: item.style, state: item.state, alt: item.alt, featured: false });
  assert.equal((await listGalleryForAdmin()).find((i) => i.id === item.id)!.featured, false);
});

test("the full gallery loads in pages and reports whether more exist", async () => {
  await seed(3);
  const first = await listGalleryPage({ limit: 24 });
  assert.equal(first.items.length, Math.min(24, first.total));
  assert.equal(first.hasMore, first.total > 24);
  const rest = await listGalleryPage({ offset: 24, limit: 24 });
  assert.equal(rest.items.length, Math.max(0, Math.min(24, first.total - 24)));
});

test("style filters only return that style, and unknown styles are ignored", async () => {
  if (galleryStyles.length < 2) return;
  await seed(2, galleryStyles[1]);
  const only = await listGalleryPage({ style: galleryStyles[1] });
  assert.ok(only.total >= 2);
  assert.ok(only.items.every((i) => i.style === galleryStyles[1]));
  assert.equal((await listGalleryPage({ style: "Not a style" })).total, (await listGalleryPage({})).total, "unknown style falls back to all photos");
});

test("items expose a thumbnail, and deleting removes both files", async () => {
  const [item] = await seed(1);
  assert.match(item.thumbSrc, /\.thumb\.webp$/);
  assert.match(item.src, /^\/api\/gallery\/[0-9a-f-]+\.webp$/);
  const files = await deleteGalleryItem(item.id);
  assert.equal(files?.length, 2);
  assert.equal(await deleteGalleryItem(item.id), null, "a second delete finds nothing");
});

test("only real gallery file names are served publicly", () => {
  assert.ok(GALLERY_FILE.test(`${randomUUID()}.webp`));
  assert.ok(GALLERY_FILE.test(`${randomUUID()}.thumb.webp`));
  assert.ok(!GALLERY_FILE.test("../secret.webp"));
  assert.ok(!GALLERY_FILE.test(`${randomUUID()}.jpg`));
});
