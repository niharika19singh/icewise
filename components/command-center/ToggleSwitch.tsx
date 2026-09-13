export default function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
        checked ? "border-ice/50 bg-ice/25" : "border-frost/15 bg-frost/5"
      }`}
    >
      <span
        className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-transform ${
          checked ? "translate-x-4 bg-ice-bright" : "translate-x-0.5 bg-mist"
        }`}
      />
    </button>
  );
}
