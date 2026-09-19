export const PAKISTAN_COUNTRY_CODE = "+92";
export const PAKISTAN_MOBILE_DIGITS = 10;

export function phoneInputDigits(value: string): string {
  const trimmed = value.trim();
  const withoutCountryCode = trimmed.startsWith(PAKISTAN_COUNTRY_CODE)
    ? trimmed.slice(PAKISTAN_COUNTRY_CODE.length)
    : trimmed.startsWith("0")
      ? trimmed.slice(1)
      : trimmed;

  return withoutCountryCode.replace(/\D/g, "").slice(0, PAKISTAN_MOBILE_DIGITS);
}

export function composePakistaniPhone(value: string): string {
  const digits = phoneInputDigits(value);
  return digits ? `${PAKISTAN_COUNTRY_CODE} ${digits}` : "";
}

export function isValidPakistaniPhone(value: string): boolean {
  return /^(?:3\d{9}|\+92\s*3\d{9})$/.test(value.trim());
}

export function formatPakistaniPhone(value: string): string {
  const digits = phoneInputDigits(value);
  return /^3\d{9}$/.test(digits) ? `${PAKISTAN_COUNTRY_CODE} ${digits}` : value.trim();
}

export function dialablePakistaniPhone(value: string): string {
  return formatPakistaniPhone(value).replace(/\s/g, "");
}