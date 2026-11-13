"use client";

import { useId, type ComponentProps } from "react";

import { phoneLocalPart } from "@/lib/validation";

type PhoneNumberInputProps = Omit<
  ComponentProps<"input">,
  "type" | "inputMode" | "value" | "onChange" | "maxLength"
> & {
  value: string;
  onChange: (value: string) => void;
};

/** Place inside a flex field. State holds local digits; submit with phoneWithCc. */
export default function PhoneNumberInput({
  value,
  onChange,
  className = "min-w-0 flex-1 bg-transparent font-inter text-[14px] text-ink outline-none placeholder:text-field-placeholder",
  autoComplete = "tel-national",
  placeholder = "10-digit mobile number",
  disabled,
  "aria-describedby": describedBy,
  "aria-label": label = "Phone number",
  ...props
}: PhoneNumberInputProps) {
  const countryCodeId = useId();

  return (
    <>
      <span
        id={countryCodeId}
        className={`shrink-0 border-r-[1.167px] border-black pr-3 font-inter text-[14px] leading-5 text-ink ${disabled ? "opacity-50" : ""}`}
      >
        <span className="sr-only">Country code </span>+91
      </span>
      <input
        {...props}
        type="tel"
        inputMode="numeric"
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(phoneLocalPart(event.target.value))}
        disabled={disabled}
        aria-label={label}
        aria-describedby={[countryCodeId, describedBy].filter(Boolean).join(" ")}
        className={className}
      />
    </>
  );
}
