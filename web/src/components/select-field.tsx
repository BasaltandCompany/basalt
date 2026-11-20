// The dashboard's native-<select> replacement, one call site at a time.
// Form selects: pass `name` and read the value from FormData as before —
// the HiddenSelect bridges it. Filter selects: pass value + onChange.
// required forwards to the hidden native select so empty submits still block.
import { createMemo, Show } from "solid-js";
import type { JSX } from "@solidjs/web";
import {
  Select,
  SelectContent,
  SelectHiddenSelect,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@basaltac/ui"

export type SelectOption = { value: string; label: string }

export default function SelectField(props: {
  id?: string
  name?: string
  placeholder?: string
  options: SelectOption[] | (() => SelectOption[])
  /** initial (uncontrolled) or controlled value; null shows the placeholder */
  value?: string | null
  onChange?: (value: string) => void
  required?: boolean
  disabled?: boolean
  class?: string
  style?: JSX.CSSProperties
  "aria-label"?: string
}) {
  const opts = createMemo(() =>
    Array.isArray(props.options) ? props.options : props.options(),
  )
  const labels = createMemo(() => new Map(opts().map((o) => [o.value, o.label])))
  return (
    // undefined = uncontrolled; null would be Kobalte "controlled-empty", which
    // swallows selections for selects without onChange (company pickers)
    <Select
      options={opts().map((o) => o.value)}
      // "" = no selection → uncontrolled, else Kobalte's controlled mode pins the
      // value and swallows clicks for callers without onChange
      value={props.value || undefined}
      onChange={(v) => props.onChange?.(v ?? "")}
      placeholder={props.placeholder ?? "Select…"}
      itemComponent={(p) => (
        <SelectItem item={p.item}>{labels().get(p.item.rawValue) ?? p.item.rawValue}</SelectItem>
      )}
      disabled={props.disabled}
      class="w-full"
    >
      <Show when={props.name}>
        <SelectHiddenSelect name={props.name} id={props.id} required={props.required} />
      </Show>
      <SelectTrigger id={props.id} class={props.class} style={props.style} aria-label={props["aria-label"]}>
        {/* Kobalte renders NOTHING for a bare <SelectValue /> — the label must
            come from this render-prop, mapped through the option labels. */}
        <SelectValue>
          {(state) => {
            const v = state.selectedOption() as string;
            return labels().get(v) ?? v;
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent />
    </Select>
  )
}
