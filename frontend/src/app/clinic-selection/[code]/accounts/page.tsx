import type { Metadata } from "next";

import AccountsClient from "./AccountsClient";

export const metadata: Metadata = {
  title: "Accounts — Tootica",
};

/**
 * Accounts Management (Figma "Accounts"), reached from the sidebar account
 * dropdown → Accounts (admins only). Lists the clinic's accounts in a table and
 * lets an admin edit a profile, reset a password, disable/enable, or delete an
 * account via a per-row actions menu. State lives in AccountsClient.
 */
export default function AccountsPage() {
  return <AccountsClient />;
}
