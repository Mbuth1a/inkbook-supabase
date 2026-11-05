import AdminHeader from "@/components/admin/AdminHeader";
import GalleryManager from "@/components/admin/GalleryManager";
import { requireAdminPage } from "@/lib/adminGuard";
import { galleryStyles, listGalleryForAdmin } from "@/lib/gallery";

export const dynamic = "force-dynamic";

export default async function GalleryAdmin() {
  await requireAdminPage();
  const items = await listGalleryForAdmin();
  return (
    <>
      <AdminHeader />
      <main className="ad-main">
        <h1>Gallery</h1>
        <p className="ad-sub">Photos you add here go straight onto the public portfolio. Phone photos are shrunk and location data is removed automatically.</p>
        <GalleryManager styles={galleryStyles} items={items} />
      </main>
    </>
  );
}
