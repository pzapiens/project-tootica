import type { Metadata } from "next";

import ProfileClient from "./ProfileClient";

export const metadata: Metadata = {
  title: "Profile — Tootica",
};

/**
 * Profile Settings (Figma "Profile"), reached from the sidebar account dropdown →
 * Profile. An avatar card, a Personal Information form (name / specialized field /
 * phone / email → Save Changes), a Reset Your Password form, and Delete Account /
 * Log Out cards. State lives in ProfileClient.
 */
export default function ProfilePage() {
  return <ProfileClient />;
}
