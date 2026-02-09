/**
 * scripts/import_fh2_cars.ts
 *
 * Server-only ingestion script that imports the Forza Horizon 2 car list
 * from the Forza Fandom wiki into the `car_models` table.
 *
 * Usage:
 *   npx tsx scripts/import_fh2_cars.ts            # full import
 *   npx tsx scripts/import_fh2_cars.ts --dry-run   # parse only, no DB writes
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const WIKI_API = "https://forza.fandom.com/api.php";
const PAGE_TITLE = "Forza_Horizon_2/Cars";
const WIKI_BASE = "https://forza.fandom.com/wiki/";
const IMAGE_BATCH_SIZE = 50; // MediaWiki API limit
const REQUEST_DELAY_MS = 250; // polite rate-limit
const MAX_RETRIES = 3;
const SOURCE = "forza.fandom";
const SOURCE_GAME = "Forza Horizon 2";

const DRY_RUN = process.argv.includes("--dry-run");

// ---------------------------------------------------------------------------
// Known multi-word manufacturers (checked first → longest-match wins)
// ---------------------------------------------------------------------------

const MULTI_WORD_MAKERS = [
  "Alfa Romeo",
  "Aston Martin",
  "De Tomaso",
  "Land Rover",
  "Local Motors",
  "Mercedes-AMG",
  "Mercedes-Benz",
  "Rolls-Royce",
].sort((a, b) => b.length - a.length); // longest first

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CatalogCar {
  year: number | null;
  manufacturer: string | null;
  model: string | null;
  display_name: string;
  wiki_page_title: string;
  wiki_page_url: string;
  image_url: string | null;
  class: string | null;
  stat_speed: number | null;
  stat_handling: number | null;
  stat_acceleration: number | null;
  stat_launch: number | null;
  stat_braking: number | null;
  stat_pi: number | null;
  suggested_credits_per_hour: number | null;
  source: string;
  source_game: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * fetch() with automatic retry on 429 / 5xx using exponential back-off.
 */
async function fetchRetry(url: string): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res;

    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      const delay = REQUEST_DELAY_MS * 2 ** attempt;
      console.warn(
        `  ⚠ HTTP ${res.status} — retrying in ${delay}ms (${attempt + 1}/${MAX_RETRIES})`
      );
      await sleep(delay);
      continue;
    }

    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  throw new Error("unreachable");
}

/**
 * Parse a stat cell text (e.g. "5.1") into an integer on a 0-100 scale.
 * Returns null when the value is missing or unparseable.
 */
function parseStat(text: string): number | null {
  const cleaned = text.replace(/,/g, "").trim();
  const val = parseFloat(cleaned);
  if (Number.isNaN(val)) return null;
  return Math.round(val * 10);
}

/**
 * Parse the PI cell text (e.g. "S2 998", "D 100") into a plain integer.
 *
 * Forza PI is always a 3-digit number (100–999).  The wiki cell may
 * concatenate the class prefix with the number without a space
 * (e.g. "S1801" instead of "S1 801").  Using exactly 3 trailing digits
 * avoids the greedy match that would turn "S1801" into 1801.
 */
