import "server-only";
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { isBaselineItem } from "./baseline";
import { ALL_CATEGORIES, isClothingCategory } from "./categories";
import { sql } from "./db";
import { clothingFloor } from "./floors";
import { normaliseCanonical } from "./parse";
import { stripDashes } from "./text";
import {
  MONTH_NAMES,
  sentenceCase,
  type Item,
  type Leg,
  type LegSuggestions,
  type Suggestion,
  type SuggestionSource,
} from "./trip-fields";

const MODEL = "claude-sonnet-4-6";

// Thresholds. Tune here.
const OTHERS_MIN_USERS = 3;
const USED_SHARE = 0.4; // used by 40%+ of pool lists -> might have forgotten
const WISHED_SHARE = 0.2; // wished by 20%+ -> might have forgotten
const UNNEEDED_SHARE = 0.5; // didn't need for half+ of those who packed it
const RARE_SHARE = 0.2; // packed by under 20% of others -> might not need
const CLOTHING_MEDIAN_RATIO = 2;
const MAX_FORGOTTEN = 10;
const MAX_NOT_NEEDED = 10;
const CLAUDE_MAX_FORGOTTEN = 8;
const CLAUDE_MAX_UNNECESSARY = 5;

// Item-level aggregates over a pool of other lists. Never carries identities:
// only counts of lists and distinct people, computed inside Postgres.
type ItemAggregate = {
  canonical_name: string;
  category: string | null;
  packed: number; // lists that packed it
  used: number; // lists that packed it and didn't mark it didn't need
  unneeded: number; // lists that marked it didn't need
  wished: number; // lists that wished they'd brought it
  median_per_night: number | null; // clothing quantity per night, packed lists
};

type Pool = {
  source: SuggestionSource;
  lists: number;
  users: number;
  items: Map<string, ItemAggregate>;
};

type PoolQuery = {
  tripId: string;
  userId: string;
  own: boolean;
} & (
  | { byPlace: true; locationKey: string; month: number }
  | { byPlace: false; vibe: string; climateBand: string }
);

// One pool of lists, aggregated per canonical item. A list is a leg; its items
// are its trip's items tagged to it or to all legs. The current trip is never
// in its own pool. Own pools are the user's other legs; others' pools exclude
// the user entirely.
async function loadPool(q: PoolQuery, source: SuggestionSource): Promise<Pool> {
  const locationKey = q.byPlace ? q.locationKey : null;
  const month = q.byPlace ? q.month : null;
  const vibe = q.byPlace ? null : q.vibe;
  const band = q.byPlace ? null : q.climateBand;

  const [row] = await sql`
    with pool_legs as (
      select l.id as leg_id, l.trip_id, greatest(coalesce(l.nights, 1), 1) as nights, t.user_id
      from op_legs l
      join op_trips t on t.id = l.trip_id
      where l.trip_id <> ${q.tripId}
        and case when ${q.own}::boolean
          then t.user_id = ${q.userId}
          else t.user_id <> ${q.userId} end
        and case when ${q.byPlace}::boolean
          then l.location_key = ${locationKey}
            and l.month is not null
            and least(abs(l.month - ${month}::int), 12 - abs(l.month - ${month}::int)) <= 1
          else l.vibe = ${vibe} and l.climate_band = ${band} end
        and exists (select 1 from op_items i where i.trip_id = l.trip_id)
    ),
    per_list as (
      select
        pl.leg_id,
        i.canonical_name,
        min(i.category) as category,
        bool_or(i.status in ('neutral', 'glad', 'unneeded')) as packed,
        bool_or(i.status in ('neutral', 'glad')) as used,
        bool_or(i.status = 'unneeded') and not bool_or(i.status in ('neutral', 'glad')) as unneeded,
        bool_or(i.status = 'wished') as wished,
        sum(case when i.status <> 'wished' then coalesce(i.quantity, 1) else 0 end)::float
          / min(pl.nights) as per_night
      from pool_legs pl
      join op_items i on i.trip_id = pl.trip_id and (i.leg_id is null or i.leg_id = pl.leg_id)
      where i.canonical_name is not null
      group by pl.leg_id, i.canonical_name
    )
    select
      (select count(*) from pool_legs)::int as lists,
      (select count(distinct user_id) from pool_legs)::int as users,
      coalesce((
        select json_agg(a) from (
          select
            canonical_name,
            mode() within group (order by category) as category,
            count(*) filter (where packed)::int as packed,
            count(*) filter (where used)::int as used,
            count(*) filter (where unneeded)::int as unneeded,
            count(*) filter (where wished)::int as wished,
            percentile_cont(0.5) within group (order by per_night)
              filter (where packed) as median_per_night
          from per_list
          group by canonical_name
        ) a
      ), '[]'::json) as items
  `;

  const items = new Map<string, ItemAggregate>();
  for (const agg of row.items as ItemAggregate[]) items.set(agg.canonical_name, agg);
  return { source, lists: row.lists as number, users: row.users as number, items };
}

