import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import {
  ALL_CATEGORIES,
  CLOTHING_CATEGORIES,
  NON_CLOTHING_CATEGORIES,
} from "./categories";
import { stripDashes } from "./text";

// Server-only: turns a pasted packing list into structured items via Claude.

const MODEL = "claude-sonnet-4-6";
// Generous so long lists are never cut off mid-array.
const MAX_TOKENS = 32000;

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

MESSY REAL-WORLD ITEMS
- Items may contain parentheses, brackets, "+" signs, possessives, equals signs, or asides, e.g. "Harry's rucksack (rather than a fancy bag)", "Citadels (=board game)", "Scarf + gloves (just in case)".
- For the display "name", strip parenthetical/bracketed asides where sensible (e.g. "Harry's rucksack (rather than a fancy bag)" -> name "Harry's rucksack"; "Citadels (=board game)" -> name "Citadels").

PER ITEM, produce:
- name: a cleaned, human-readable display name (strip bullets, checkboxes, counts, and stray punctuation).
- category: a category from the EXACT taxonomy above. Clothing items get a clothing category; everything else gets a non-clothing category.
- canonical_name: the item's generic identity for matching across different people's lists: lowercase, singular, no brands, colours, sizes or descriptive words. E.g. "Flossing sticks" -> "floss", "crystal deodorant" -> "deodorant", "2x merino T-shirts" -> "t-shirt", "Kindle Paperwhite" -> "e-reader", "phone charger" -> "phone charger". Two items that serve the same purpose should share a canonical_name.
- quantity: parse counts written as "x5", "5", "five", "x 3", "(2)", etc. If no number is given, 1.
- leg: see LEGS.

LOCALE INFERENCE
- Infer British vs American English from spelling across the WHOLE list (e.g. colour/color, favourite/favorite, "jumper", "trainers", "trousers", "nappy"). Use that inference to disambiguate region-dependent words.
  - "pants" on a British-spelling list = trousers (Bottoms); on an American-spelling list = underwear (Knickers).
  - "vest" on a British list = undershirt (Base layers / thermals); on an American list = a waistcoat/gilet (Outerwear).

AMBIGUITY
- If you are unsure what an item is (e.g. "pants" with no locale signal anywhere, or an entry you cannot recognise), pick the most likely reading and its category. If you cannot place it at all, use "Other".

WRITING STYLE
- Write names in British English.
- NEVER use an em dash (—) or an en dash (–) anywhere. Use a comma instead.

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

// Only what gets stored, so even 100+ item lists stay well within the output
// budget. Structured outputs guarantee valid JSON matching this shape.
const ParsedListSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      category: z.enum(ALL_CATEGORIES),
      quantity: z.number().int(),
      canonical_name: z.string(),
      leg: z.number().int().nullable(),
    }),
  ),
});

// A parsed item ready to store.
export type ResolvedItem = {
  name: string;
  category: string;
  quantity: number;
  canonical_name: string;
  leg: number | null; // index into the legs passed to parsePackingList
};

// `legs` names the trip's destinations in order, so items the list clearly
// groups under one can be tagged to it.
export async function parsePackingList(
  text: string,
  opts: { legs?: string[] } = {},
): Promise<ResolvedItem[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ParseError("The parser isn't configured yet (missing API key).");
  }
  if (!text.trim()) {
    throw new ParseError("Paste a list first.", 400);
  }

  const client = new Anthropic({ apiKey });

  let message: Anthropic.Message;
  try {
    // Streamed so a long list never hits a request timeout.
    message = await client.messages
      .stream({
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
        output_config: { format: zodOutputFormat(ParsedListSchema) },
      })
      .finalMessage();
  } catch (err) {
    console.error("Parser request failed", err);
    throw new ParseError("The parser is unavailable right now. Try again in a moment.");
  }

  if (message.stop_reason === "max_tokens") {
    throw new ParseError(
      "That list is too long to read in one go. Split it in two and add each part.",
      422,
    );
  }
  if (message.stop_reason === "refusal") {
    throw new ParseError("The parser couldn't read that list. Try rewording it.", 422);
  }

  const textBlock = message.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  let parsed: z.infer<typeof ParsedListSchema>;
  try {
    parsed = ParsedListSchema.parse(JSON.parse(textBlock?.text ?? ""));
  } catch (err) {
    console.error("Parser returned unreadable output", err, textBlock?.text?.slice(0, 500));
    throw new ParseError("The parser returned something unreadable. Try again.");
  }

  return stripDashes(parsed.items).flatMap((item) => {
    const name = item.name.trim();
    if (!name) return [];
    return [
      {
        name,
        category: item.category,
        quantity: item.quantity >= 1 ? item.quantity : 1,
        canonical_name: normaliseCanonical(item.canonical_name || name),
        leg: item.leg,
      },
    ];
  });
}

export function normaliseCanonical(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