function parsePi(text: string): number | null {
  // Match exactly the last 3-digit group — covers "S2 998", "S2998", "D 100"
  const m = text.match(/(\d{3})\s*$/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Derive the canonical performance class from a PI value.
 * Must stay in sync with the SQL migration and piClass.ts.
 */
function piToClass(pi: number | null): string | null {
  if (pi == null) return null;
  if (pi >= 999) return "X";
  if (pi >= 901) return "S2";
  if (pi >= 801) return "S1";
  if (pi >= 701) return "A";
  if (pi >= 601) return "B";
  if (pi >= 501) return "C";
  return "D";
}

/**
 * Best-effort split of a vehicle name string into manufacturer + model.
 *
 *   "Alfa Romeo 33 Stradale"  → { manufacturer: "Alfa Romeo", model: "33 Stradale" }
 *   "BMW M3"                  → { manufacturer: "BMW",        model: "M3" }
 */
function splitMakerModel(name: string): {
  manufacturer: string | null;
  model: string | null;
} {
  if (!name) return { manufacturer: null, model: null };

  for (const maker of MULTI_WORD_MAKERS) {
    if (name.startsWith(maker + " ") || name === maker) {
      const model = name.slice(maker.length).trim() || null;
      return { manufacturer: maker, model };
    }
  }

  // Single-word manufacturer = first token
  const idx = name.indexOf(" ");
  if (idx > 0) {
    return {
      manufacturer: name.slice(0, idx),
      model: name.slice(idx + 1).trim() || null,
    };
  }

  return { manufacturer: name, model: null };
}

// ---------------------------------------------------------------------------
// Step 1 — Fetch and parse the wiki page HTML
// ---------------------------------------------------------------------------

async function fetchCarsHtml(): Promise<string> {
  console.log("→ Fetching wiki page HTML…");
  const url = `${WIKI_API}?action=parse&page=${PAGE_TITLE}&prop=text&format=json`;
  const res = await fetchRetry(url);
  const json = (await res.json()) as {
    parse?: { text?: { "*"?: string } };
  };
  const html = json?.parse?.text?.["*"];
  if (!html) throw new Error("No HTML returned from MediaWiki parse API");
  console.log(`  ✓ Received ${(html.length / 1024).toFixed(0)} KB of HTML`);
  return html;
}

/**
 * Locate the main cars table by scanning for a <table> whose header
 * row contains both "Vehicle" and "PI".  Then parse every data row
 * into a CatalogCar object (without image_url — that comes later).
 */
function parseCarsTable(html: string): CatalogCar[] {
  console.log("→ Parsing cars table…");
  const $ = cheerio.load(html);

  // Find the table whose header row mentions "Vehicle" and "PI"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let target: any = null;

  $("table").each((_i, table) => {
    const headerText = $(table).find("th").text();
    if (headerText.includes("Vehicle") && headerText.includes("PI")) {
      target = $(table);
      return false; // break
    }
  });

  if (!target) throw new Error("Could not locate the cars table on the page");

  // Build a header-index map from the <th> cells.
  const headers: string[] = [];
  $(target)
    .find("tr")
    .first()
    .find("th")
    .each((_i: number, th: unknown) => {
      headers.push($(th as never).text().trim());
    });

  const col = (label: string) =>
    headers.findIndex(
      (h) => h.toLowerCase() === label.toLowerCase()
    );

  // Map well-known header labels to indices
  const spIdx = col("Sp");
  const haIdx = col("Ha");
  const acIdx = col("Ac");
  const lsIdx = col("Ls");
  const brIdx = col("Br");
  const piIdx = col("PI");

  // Determine whether we can use header-based indices
  const useHeaderIdx = [spIdx, haIdx, acIdx, brIdx, piIdx].every(
    (i) => i >= 0
  );

  const cars: CatalogCar[] = [];

  $(target)
    .find("tr")
    .each((_i: number, tr: unknown) => {
      const cells = $(tr as never).find("td");
      if (cells.length < 7) return; // skip header / malformed rows

      // --- Vehicle cell (always the first <td>) ---
      const vehicleCell = cells.first();
      const link = vehicleCell.find("a").first();
      const linkText = link.text().trim();
      const href = link.attr("href") ?? "";

      // Fall back to cell text if no link found
      const vehicleName = linkText || vehicleCell.text().trim().split(/\d{4}/)[0].trim();
      if (!vehicleName) return;

      // Wiki page title from href:  /wiki/Some_Page → Some_Page
      const wikiPageTitle = href
        ? decodeURIComponent(href.replace(/^\/wiki\//, ""))
        : vehicleName;

      // --- Year extraction ---
      // The year sits right after the <a> tag inside the first <div>
      // of the vehicle cell: "<a>Car Name</a> 1968".  The cell's
      // .text() concatenates without whitespace ("1968Autoshow"), so
      // we extract from the first <div> text, grabbing the 4-digit
      // suffix that follows the link text.
      let year: number | null = null;
      const firstDiv = vehicleCell.find("div").first();
      const divText = firstDiv.text().trim();
      const afterLink = divText.slice(linkText.length).trim();
      const yearMatch = afterLink.match(/^(\d{4})/);
      if (yearMatch) {
        year = parseInt(yearMatch[1], 10);
      }

      // Manufacturer + model from the vehicle name
      const { manufacturer, model } = splitMakerModel(vehicleName);

      // --- Stats (prefer header indices, fall back to end-of-row) ---
      let speed: number | null;
      let handling: number | null;
      let acceleration: number | null;
      let launch: number | null;
      let braking: number | null;
      let pi: number | null;

      if (useHeaderIdx) {
        speed = parseStat(cells.eq(spIdx).text());
        handling = parseStat(cells.eq(haIdx).text());
        acceleration = parseStat(cells.eq(acIdx).text());
        launch = lsIdx >= 0 ? parseStat(cells.eq(lsIdx).text()) : null;
        braking = parseStat(cells.eq(brIdx).text());
        pi = parsePi(cells.eq(piIdx).text());
      } else {
        // Fallback: stats are the last 6 cells  (Sp Ha Ac Ls Br PI)
        const n = cells.length;
        speed = parseStat(cells.eq(n - 6).text());
        handling = parseStat(cells.eq(n - 5).text());
        acceleration = parseStat(cells.eq(n - 4).text());
        launch = parseStat(cells.eq(n - 3).text());
        braking = parseStat(cells.eq(n - 2).text());
        pi = parsePi(cells.eq(n - 1).text());
      }

      // display_name: "Manufacturer Model" or fallback to vehicleName
      const displayName =
        [manufacturer, model].filter(Boolean).join(" ") || vehicleName;

      cars.push({
        year,
        manufacturer,
        model,
        display_name: displayName,
        wiki_page_title: wikiPageTitle,
        wiki_page_url: `${WIKI_BASE}${encodeURIComponent(wikiPageTitle.replace(/ /g, "_"))}`,
        image_url: null, // filled in next step
        class: piToClass(pi),
        stat_speed: speed,
        stat_handling: handling,
        stat_acceleration: acceleration,
        stat_launch: launch,
        stat_braking: braking,
        stat_pi: pi,
        suggested_credits_per_hour: null, // computed after all cars are parsed
        source: SOURCE,
        source_game: SOURCE_GAME,
        updated_at: new Date().toISOString(),
      });
    });

  console.log(`  ✓ Parsed ${cars.length} cars from the table`);
  return cars;
}

// ---------------------------------------------------------------------------
// Step 2 — Batch-fetch thumbnail images via MediaWiki PageImages API
// ---------------------------------------------------------------------------

async function fetchImages(
  cars: CatalogCar[]
): Promise<Map<string, string>> {
  console.log("→ Fetching thumbnail images…");

  // Collect unique wiki page titles that are actual article links
  const titles = [
    ...new Set(
      cars
        .map((c) => c.wiki_page_title)
        .filter((t) => t && !t.startsWith("#"))
    ),
  ];

  const imageMap = new Map<string, string>();

  // Process in batches of IMAGE_BATCH_SIZE
  for (let i = 0; i < titles.length; i += IMAGE_BATCH_SIZE) {
    const batch = titles.slice(i, i + IMAGE_BATCH_SIZE);
    const titlesParam = batch.map((t) => t.replace(/ /g, "_")).join("|");

    const url =
      `${WIKI_API}?action=query&format=json&prop=pageimages` +
      `&pithumbsize=600&titles=${encodeURIComponent(titlesParam)}`;

    await sleep(REQUEST_DELAY_MS);
    const res = await fetchRetry(url);
    const json = (await res.json()) as {
      query?: {
        pages?: Record<
          string,
          { title?: string; thumbnail?: { source?: string } }
        >;
      };
    };

    const pages = json?.query?.pages ?? {};
    for (const page of Object.values(pages)) {
      if (page.title && page.thumbnail?.source) {
        imageMap.set(page.title, page.thumbnail.source);
      }
    }

    const batchNum = Math.floor(i / IMAGE_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(titles.length / IMAGE_BATCH_SIZE);
    console.log(
      `  batch ${batchNum}/${totalBatches} — ${imageMap.size} images so far`
    );
  }

  console.log(`  ✓ Resolved ${imageMap.size} images for ${titles.length} titles`);
  return imageMap;
}

/**
 * Attach image URLs to each car.  The PageImages API returns titles
 * with underscores replaced by spaces, so we normalise both sides.
 */
function attachImages(
  cars: CatalogCar[],
  imageMap: Map<string, string>
): void {
  for (const car of cars) {
    // Try exact title match first, then with spaces → underscores
    const normalised = car.wiki_page_title.replace(/_/g, " ");
    car.image_url =
      imageMap.get(car.wiki_page_title) ??
      imageMap.get(normalised) ??
      null;
  }

  const withImage = cars.filter((c) => c.image_url).length;
  console.log(`  ✓ ${withImage}/${cars.length} cars matched to an image`);
}

// ---------------------------------------------------------------------------
// Step 3 — Compute suggested_credits_per_hour
//
// Pricing heuristic (transparent, deterministic):
//
//   1. Compute dataset-wide min/max for PI and each stat column
//      (speed, handling, acceleration, launch, braking) among non-null values.
//
//   2. For each car compute a 0..1 "desirability score":
//      • pi_norm  = (pi - pi_min) / (pi_max - pi_min), clamped [0, 1]
//      • For each stat: stat_norm = (stat - stat_min) / (stat_max - stat_min)
//      • stats_norm_avg = average of available normalized stats (skip nulls)
//
//      If PI exists:  score = 0.7 * pi_norm + 0.3 * stats_norm_avg
//      If PI missing:  score = stats_norm_avg  (or 0.5 if everything missing)
//
//   3. Map score → credits/hour:
//      suggested = MIN_PRICE + score * (MAX_PRICE - MIN_PRICE)
//      Round to nearest 5, clamp to [MIN_PRICE, MAX_PRICE].
//
//   Band: [10, 100] cr/hr.
//     10 — economy D-class cars
//    100 — top-tier X-class exotics
//   Businesses can override per unit via car_units.credits_per_hour.
// ---------------------------------------------------------------------------

const MIN_PRICE = 10;
const MAX_PRICE = 100;

/** Compute min & max of a numeric array, ignoring nulls. */
function minMax(values: (number | null)[]): [number, number] | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return [Math.min(...nums), Math.max(...nums)];
}

/** Normalize a value into 0..1 given min/max bounds. Clamps to [0,1]. */
function norm(value: number, min: number, max: number): number {
  if (max === min) return 0.5; // all identical → middle
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function computePricing(cars: CatalogCar[]): void {
  console.log("→ Computing suggested credits/hour…");

  // 1. Dataset-wide min/max for PI and each stat column
  const piRange = minMax(cars.map((c) => c.stat_pi));
  const speedRange = minMax(cars.map((c) => c.stat_speed));
  const handlingRange = minMax(cars.map((c) => c.stat_handling));
  const accelRange = minMax(cars.map((c) => c.stat_acceleration));
  const launchRange = minMax(cars.map((c) => c.stat_launch));
  const brakingRange = minMax(cars.map((c) => c.stat_braking));

  if (piRange) {
    console.log(`  PI range  : ${piRange[0]} – ${piRange[1]}`);
  }

  // 2 & 3. For each car, compute score → suggested price
  let priced = 0;
  for (const car of cars) {
    // Normalize each available stat
    const statNorms: number[] = [];
    const tryPush = (val: number | null, range: [number, number] | null) => {
      if (val != null && range) statNorms.push(norm(val, range[0], range[1]));
    };
    tryPush(car.stat_speed, speedRange);
    tryPush(car.stat_handling, handlingRange);
    tryPush(car.stat_acceleration, accelRange);
    tryPush(car.stat_launch, launchRange);
    tryPush(car.stat_braking, brakingRange);

    const statsNormAvg =
      statNorms.length > 0
        ? statNorms.reduce((a, b) => a + b, 0) / statNorms.length
        : null;

    let score: number;
    if (car.stat_pi != null && piRange) {
      // PI present → weighted blend: 70 % PI, 30 % stats
      const piNorm = norm(car.stat_pi, piRange[0], piRange[1]);
      score = 0.7 * piNorm + 0.3 * (statsNormAvg ?? piNorm);
    } else if (statsNormAvg != null) {
      // PI missing → stats only
      score = statsNormAvg;
    } else {
      // Nothing at all → neutral mid-point
      score = 0.5;
    }

    // Map score to price, round to nearest 5, clamp
    const raw = MIN_PRICE + score * (MAX_PRICE - MIN_PRICE);
    const rounded = Math.round(raw / 5) * 5;
    car.suggested_credits_per_hour = Math.max(MIN_PRICE, Math.min(MAX_PRICE, rounded));
    priced++;
  }

  // Quick distribution summary
  const prices = cars.map((c) => c.suggested_credits_per_hour!);
  const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
  console.log(`  ✓ Priced ${priced} cars (min ${Math.min(...prices)}, avg ${avg}, max ${Math.max(...prices)} cr/hr)`);
}


// ---------------------------------------------------------------------------
// Step 4 — Upsert into Supabase (service-role only)
// ---------------------------------------------------------------------------

async function upsertCars(cars: CatalogCar[]): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  console.log(`→ Upserting ${cars.length} rows into car_models…`);

  // Supabase JS client handles batching internally, but we chunk at
  // 200 to keep request payloads reasonable.
  const CHUNK = 200;
  let inserted = 0;
  let updated = 0;

  for (let i = 0; i < cars.length; i += CHUNK) {
    const batch = cars.slice(i, i + CHUNK);

    const { data, error } = await supabase
      .from("car_models")
      .upsert(batch, {
        onConflict: "source,source_game,wiki_page_title",
        ignoreDuplicates: false,
      })
      .select("id");

    if (error) {
      console.error("  ✗ Upsert error:", error.message);
      throw error;
    }

    const count = data?.length ?? 0;
    inserted += count;
    updated += batch.length - count;
  }

  console.log(`  ✓ Upserted ${cars.length} rows (new + updated)`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("ForzaCars Rentals — FH2 Wiki Car Import");
  console.log("=".repeat(60));

  if (DRY_RUN) {
    console.log("🏁  DRY RUN — no database writes will be performed\n");
  }

  // 1. Fetch + parse
  const html = await fetchCarsHtml();
  const cars = parseCarsTable(html);

  if (cars.length === 0) {
    console.warn("⚠ No cars parsed — aborting.");
    process.exit(1);
  }

  // 1b. Deduplicate by (source, source_game, wiki_page_title) — keep last occurrence
  const deduped = new Map<string, CatalogCar>();
  for (const car of cars) {
    const key = `${car.source}|${car.source_game}|${car.wiki_page_title}`;
    deduped.set(key, car); // last one wins
  }
  const uniqueCars = Array.from(deduped.values());
  if (uniqueCars.length < cars.length) {
    console.log(`  ⚠ Removed ${cars.length - uniqueCars.length} duplicate(s) — ${uniqueCars.length} unique cars`);
  }

  // 2. Fetch images
  const imageMap = await fetchImages(uniqueCars);
  attachImages(uniqueCars, imageMap);

  // 3. Compute suggested rental pricing
  computePricing(uniqueCars);

  // 4. Summary
  console.log("\n--- Summary ---");
  console.log(`  Total cars parsed : ${cars.length} (${uniqueCars.length} unique)`);
  console.log(`  With image        : ${uniqueCars.filter((c) => c.image_url).length}`);
  console.log(`  With year         : ${uniqueCars.filter((c) => c.year).length}`);
  console.log(`  With manufacturer : ${uniqueCars.filter((c) => c.manufacturer).length}`);
  console.log(`  With PI           : ${uniqueCars.filter((c) => c.stat_pi != null).length}`);
  console.log(`  With pricing      : ${uniqueCars.filter((c) => c.suggested_credits_per_hour != null).length}`);

  // Print first 5 cars as a sample
  console.log("\n--- Sample (first 5) ---");
  for (const car of uniqueCars.slice(0, 5)) {
    console.log(
      `  ${car.year ?? "????"} ${car.manufacturer ?? "?"} ${car.model ?? "?"} ` +
        `| PI ${car.stat_pi ?? "?"} | ${car.suggested_credits_per_hour ?? "?"} cr/hr` +
        ` | img ${car.image_url ? "✓" : "✗"}`
    );
  }

  // 5. Upsert (skip in dry-run)
  if (!DRY_RUN) {
    await upsertCars(uniqueCars);
  }

  console.log("\n✅ Done!");
}

main().catch((err) => {
  console.error("\n✗ Fatal error:", err);
  process.exit(1);
});