// The leg's own items: tagged to it or to all legs.
function legItems(items: Item[], leg: Leg): Item[] {
  return items.filter((i) => i.leg_id == null || i.leg_id === leg.id);
}

function canonicalOf(item: Item): string {
  return normaliseCanonical(item.canonical_name || item.name);
}

type Scored = Suggestion & { score: number };

function forgottenFrom(pool: Pool, have: Set<string>): Scored[] {
  const out: Scored[] = [];
  for (const agg of pool.items.values()) {
    if (have.has(agg.canonical_name)) continue;
    const usedShare = agg.used / pool.lists;
    const wishedShare = agg.wished / pool.lists;
    const qualifies =
      (pool.source === "own" && agg.wished > 0) ||
      usedShare >= USED_SHARE ||
      wishedShare >= WISHED_SHARE;
    if (!qualifies) continue;
    out.push({
      canonical_name: agg.canonical_name,
      name: sentenceCase(agg.canonical_name),
      category: agg.category ?? "Other",
      source: pool.source,
      // Wishes weigh double: someone actually missed it.
      score: Math.max(usedShare, Math.min(1, wishedShare * 2)) + (agg.wished > 0 ? 0.25 : 0),
    });
  }
  return out;
}

function notNeededFrom(pool: Pool, packed: Item[], nights: number): Scored[] {
  const out: Scored[] = [];
  const byCanonical = new Map<string, Item[]>();
  for (const item of packed) {
    const key = canonicalOf(item);
    byCanonical.set(key, [...(byCanonical.get(key) ?? []), item]);
  }

  for (const [canonical, group] of byCanonical) {
    const first = group[0];
    if (isBaselineItem(first.name) || isBaselineItem(canonical)) continue;
    // Already reviewed by the user: leave it alone.
    if (group.some((i) => i.status !== "neutral")) continue;

    const agg = pool.items.get(canonical);
    let score = 0;

    if (agg && agg.packed > 0 && agg.unneeded / agg.packed >= UNNEEDED_SHARE) {
      score = agg.unneeded / agg.packed;
    }

    if (isClothingCategory(first.category)) {
      const quantity = group.reduce((sum, i) => sum + i.quantity, 0);
      const floor = clothingFloor(first.category);
      const median = agg?.median_per_night ?? null;
      if (
        median != null &&
        median > 0 &&
        (floor == null || quantity > floor) &&
        quantity / Math.max(nights, 1) > CLOTHING_MEDIAN_RATIO * median
      ) {
        score = Math.max(score, 0.6);
      }
    } else if (pool.source === "others") {
      const share = (agg?.packed ?? 0) / pool.lists;
      if (share < RARE_SHARE) score = Math.max(score, 0.5 + (RARE_SHARE - share));
    }

    if (score > 0) {
      out.push({
        canonical_name: canonical,
        name: first.name,
        category: first.category,
        source: pool.source,
        score,
      });
    }
  }
  return out;
}

// Merge by canonical name: highest score wins, but "Your past trips" beats
// "Other travellers" beats "Idea" as the shown source.
const SOURCE_RANK: Record<SuggestionSource, number> = { own: 0, others: 1, claude: 2 };

