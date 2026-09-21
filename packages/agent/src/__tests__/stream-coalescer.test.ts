import { describe, it, expect } from "bun:test";
import { StreamCoalescer } from "../stream-coalescer.ts";

function makeCoalescer(opts: { minChars?: number; idleMs?: number } = {}) {
  const flushed: string[] = [];
  let now = 1_000_000;
  const c = new StreamCoalescer({
    minChars: opts.minChars ?? 10,
    idleMs: opts.idleMs ?? 1000,
    flush: async (d) => { flushed.push(d); },
    now: () => now,
  });
  return {
    c,
    flushed,
    advance: (ms: number) => { now += ms; },
  };
}

describe("StreamCoalescer", () => {
  it("does not flush below minChars", async () => {
    const { c, flushed } = makeCoalescer();
    await c.update("abc"); // 3 < 10
    expect(flushed).toEqual([]);
    expect(c.sent).toBe(0);
  });

  it("flushes when pending >= minChars and idle time passed (first flush immediate)", async () => {
    const { c, flushed } = makeCoalescer();
    await c.update("abcdefghijk"); // 11 >= 10, first flush has no idle constraint
    expect(flushed).toEqual(["abcdefghijk"]);
    expect(c.sent).toBe(11);
  });

  it("does not flush when idle interval not reached", async () => {
    const { c, flushed, advance } = makeCoalescer();
    await c.update("abcdefghij"); // flush 1 at t=0
    advance(500); // < idleMs 1000
    await c.update("abcdefghij" + "klmnopqrst"); // 10 pending but idle not reached
    expect(flushed).toEqual(["abcdefghij"]);
    expect(c.sent).toBe(10);
  });

  it("flushes delta (not full text) after idle interval", async () => {
    const { c, flushed, advance } = makeCoalescer();
    await c.update("abcdefghij"); // sent 10
    advance(1500);
    await c.update("abcdefghij" + "klmnopqrstuv"); // 12 pending
    expect(flushed).toEqual(["abcdefghij", "klmnopqrstuv"]);
    expect(c.sent).toBe(22);
  });

  it("finalize flushes remaining text unconditionally", async () => {
    const { c, flushed } = makeCoalescer();
    await c.update("abc"); // below threshold
    const rest = await c.finalize("abc");
    expect(rest).toBe("abc");
    expect(flushed).toEqual(["abc"]);
    expect(c.sent).toBe(3);
  });

  it("finalize with nothing pending is a no-op", async () => {
    const { c, flushed } = makeCoalescer();
    await c.update("abcdefghij"); // all sent
    const rest = await c.finalize("abcdefghij");
    expect(rest).toBe("");
    expect(flushed).toEqual(["abcdefghij"]);
  });

  it("accumulates pending across updates until threshold", async () => {
    const { c, flushed, advance } = makeCoalescer();
    await c.update("abcd"); // 4
    advance(2000);
    await c.update("abcdefgh"); // 8 pending, still < 10
    expect(flushed).toEqual([]);
    await c.update("abcdefghijk"); // 11 pending >= 10, idle ok
    expect(flushed).toEqual(["abcdefghijk"]);
  });
});
