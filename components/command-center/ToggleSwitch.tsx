export default function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
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
