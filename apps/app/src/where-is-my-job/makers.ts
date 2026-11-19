// The mark of the manufacturer on a tile: the logo where the app has one, else the name the machine
// gives in `Identification.Manufacturer`, as a wordmark. A logo is only a picture of that name, so
// a machine of any other manufacturer reads the same, with its name in words.

export type Maker = { name: string; logo: string | null; height: number }

/**
 * The logos the app carries, in `public/manufacturers/`, by words of the manufacturer's name. Each name
 * stands whole, between word boundaries, and where a word is the name of another company too, with the
 * word next to it: so Jungheinrich, Walter AG or Blohm + Voss keep their own name and get no logo that
 * is not theirs.
 */
const LOGOS: ReadonlyArray<{ words: RegExp; name: string; logo: string; height: number }> = [
  { words: /\btrumpf\b/i, name: "TRUMPF", logo: "/manufacturers/trumpf.svg", height: 24 },
  // The machine brands of the UNITED GRINDING Group carry the logo of the group.
  {
    words: /\bunited grinding\b|\bm(ä|ae|a)gerle\b|\bstuder\b|\bblohm[\s+&-]*jung\b|\bschaudt\b|\bmikrosa\b|\bwalter maschinenbau\b|\bewag\b|\birpd\b/i,
    name: "UNITED GRINDING",
    logo: "/manufacturers/united-grinding.png",
    height: 20,
  },
]

/** The mark of a manufacturer, or null where the machine names none. */
export function makerOf(manufacturer: string | null | undefined): Maker | null {
  const name = manufacturer?.trim()
  if (!name) return null
  const known = LOGOS.find((one) => one.words.test(name))
  return known ? { name, logo: known.logo, height: known.height } : { name, logo: null, height: 0 }
}
