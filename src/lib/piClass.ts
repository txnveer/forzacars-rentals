/**
 * Forza Performance Index (PI) class utilities.
 *
 * PI ranges (Forza Horizon 2):
 *   D  : 100 – 500
 *   C  : 501 – 600
 *   B  : 601 – 700
 *   A  : 701 – 800
 *   S1 : 801 – 900
 *   S2 : 901 – 998
 *   X  : 999+
 */

export type PiClassName = "D" | "C" | "B" | "A" | "S1" | "S2" | "X";

export const PI_CLASSES: { name: PiClassName; min: number; max: number; color: string }[] = [
  { name: "D", min: 100, max: 500, color: "#0a91f6" },
  { name: "C", min: 501, max: 600, color: "#e2af04" },
  { name: "B", min: 601, max: 700, color: "#e56310" },
  { name: "A", min: 701, max: 800, color: "#d1232a" },
  { name: "S1", min: 801, max: 900, color: "#9b59b6" },
  { name: "S2", min: 901, max: 998, color: "#2ecc71" },
  { name: "X", min: 999, max: 9999, color: "#e74c3c" },
];

/**
 * Derive the PI class name from a numeric PI value.
 */
export function piClassName(pi: number): PiClassName {
  for (const cls of PI_CLASSES) {
    if (pi >= cls.min && pi <= cls.max) return cls.name;
  }
  return pi <= 100 ? "D" : "X";
}

/**
 * Derive the canonical class string from a numeric PI value.
 * Same logic used by the SQL migration and the import script.
 */
export function piToClass(pi: number | null): PiClassName | null {
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
 * Return the Tailwind-friendly background colour for a given PI class.
 */
export function piClassColor(pi: number): string {
  for (const cls of PI_CLASSES) {
    if (pi >= cls.min && pi <= cls.max) return cls.color;
  }
  return "#6b7280";
}

/**
 * Return the [min, max] range for a named PI class.
 */
export function piClassRange(name: PiClassName): [number, number] {
  const cls = PI_CLASSES.find((c) => c.name === name);
  return cls ? [cls.min, cls.max] : [0, 9999];
}
