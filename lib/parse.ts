import "server-only";
import { randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import {
  ALL_CATEGORIES,
  CLOTHING_CATEGORIES,
  NON_CLOTHING_CATEGORIES,
} from "./categories";
import { stripDashes } from "./text";

// Server-only: turns a pasted packing list into structured items via Claude.

const MODEL = "claude-sonnet-4-6";
// Long lists (50+ items) produce a large JSON array; keep this generous so the
// response is never truncated mid-array (which would break JSON parsing).
const MAX_TOKENS = 8192;

export type ClarifyOption = {
  label: string;
  category: string;
  isClothing: boolean;
};

export type ParsedItem = {
  id: string;
  name: string;
  raw: string;
  isClothing: boolean;
  category: string | null;
  quantity: number | null;
  ambiguous: boolean;
  clarifyQuestion: string | null;
  clarifyOptions: ClarifyOption[] | null;
  assumption: string | null;
  canonical_name: string | null;
  leg?: number | null;
};

// Built from the taxonomy so the model can only choose categories that exist.
export const PARSE_SYSTEM_PROMPT = `You parse a messy, pasted packing list into structured, tagged items.

CATEGORY TAXONOMY: you MUST use these exact strings, never invent new ones.

Clothing categories (quantity-tracked):
${CLOTHING_CATEGORIES.map((c) => `- ${c}`).join("\n")}

Non-clothing categories (presence-based, no quantity):
${NON_CLOTHING_CATEGORIES.map((c) => `- ${c}`).join("\n")}

CATEGORY NOTES
- Toiletry bags, wash bags, and makeup bags are "Toiletries", NOT "Bags & luggage". "Bags & luggage" is only for suitcases, rucksacks, holdalls, handbags, and actual luggage, never for containers that hold toiletries.

SPLITTING
- Split the raw text into discrete items. Handle ANY format: bullet points, dashes, checkboxes ("- [ ]", "☐", "✓", "[x]"), commas, the word "and", numbered lists, line breaks, or a mix of these. One logical item per entry.
- Checkbox marks ("- [ ]", "- [x]", "[x]", "☐", "☑", "✓", "✔") are just notes-app formatting. Strip them and ignore them completely: a ticked box does not mean packed, used or anything else.
- Headings and group labels (e.g. "Costa Rica:", "Toiletries", "## Clothes") are not items.
- "+" joining two DISTINCT things means two items: split them. E.g. "Scarf + gloves" -> two items ("scarf", "gloves"); "Toothbrush + toothpaste" -> two items. But "+" that is part of ONE logical item stays as one: "Laptop + charger", "Phone + charger" -> a single item (keep the "+ charger").

MESSY REAL-WORLD ITEMS (never break the JSON over these)
- Items may contain parentheses, brackets, "+" signs, possessives, equals signs, or asides, e.g. "Harry's rucksack (rather than a fancy bag)", "Citadels (=board game)", "Scarf + gloves (just in case)". Always handle them and still emit valid JSON.
- For the display "name", strip parenthetical/bracketed asides where sensible (e.g. "Harry's rucksack (rather than a fancy bag)" -> name "Harry's rucksack"; "Citadels (=board game)" -> name "Citadels"), but keep the full original fragment in "raw".
- Escape any double quotes or backslashes inside string values so the JSON stays valid. Never let an aside, possessive, or stray symbol produce malformed JSON.

PER ITEM, produce:
- name: a cleaned, human-readable display name (strip bullets, checkboxes, counts, and stray punctuation).
- isClothing: true if it is a garment/clothing item, false otherwise.
- category: a category from the EXACT taxonomy above. Clothing items get a clothing category; everything else gets a non-clothing category. Set to null ONLY when the item is ambiguous (see AMBIGUITY).
- canonical_name: the item's generic identity for matching across different people's lists: lowercase, singular, no brands, colours, sizes or descriptive words. E.g. "Flossing sticks" -> "floss", "crystal deodorant" -> "deodorant", "2x merino T-shirts" -> "t-shirt", "Kindle Paperwhite" -> "e-reader", "phone charger" -> "phone charger". Two items that serve the same purpose should share a canonical_name.
- quantity: for clothing only. Parse counts written as "x5", "5", "five", "x 3", "(2)", etc. If a clothing item states no number, default the quantity to 1. Non-clothing items have quantity null.

LOCALE INFERENCE
- Infer British vs American English from spelling across the WHOLE list (e.g. colour/color, favourite/favorite, "jumper", "trainers", "trousers", "nappy"). Use that inference to disambiguate region-dependent words.
  - "pants" on a British-spelling list = trousers (Bottoms); on an American-spelling list = underwear (Knickers).
  - "vest" on a British list = undershirt (Base layers / thermals); on an American list = a waistcoat/gilet (Outerwear).
- When you rely on such an inference, record a short note in the item's "assumption" field, e.g. "read as trousers (British spelling elsewhere)".

AMBIGUITY
- If you are under ~70% confident what an item is (a genuine 50/50, e.g. "pants" with no locale signal anywhere, "jumper", "vest", or an entry you cannot recognise), mark it ambiguous:
  - set category to null
  - set ambiguous to true
  - write a short, plain-English clarifyQuestion, e.g. "When you say 'pants', do you mean trousers or underwear?"
  - give 2-4 clarifyOptions, each { label, category, isClothing }, mapping each answer to a real category from the taxonomy. Order them most likely first.
- Only do this when genuinely unsure. Otherwise prefer a confident best guess plus an "assumption" note.

ASSUMPTION
- assumption: a short note when you made a non-obvious inference (locale disambiguation, an unusual abbreviation, a guessed category), else null.

WRITING STYLE (applies to assumption, clarifyQuestion, and every other field of generated copy)
- Write in British English throughout (spelling, vocabulary, and phrasing).
- NEVER use an em dash (—) or an en dash (–) anywhere in the text you generate. Use a full stop, a semicolon, or a comma instead. This applies to every generated copy field without exception.

OUTPUT: STRICT JSON ONLY. Output a single JSON array and nothing else: no markdown, no code fences, no preamble, no trailing commentary. Each element MUST be exactly:
{
  "name": string,
  "raw": string,
  "isClothing": boolean,
  "category": string | null,
  "quantity": number | null,
  "ambiguous": boolean,
  "clarifyQuestion": string | null,
  "clarifyOptions": [{ "label": string, "category": string, "isClothing": boolean }] | null,
  "assumption": string | null,
  "canonical_name": string,
  "leg": number | null
}
- "raw" is the original text fragment the item came from.
- For non-ambiguous items: ambiguous=false, clarifyQuestion=null, clarifyOptions=null.
- For ambiguous items: category=null, quantity=null, ambiguous=true, with clarifyQuestion and clarifyOptions populated.

LEGS
- If the message starts with a LEGS block listing the trip's destinations by number, set "leg" to a destination's number ONLY when the list clearly ties the item to that destination: it sits under a heading naming it (e.g. "Costa Rica:" then items), or has a note next to it (e.g. "snorkel (for CR)", "suit - wedding in Lisbon"). Everything else, including anything you're unsure about, gets leg null (it's for the whole trip).
- Without a LEGS block, "leg" is always null.`;

// Thrown with a user-facing message; `status` is a suggested HTTP status.
export class ParseError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}