function mergeTop(lists: Scored[][], max: number): Suggestion[] {
  const best = new Map<string, Scored>();
  for (const s of lists.flat()) {
    const prev = best.get(s.canonical_name);
    if (!prev) {
      best.set(s.canonical_name, s);
      continue;
    }
    best.set(s.canonical_name, {
      ...(SOURCE_RANK[s.source] < SOURCE_RANK[prev.source] ? s : prev),
      score: Math.max(s.score, prev.score),
    });
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((s) => ({
      canonical_name: s.canonical_name,
      name: s.name,
      category: s.category,
      source: s.source,
    }));
}

// ---------------------------------------------------------------------------
// Claude fallback, cached per leg by a hash of the leg's canonical names.

const ClaudeSuggestionsSchema = z.object({
  forgotten: z.array(
    z.object({
      name: z.string(),
      category: z.enum(ALL_CATEGORIES),
      canonical_name: z.string(),
    }),
  ),
  unnecessary: z.array(z.string()),
});
type ClaudeSuggestions = z.infer<typeof ClaudeSuggestionsSchema>;

const CLAUDE_SYSTEM = `You help someone review a packing list for one leg of a trip.

Given the destination, vibe, month, weather and the current list, return:
- forgotten: up to ${CLAUDE_MAX_FORGOTTEN} items they are likely to have forgotten and would genuinely miss, most important first. Each has a short display name in sentence case, a category from the taxonomy, and a canonical_name (lowercase, singular, generic, no brands, e.g. "floss", "deodorant", "rain jacket"). Never suggest something already on the list under any name, or a variant, upgrade or extra of it (no "reef-safe sunscreen" when sun cream is listed, no "extra swimwear" when a swimsuit is listed).
- unnecessary: up to ${CLAUDE_MAX_UNNECESSARY} items from the current list that look unnecessary for this leg, most clearly unnecessary first. Return their canonical_name exactly as given in the list. Never include everyday essentials such as toothbrush, phone, charger, medication, passport or wallet. Return an empty array if nothing stands out.

Use gender-neutral names (e.g. "Underwear", not "Knickers") and never assume the person's gender. Write in British English. NEVER use an em dash (—) or an en dash (–).`;

function hashCanonicals(items: Item[]): string {
  const names = [...new Set(items.map(canonicalOf))].sort();
  return createHash("sha256").update(JSON.stringify(names)).digest("hex");
}

async function claudeSuggestions(
  leg: Leg,
  items: Item[],
): Promise<ClaudeSuggestions | null> {
  const hash = hashCanonicals(items);
  const [cached] = await sql`
    select claude_suggestions, claude_suggestions_hash from op_legs where id = ${leg.id}
  `;
  if (cached?.claude_suggestions_hash === hash && cached.claude_suggestions) {
    const parsed = ClaudeSuggestionsSchema.safeParse(cached.claude_suggestions);
    if (parsed.success) return parsed.data;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const list = items
    .map(
      (i) =>
        `- ${i.name}${i.quantity > 1 ? ` x${i.quantity}` : ""} (category: ${i.category}; canonical_name: ${canonicalOf(i)}${i.status === "wished" ? "; wished they had brought it" : ""})`,
    )
    .join("\n");
  const when = leg.month ? MONTH_NAMES[leg.month - 1] : "unknown month";
  const prompt = `Destination: ${leg.city ?? "unknown"}, ${leg.country ?? "unknown"}
Vibe: ${leg.vibe ?? "unknown"}
Month: ${when}${leg.nights != null ? `, ${leg.nights} nights` : ""}
Weather: ${leg.climate_summary ?? "unknown"}

Category taxonomy: ${ALL_CATEGORIES.join(", ")}

Current list:
${list || "(empty)"}`;

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.parse({
      model: MODEL,
      max_tokens: 2048,
      system: CLAUDE_SYSTEM,
      messages: [{ role: "user", content: prompt }],
      output_config: { format: zodOutputFormat(ClaudeSuggestionsSchema) },
    });
    if (!message.parsed_output) return null;
    const result = stripDashes(message.parsed_output);
    await sql`
      update op_legs
      set claude_suggestions = ${JSON.stringify(result)}::jsonb,
          claude_suggestions_hash = ${hash}
      where id = ${leg.id}
    `;
    return result;
  } catch (err) {
    console.error("Claude suggestions failed", { legId: leg.id }, err);
    return null;
  }
}

function fromClaude(result: ClaudeSuggestions, legSet: Item[]) {
  const have = new Set(legSet.map(canonicalOf));
  const byCanonical = new Map(legSet.map((i) => [canonicalOf(i), i]));

  const forgotten: Scored[] = result.forgotten
    .map((f) => ({ ...f, canonical_name: normaliseCanonical(f.canonical_name) }))
    .filter((f) => f.canonical_name && !have.has(f.canonical_name))
    .slice(0, CLAUDE_MAX_FORGOTTEN)
    .map((f, i) => ({
      canonical_name: f.canonical_name,
      name: f.name,
      category: f.category,
      source: "claude" as const,
      score: 0.3 - i * 0.01, // below pool evidence, in Claude's order
    }));

  const notNeeded: Scored[] = [];
  for (const [i, raw] of result.unnecessary.slice(0, CLAUDE_MAX_UNNECESSARY).entries()) {
    const item = byCanonical.get(normaliseCanonical(raw));
    if (!item || item.status === "wished" || item.status !== "neutral") continue;
    if (isBaselineItem(item.name) || isBaselineItem(normaliseCanonical(raw))) continue;
    notNeeded.push({
      canonical_name: normaliseCanonical(raw),
      name: item.name,
      category: item.category,
      source: "claude",
      score: 0.3 - i * 0.01,
    });
  }
  return { forgotten, notNeeded };
}

// ---------------------------------------------------------------------------

async function suggestionsForLeg(
  tripId: string,
  userId: string,
  leg: Leg,
  items: Item[],
): Promise<LegSuggestions> {
  const set = legItems(items, leg);
  const have = new Set(set.map(canonicalOf));
  const packed = set.filter((i) => i.status !== "wished");
  const nights = leg.nights ?? 1;

  const byPlace =
    leg.location_key && leg.month != null
      ? { byPlace: true as const, locationKey: leg.location_key, month: leg.month }
      : null;
  const byVibe =
    leg.vibe && leg.climate_band
      ? { byPlace: false as const, vibe: leg.vibe, climateBand: leg.climate_band }
      : null;

  const pools: Pool[] = [];

  // a. Own history, same place and season. Unlocks at one leg.
  if (byPlace) {
    const own = await loadPool({ tripId, userId, own: true, ...byPlace }, "own");
    if (own.lists >= 1) pools.push(own);
  }

  // b. Others, same place and season; c. others, same vibe and climate band,
  // only if b isn't unlocked. Each unlocks at three distinct people.
  let othersUnlocked = false;
  if (byPlace) {
    const place = await loadPool({ tripId, userId, own: false, ...byPlace }, "others");
    if (place.users >= OTHERS_MIN_USERS) {
      pools.push(place);
      othersUnlocked = true;
    }
  }
  if (!othersUnlocked && byVibe) {
    const vibe = await loadPool({ tripId, userId, own: false, ...byVibe }, "others");
    if (vibe.users >= OTHERS_MIN_USERS) {
      pools.push(vibe);
      othersUnlocked = true;
    }
  }

  const forgotten = pools.map((p) => forgottenFrom(p, have));
  const notNeeded = pools.map((p) => notNeededFrom(p, packed, nights));

  // d. Claude fallback when no one else's lists are available yet.
  if (!othersUnlocked) {
    const result = await claudeSuggestions(leg, set);
    if (result) {
      const fromIdea = fromClaude(result, set);
      forgotten.push(fromIdea.forgotten);
      notNeeded.push(fromIdea.notNeeded);
    }
  }

  return {
    leg_id: leg.id,
    forgotten: mergeTop(forgotten, MAX_FORGOTTEN),
    not_needed: mergeTop(notNeeded, MAX_NOT_NEEDED),
  };
}

export async function suggestionsForTrip(
  tripId: string,
  userId: string,
  legs: Leg[],
  items: Item[],
): Promise<LegSuggestions[]> {
  return Promise.all(legs.map((leg) => suggestionsForLeg(tripId, userId, leg, items)));
}
