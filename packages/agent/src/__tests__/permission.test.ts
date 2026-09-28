import { expect, test } from "bun:test";
import { selectPermission } from "../permission.ts";

const once = { optionId: "once", kind: "allow_once" };
const always = { optionId: "always", kind: "allow_always" };
const deny = { optionId: "deny", kind: "reject_once" };

test("disabled policy never grants permission", () => {
  expect(selectPermission(false, [always, once])).toBeUndefined();
});
test("enabled policy prefers per-request approval", () => {
  expect(selectPermission(true, [deny, always, once])).toBe(once);
  expect(selectPermission(true, [deny, always])).toBe(always);
});
test("enabled policy never selects an unknown or deny option", () => {
  expect(selectPermission(true, [deny])).toBeUndefined();
  expect(selectPermission(true, [{ optionId: "x", kind: "allow_unknown" }])).toBeUndefined();
  expect(selectPermission(true, [])).toBeUndefined();
});
