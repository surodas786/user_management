const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "long",
  timeZone: "UTC",
});

/** Fixed locale and zone so server and browser render the same text. */
export function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}
