export function main(): void;
export function anchorIdToKeyNames(anchorId: string): string[];
export function encodeHashAnchor(anchor: string): string;
export function extractEntriesFromHtml(
  page: string,
  html: string
): Record<
  string,
  {
    type: "key" | "command" | "style";
    signatureHtml: string;
    defaultHtml: string;
    snippetHtml: string;
    page: string;
    anchor: string;
    href: string;
  }
>;
