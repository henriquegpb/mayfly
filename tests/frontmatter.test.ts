import { describe, expect, test } from "bun:test";
import { parseFrontmatter } from "../src/parser/frontmatter.ts";
import { MfParseError } from "../src/parser/types.ts";

describe("parseFrontmatter", () => {
  test("parses a valid header and separates the body", () => {
    const content = [
      "---",
      "expires: 2026-09-01",
      "on_expire: hide",
      'reason: "remove after v2"',
      "---",
      "",
      "# Body heading",
      "Some text.",
    ].join("\n");

    const { metadata, body } = parseFrontmatter(content);
    expect(metadata.expires).toBeInstanceOf(Date);
    expect(metadata.onExpire).toBe("hide");
    expect(metadata.reason).toBe("remove after v2");
    expect(body).toContain("# Body heading");
    expect(body).toContain("Some text.");
  });

  test("date-only `expires` is UTC midnight", () => {
    const { metadata } = parseFrontmatter("---\nexpires: 2026-09-01\n---\n");
    expect(metadata.expires?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  test("respects an explicit UTC offset", () => {
    const { metadata } = parseFrontmatter(
      "---\nexpires: 2026-09-01T00:00:00-03:00\n---\n",
    );
    expect(metadata.expires?.toISOString()).toBe("2026-09-01T03:00:00.000Z");
  });

  test("defaults on_expire to warn", () => {
    const { metadata } = parseFrontmatter("---\nexpires: 2026-09-01\n---\n");
    expect(metadata.onExpire).toBe("warn");
  });

  test("parses expires_when conditions", () => {
    const content = [
      "---",
      "expires_when:",
      '  file_exists: "src/new-api.ts"',
      "---",
      "",
    ].join("\n");
    const { metadata } = parseFrontmatter(content);
    expect(metadata.expires).toBeUndefined();
    expect(metadata.expiresWhen?.file_exists).toBe("src/new-api.ts");
  });

  test("accepts both expires and expires_when", () => {
    const content = [
      "---",
      "expires: 2026-09-01",
      "expires_when:",
      '  file_absent: "legacy/old.ts"',
      "---",
    ].join("\n");
    const { metadata } = parseFrontmatter(content);
    expect(metadata.expires).toBeInstanceOf(Date);
    expect(metadata.expiresWhen?.file_absent).toBe("legacy/old.ts");
  });

  test("handles CRLF line endings", () => {
    const content = "---\r\nexpires: 2026-09-01\r\n---\r\nbody\r\n";
    const { metadata, body } = parseFrontmatter(content);
    expect(metadata.expires).toBeInstanceOf(Date);
    expect(body).toContain("body");
  });

  describe("errors", () => {
    test("missing header throws with missing-header code", () => {
      try {
        parseFrontmatter("# Just markdown\nno header here\n");
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(MfParseError);
        expect((err as MfParseError).code).toBe("missing-header");
      }
    });

    test("malformed YAML throws invalid", () => {
      const content = "---\nexpires: : :\n  bad: [unterminated\n---\n";
      expect(() => parseFrontmatter(content)).toThrow(MfParseError);
    });

    test("missing both expires and expires_when throws", () => {
      expect(() => parseFrontmatter('---\nreason: "x"\n---\n')).toThrow(
        /must declare `expires`/,
      );
    });

    test("invalid on_expire throws", () => {
      expect(() =>
        parseFrontmatter("---\nexpires: 2026-09-01\non_expire: nuke\n---\n"),
      ).toThrow(/invalid `on_expire`/);
    });

    test("unsupported expires_when condition throws", () => {
      const content = [
        "---",
        "expires_when:",
        '  branch_merged: "feature/x"',
        "---",
      ].join("\n");
      expect(() => parseFrontmatter(content)).toThrow(/unsupported `expires_when`/);
    });

    test("empty expires_when throws", () => {
      expect(() => parseFrontmatter("---\nexpires_when: {}\n---\n")).toThrow(
        /at least one condition/,
      );
    });

    test("invalid date string throws", () => {
      expect(() => parseFrontmatter('---\nexpires: "not-a-date"\n---\n')).toThrow(
        /not a valid/,
      );
    });

    test("non-mapping frontmatter throws", () => {
      expect(() => parseFrontmatter("---\n- just\n- a\n- list\n---\n")).toThrow(
        /must be a YAML mapping/,
      );
    });
  });
});
