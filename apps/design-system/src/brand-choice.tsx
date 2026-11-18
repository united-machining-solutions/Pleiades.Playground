import { brands, setBrand, useBrand } from "@pleiades/ui/brands"
import { Field, FieldLabel } from "@pleiades/ui/components/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@pleiades/ui/components/select"

/** The value of the choice for the look without a brand: the theme as it comes. */
const noBrand = "default"

const items = [{ label: "Default", value: noBrand }, ...brands.map((brand) => ({ label: brand.name, value: brand.id }))]

/**
 * Which brand the page wears: the same choice as the switch of the example application, and it sets
 * the same attribute, `data-brand` on <html>. So this page is where a brand is checked: every
 * component in every state, and the colour roles with the contrast they measure under the brand.
 */
export function BrandChoice() {
  const id = useBrand()
  return (
    <Field orientation="horizontal" className="w-auto">
      <FieldLabel htmlFor="brand">Brand</FieldLabel>
      <Select
        items={items}
        value={id || noBrand}
        onValueChange={(value) => setBrand(value === noBrand ? "" : String(value))}
      >
        <SelectTrigger id="brand" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
}
