import { describe, expect, test } from "vitest";
import { isInAppNavigation } from "./unsaved-guard";

const here = "http://localhost:3100/budget/saao?book=1";
const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
const link = (href: string, extra: Partial<{ target: string | null; download: boolean }> = {}) => ({ href, target: null, download: false, ...extra });

describe("isInAppNavigation", () => {
  test("a plain click on an in-app link navigates away", () => {
    expect(isInAppNavigation(click, link("http://localhost:3100/prs"), here)).toBe(true);
    expect(isInAppNavigation(click, link("http://localhost:3100/budget/saao?book=2"), here)).toBe(true);
  });

  test("new-tab, download, modified, non-primary and already-handled clicks do not", () => {
    expect(isInAppNavigation(click, link("http://localhost:3100/print/saao/x", { target: "_blank" }), here)).toBe(false);
    expect(isInAppNavigation(click, link("http://localhost:3100/budget/export/x", { download: true }), here)).toBe(false);
    expect(isInAppNavigation({ ...click, metaKey: true }, link("http://localhost:3100/prs"), here)).toBe(false);
    expect(isInAppNavigation({ ...click, ctrlKey: true }, link("http://localhost:3100/prs"), here)).toBe(false);
    expect(isInAppNavigation({ ...click, button: 1 }, link("http://localhost:3100/prs"), here)).toBe(false);
    expect(isInAppNavigation({ ...click, defaultPrevented: true }, link("http://localhost:3100/prs"), here)).toBe(false);
  });

  test("other origins and same-page hash links do not", () => {
    expect(isInAppNavigation(click, link("https://example.com/"), here)).toBe(false);
    expect(isInAppNavigation(click, link("http://localhost:3100/budget/saao?book=1#top"), here)).toBe(false);
    expect(isInAppNavigation(click, link(""), here)).toBe(false);
  });

  test("target=_self still counts as in-app", () => {
    expect(isInAppNavigation(click, link("http://localhost:3100/prs", { target: "_self" }), here)).toBe(true);
  });
});
