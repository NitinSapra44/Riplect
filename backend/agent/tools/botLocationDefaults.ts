// Default location stamped on every record the WhatsApp bot creates
// (profiles, events, sessions). Every bot-onboarded creator is currently
// based in Dharamshala — until we have a per-creator capture flow, hard-coding
// here keeps the homepage city filter functional for bot-created listings.
export const BOT_DEFAULT_CITY = "Dharamshala";
export const BOT_DEFAULT_STATE = "Himachal Pradesh";
export const BOT_DEFAULT_COUNTRY = "India";
export const BOT_DEFAULT_SEARCHABLE_LOCATION = `${BOT_DEFAULT_CITY}, ${BOT_DEFAULT_STATE}, ${BOT_DEFAULT_COUNTRY}`;
