import { describe, expect, test } from "vitest";
import { formatAmount, formatPct, fromNumeric, parseAmount, toPeso } from "./money";

const ok = (centavos: number, entry: string | null = null) => ({ ok: true, centavos, entry });
const err = (error: string) => ({ ok: false, error });

describe("parseAmount", () => {
  test("empty is zero", () => {
    expect(parseAmount("")).toEqual(ok(0));
    expect(parseAmount("   ")).toEqual(ok(0));
  });
  test("plain numbers, separators and signs", () => {
    expect(parseAmount("1234.5")).toEqual(ok(123450));
    expect(parseAmount("1,234.50")).toEqual(ok(123450));
    expect(parseAmount("-1,234.50")).toEqual(ok(-123450));
    expect(parseAmount(" 500 ")).toEqual(ok(50000));
    expect(parseAmount("0.07")).toEqual(ok(7));
    expect(parseAmount("-0")).toEqual(ok(0));
  });
  test("parentheses mean negative", () => {
    expect(parseAmount("(500)")).toEqual(ok(-50000));
    expect(parseAmount("(1,234.50)")).toEqual(ok(-123450));
  });
  test("expressions keep the normalised entry", () => {
    expect(parseAmount("895256+57158+441937")).toEqual(ok(139435100, "895256+57158+441937"));
    expect(parseAmount("1,000.50 - 0.25")).toEqual(ok(100025, "1000.50-0.25"));
    expect(parseAmount("-5+3")).toEqual(ok(-200, "-5+3"));
  });
  test("= prefix is stripped first", () => {
    expect(parseAmount("=100")).toEqual(ok(10000));
    expect(parseAmount("=895256+57158+441937")).toEqual(ok(139435100, "895256+57158+441937"));
  });
  test("more than 2 decimals is rejected", () => {
    expect(parseAmount("1.005")).toEqual(err("Use at most 2 decimal places"));
    expect(parseAmount("1+2.345")).toEqual(err("Use at most 2 decimal places"));
  });
  test("other characters are rejected", () => {
    expect(parseAmount("abc")).toEqual(err("Amount must be a number"));
    expect(parseAmount("12a")).toEqual(err("Amount must be a number"));
    expect(parseAmount("1*2")).toEqual(err("Amount must be a number"));
    expect(parseAmount("1++2")).toEqual(err("Amount must be a number"));
    expect(parseAmount("1.2.3")).toEqual(err("Amount must be a number"));
    expect(parseAmount("=")).toEqual(err("Amount must be a number"));
  });
  test("1e13 or more is too large", () => {
    expect(parseAmount("9999999999999.99")).toEqual(ok(999999999999999));
    expect(parseAmount("10000000000000")).toEqual(err("Amount is too large"));
    expect(parseAmount("-10000000000000")).toEqual(err("Amount is too large"));
    expect(parseAmount("9999999999999+1")).toEqual(err("Amount is too large"));
  });
});

describe("format", () => {
  test("formatAmount", () => {
    expect(formatAmount(123450)).toBe("1,234.50");
    expect(formatAmount(-123450)).toBe("-1,234.50");
    expect(formatAmount(0)).toBe("0.00");
    expect(formatAmount(-5)).toBe("-0.05");
    expect(formatAmount(147756023328)).toBe("1,477,560,233.28");
  });
  test("formatPct", () => {
    expect(formatPct(40.2384)).toBe("40.24%");
    expect(formatPct(0)).toBe("0.00%");
    expect(formatPct(null)).toBe("—");
  });
  test("toPeso", () => {
    expect(toPeso(123450)).toBe(1234.5);
  });
});

describe("fromNumeric", () => {
  test("parses PostgREST numeric strings exactly", () => {
    expect(fromNumeric("1477560233.28")).toBe(147756023328);
    expect(fromNumeric("-39531743.54")).toBe(-3953174354);
    expect(fromNumeric("0.29")).toBe(29);
    expect(fromNumeric("1.1")).toBe(110);
    expect(fromNumeric("100")).toBe(10000);
    expect(fromNumeric("-0.00")).toBe(0);
  });
  test("rounds extra decimals half away from zero", () => {
    expect(fromNumeric("1.005")).toBe(101);
    expect(fromNumeric("-1.005")).toBe(-101);
    expect(fromNumeric("1.0049")).toBe(100);
  });
  test("numbers and null", () => {
    expect(fromNumeric(1.1)).toBe(110);
    expect(fromNumeric(0.29)).toBe(29);
    expect(fromNumeric(-39531743.54)).toBe(-3953174354);
    expect(fromNumeric(null)).toBe(0);
  });
  test("rejects garbage", () => {
    expect(() => fromNumeric("abc")).toThrow();
  });
});
