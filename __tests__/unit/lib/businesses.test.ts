import { getBusinessBySlug, businesses } from "@/lib/businesses";

describe("getBusinessBySlug", () => {
  it("returns PaddleUp for the valid slug", () => {
    const biz = getBusinessBySlug("paddleup");
    expect(biz).toBeDefined();
    expect(biz?.name).toBe("PaddleUp");
    expect(biz?.slug).toBe("paddleup");
  });

  it("returns undefined for an unknown slug", () => {
    expect(getBusinessBySlug("nonexistent")).toBeUndefined();
  });

  it("returns undefined for an empty string", () => {
    expect(getBusinessBySlug("")).toBeUndefined();
  });

  it("is case-sensitive — uppercase slug returns undefined", () => {
    expect(getBusinessBySlug("PADDLEUP")).toBeUndefined();
    expect(getBusinessBySlug("PaddleUp")).toBeUndefined();
  });

  describe("PaddleUp data integrity", () => {
    const biz = getBusinessBySlug("paddleup")!;

    it("has exactly 4 facilities", () => {
      expect(biz.facilities).toHaveLength(4);
    });

    it("has exactly 7 operating hours entries (one per day)", () => {
      expect(biz.operatingHours).toHaveLength(7);
    });

    it("covers all 7 days of the week", () => {
      const days = biz.operatingHours.map((h) => h.day);
      ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].forEach(
        (d) => expect(days).toContain(d)
      );
    });

    it("all facilities use PHP currency", () => {
      biz.facilities.forEach((f) => expect(f.currency).toBe("PHP"));
    });

    it("all facilities have prime time starting at hour 17", () => {
      biz.facilities.forEach((f) => expect(f.primeTimeStart).toBe(17));
    });

    it("outdoor courts (court-1, court-2) are ₱500/hr, ₱600 prime", () => {
      ["court-1", "court-2"].forEach((id) => {
        const f = biz.facilities.find((x) => x.id === id)!;
        expect(f.pricePerHour).toBe(500);
        expect(f.primePricePerHour).toBe(600);
      });
    });

    it("indoor courts (court-3, court-4) are ₱700/hr, ₱800 prime", () => {
      // NOTE: In businesses.ts the IDs are 'court-3' and 'court-4', not 'court-3-indoor'
      ["court-3", "court-4"].forEach((id) => {
        const f = biz.facilities.find((x) => x.id === id);
        expect(f).toBeDefined();
        expect(f?.pricePerHour).toBe(700);
        expect(f?.primePricePerHour).toBe(800);
      });
    });

    it("Saturday opens early at 5:00 AM", () => {
      const sat = biz.operatingHours.find((h) => h.day === "Saturday");
      expect(sat?.open).toBe("5:00 AM");
    });

    it("Sunday opens early at 5:00 AM", () => {
      const sun = biz.operatingHours.find((h) => h.day === "Sunday");
      expect(sun?.open).toBe("5:00 AM");
    });

    it("Friday stays open until 11:00 PM", () => {
      const fri = biz.operatingHours.find((h) => h.day === "Friday");
      expect(fri?.close).toBe("11:00 PM");
    });

    it("none of the operating hours are marked closed", () => {
      biz.operatingHours.forEach((h) => expect(h.closed).toBeFalsy());
    });

    it("has a non-empty accentColor", () => {
      expect(biz.accentColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    it("rating is between 1 and 5", () => {
      expect(biz.rating).toBeGreaterThanOrEqual(1);
      expect(biz.rating).toBeLessThanOrEqual(5);
    });
  });

  it("the global businesses array contains exactly one business", () => {
    expect(businesses).toHaveLength(1);
  });
});
