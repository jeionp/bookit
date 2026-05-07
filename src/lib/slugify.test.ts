import { describe, it, expect } from "vitest";
import { slugify, isValidSlug } from "./slugify";

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Paddle Up")).toBe("paddle-up");
  });

  it("strips special characters", () => {
    expect(slugify("Court & Co.")).toBe("court-co");
  });

  it("collapses multiple spaces and hyphens", () => {
    expect(slugify("Big   Space  Court")).toBe("big-space-court");
    expect(slugify("double--dash")).toBe("double-dash");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  -hello-  ")).toBe("hello");
  });

  it("handles an already-slug string unchanged", () => {
    expect(slugify("paddleup")).toBe("paddleup");
  });
});

describe("isValidSlug", () => {
  it("accepts valid slugs", () => {
    expect(isValidSlug("paddleup")).toBe(true);
    expect(isValidSlug("paddle-up")).toBe(true);
    expect(isValidSlug("court-123")).toBe(true);
  });

  it("rejects slugs shorter than 3 characters", () => {
    expect(isValidSlug("ab")).toBe(false);
  });

  it("rejects slugs with uppercase letters", () => {
    expect(isValidSlug("PaddleUp")).toBe(false);
  });

  it("rejects slugs with leading or trailing hyphens", () => {
    expect(isValidSlug("-paddle")).toBe(false);
    expect(isValidSlug("paddle-")).toBe(false);
  });

  it("rejects slugs with consecutive hyphens", () => {
    expect(isValidSlug("paddle--up")).toBe(false);
  });

  it("rejects slugs with spaces or special chars", () => {
    expect(isValidSlug("paddle up")).toBe(false);
    expect(isValidSlug("paddle.up")).toBe(false);
  });
});
