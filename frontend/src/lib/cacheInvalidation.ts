import type { QueryClient } from "@tanstack/react-query";

export const invalidate = {

  profile: (qc: QueryClient) => {
    qc.invalidateQueries({ queryKey: ["/api/dashboard/profile"] });
    qc.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
  },

  sessions: (qc: QueryClient) => {
    qc.invalidateQueries({ queryKey: ["/api/dashboard/sessions"] });
    qc.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
  },

  availability: (qc: QueryClient) => {
    qc.invalidateQueries({ queryKey: ["/api/dashboard/availability"] });
    qc.invalidateQueries({ queryKey: ["/api/dashboard/blocked-dates"] });
    qc.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
  },

  events: (qc: QueryClient) => {
    qc.invalidateQueries({ queryKey: ["/api/dashboard/events"] });
    qc.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
  },

  products: (qc: QueryClient) => {
    qc.invalidateQueries({ queryKey: ["/api/dashboard/products"] });
    qc.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
  },

  blog: (qc: QueryClient) => {
    qc.invalidateQueries({ queryKey: ["/api/dashboard/blog"] });
    qc.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
  },

  locations: (qc: QueryClient) => {
    qc.invalidateQueries({ queryKey: ["/api/locations"] });
    qc.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
  },

  tags: (qc: QueryClient) => {
    qc.invalidateQueries({ queryKey: ["/api/dashboard/profile/tags"] });
    qc.invalidateQueries({ queryKey: ["/api/dashboard/profile/consolidated-tags"] });
    qc.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
  },

  bookings: (qc: QueryClient, guestAccessToken?: string) => {
    qc.invalidateQueries({ queryKey: ["/api/dashboard/bookings"] });
    if (guestAccessToken) {
      qc.invalidateQueries({ queryKey: [`/api/guest/${guestAccessToken}`] });
    }
  },

  wallet: (qc: QueryClient) => {
    qc.invalidateQueries({ queryKey: ["/api/dashboard/wallet/summary"] });
    qc.invalidateQueries({ queryKey: ["/api/dashboard/wallet/transactions"] });
    qc.invalidateQueries({ queryKey: ["/api/dashboard/wallet/stripe-account"] });
  },

};
