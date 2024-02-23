import type { Id } from "@/convex/_generated/dataModel";

export type SearchResult = {
  id: Id<"finalizedSentences">;
  meetingID: Id<"meetings">;
  score: number;
  searchInput?: string;
};

export type Meeting = {
  duration: number;
  isDeleted: boolean;
  isFavorite: boolean;
  title: string;
  userId: string;
  _creationTime: number;
  _id: string;
};

export type ClerkUser = {
  id: string;
  object?: string;
  external_id?: string | null;
  primary_email_address_id?: string | null;
  primary_phone_number_id?: string | null;
  primary_web3_wallet_id?: string | null;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  image_url: string;
  has_image: boolean;
  email_addresses: ClerkUserEmailAddress[];
  last_sign_in_at?: number | null;
  last_active_at?: number | null;
  created_at: number;
  updated_at?: number;
  banned?: boolean;
  locked?: boolean;
  lockout_expires_in_seconds?: number | null;
  verification_attempts_remaining?: number | null;
  delete_self_enabled?: boolean;
  create_organization_enabled?: boolean;
};

type ClerkUserEmailAddress = {
  id: string;
  email_address: string; // This field holds the actual email address
  verification: {
    status: string;
    strategy: string;
  };
};
