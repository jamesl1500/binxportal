/**
 * PhotosForm.tsx
 *
 * The signed-in user's avatar and cover image — uploaded straight to their
 * own actions via ImageUploadField, the same reusable component agency
 * branding uses.
 *
 * @module apps/binx-web/src/components/forms/account/PhotosForm/PhotosForm.tsx
 * @author Binx.io
 */
"use client";

import { removeUserImageAction, uploadUserImageAction } from "@/app/(app)/profile/actions";
import type { UserProfileData } from "@/lib/users";
import { userImageUrl } from "@/lib/users-client";
import ImageUploadField from "@/components/forms/agency/ImageUploadField/ImageUploadField";

import styles from "./PhotosForm.module.scss";

interface PhotosFormProps {
  profile: UserProfileData;
}

const PhotosForm = ({ profile }: PhotosFormProps) => {
  return (
    <div className={styles.wrapper}>
      <ImageUploadField
        label="Profile picture"
        hint="Square works best. Shows next to your name across the app."
        hasImage={profile.has_avatar}
        imageUrl={userImageUrl("avatar", profile.avatar_version)}
        aspect="square"
        onUpload={(file) => {
          const formData = new FormData();
          formData.append("file", file);
          return uploadUserImageAction("avatar", formData);
        }}
        onRemove={() => removeUserImageAction("avatar")}
      />
      <ImageUploadField
        label="Cover image"
        hint="A wide banner shown at the top of your teammate profile."
        hasImage={profile.has_cover}
        imageUrl={userImageUrl("cover", profile.cover_version)}
        aspect="wide"
        onUpload={(file) => {
          const formData = new FormData();
          formData.append("file", file);
          return uploadUserImageAction("cover", formData);
        }}
        onRemove={() => removeUserImageAction("cover")}
      />
    </div>
  );
};

export default PhotosForm;
