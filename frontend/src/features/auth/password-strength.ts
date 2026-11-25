export interface PasswordStrength {
  /** 0 when empty, 1..4 when non-empty. */
  score: 0 | 1 | 2 | 3 | 4;
  label: "" | "Weak" | "Fair" | "Good" | "Strong";
}

const LABELS = ["", "Weak", "Fair", "Good", "Strong"] as const;

/** Matches prototype password strength heuristic (line 2520) with an accessible text label. */
export function passwordStrength(value: string): PasswordStrength {
  if (!value) return { score: 0, label: "" };
  let score = 0;
  if (value.length >= 12) score++;
  if (/[a-z]/i.test(value) && /\d/.test(value)) score++;
  if (value.length >= 16) score++;
  if (/[^a-z0-9]/i.test(value)) score++;
  const clamped = Math.max(1, Math.min(4, score)) as 1 | 2 | 3 | 4;
  return { score: clamped, label: LABELS[clamped] };
}