// Models occasionally wrap JSON in ```json fences despite instructions; strip
// a single leading/trailing fence defensively before parsing.
export function stripFences(raw: string): string {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }
  return text;
}

// Parse the model's text into an array of items, tolerantly: strip fences, try a
// straight parse, then recover by slicing from the first "[" to the last "]"
// (handles stray leading/trailing prose). Returns null if nothing parses.
export function parseItemArray(raw: string): unknown[] | null {
  const text = stripFences(raw);

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // fall through to recovery
  }

  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // give up below
    }
  }

  return null;
}

// `legs` names the trip's destinations in order, so items the list clearly
// groups under one can be tagged to it.
export async function parsePackingList(
  text: string,
  opts: { legs?: string[] } = {},
): Promise<ParsedItem[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ParseError("The parser isn't configured yet (missing API key).");
  }
  if (!text.trim()) {
    throw new ParseError("Paste a list first.", 400);
  }

  const client = new Anthropic({ apiKey });

  let rawText: string;
  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: PARSE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content:
            opts.legs && opts.legs.length > 1
              ? `LEGS\n${opts.legs.map((l, i) => `${i}: ${l}`).join("\n")}\n\nLIST\n${text}`
              : text,
        },
      ],
    });

    const textBlock = message.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    if (!textBlock) {
      throw new ParseError(
        "The parser returned an unexpected response. Try again.",
      );
    }
    rawText = textBlock.text;
  } catch (err) {
    if (err instanceof ParseError) throw err;
    throw new ParseError(
      "The parser is unavailable right now. Try again in a moment.",
    );
  }

  const parsed = parseItemArray(rawText);
  if (!parsed) {
    throw new ParseError(
      "Couldn't read the parsed list - it may have been very long. Your text is still here; try parsing again, or split a very long list and parse it in parts.",
    );
  }

  // Assign a stable, server-generated id to each item.
  return parsed.map((item) => ({
    id: randomUUID(),
    ...stripDashes(item as Omit<ParsedItem, "id">),
  }));
}

// A parsed item ready to store. Ambiguous items take the most likely reading
// (the parser lists clarifyOptions most likely first).
export type ResolvedItem = {
  name: string;
  category: string;
  quantity: number;
  canonical_name: string;
  leg: number | null; // index into the legs passed to parsePackingList
};

export function resolveParsedItem(item: ParsedItem): ResolvedItem | null {
  const name = (item.name ?? "").trim();
  if (!name) return null;
  const option = item.category == null ? item.clarifyOptions?.[0] : null;
  const guess = item.category ?? option?.category;
  const category =
    guess && (ALL_CATEGORIES as readonly string[]).includes(guess) ? guess : "Other";
  const quantity =
    typeof item.quantity === "number" && item.quantity >= 1
      ? Math.round(item.quantity)
      : 1;
  const canonical_name = normaliseCanonical(item.canonical_name || name);
  const leg = typeof item.leg === "number" && Number.isInteger(item.leg) ? item.leg : null;
  return { name, category, quantity, canonical_name, leg };
}

export function normaliseCanonical(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
