const PREVIEW_LENGTH = 140;

/** Private text meant for this user from someone else; private roll results are left to the chat itself. */
export function isIncomingPrivateMessage(message: { whisper?: string[]; isAuthor?: boolean; isRoll?: boolean }, userId: string): boolean {
  return Array.isArray(message.whisper) && message.whisper.includes(userId) && message.isAuthor !== true && message.isRoll !== true;
}

/** Plain text of the message body; parsing in an inert document never runs scripts nor loads images. */
export function messagePreview(content: unknown): string {
  if (typeof content !== "string" || content.length === 0) return "";
  const body = new DOMParser().parseFromString(content, "text/html").body;
  for (const hidden of Array.from(body.querySelectorAll("script, style, template"))) hidden.remove();
  return shortenPreview(body.textContent ?? "");
}

export function shortenPreview(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > PREVIEW_LENGTH ? `${compact.slice(0, PREVIEW_LENGTH - 1)}…` : compact;
}
