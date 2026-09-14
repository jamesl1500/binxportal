/**
 * page.tsx - Profile · Photos
 *
 * Lets the signed-in user upload a profile picture and cover image. Auth is
 * guarded by the layout above; this page only needs the profile data.
 *
 * @module apps/binx-web/src/app/(app)/profile/photos/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";

import { getUserProfile } from "@/lib/users";
import PhotosForm from "@/components/forms/account/PhotosForm/PhotosForm";

export const metadata: Metadata = { title: "Photos" };

const PhotosPage = async () => {
  const profile = await getUserProfile();

  return <PhotosForm profile={profile} />;
};

export default PhotosPage;
