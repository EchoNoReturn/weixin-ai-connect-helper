interface PermissionOption {
  optionId: string;
  kind: string;
}

/** Prefer per-call approval so agents do not retain an unnecessary permanent grant. */
export function selectPermission<T extends PermissionOption>(autoApprove: boolean, options: T[]): T | undefined {
  if (!autoApprove) return undefined;
  return options.find((option) => option.kind === "allow_once")
    ?? options.find((option) => option.kind === "allow_always");
}
