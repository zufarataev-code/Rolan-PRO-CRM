import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseCuttingPreviewPayload } from "./api";

describe("cutting preview payload parser", () => {
  it("accepts camelCase panel fields", () => {
    const parsed = parseCuttingPreviewPayload({
      panels: [
        {
          id: "p1",
          roomName: "Kitchen",
          windowName: "W1",
          glassWidthIn: "30,5",
          glassHeightIn: 50,
          quantity: 2,
          allowRotation: true,
        },
      ],
    });

    assert.equal(parsed.ok, true);

    if (parsed.ok) {
      assert.equal(parsed.panels[0].glassWidthIn, 30.5);
      assert.equal(parsed.panels[0].quantity, 2);
      assert.equal(parsed.panels[0].allowRotation, true);
    }
  });

  it("accepts snake_case options and roll stock", () => {
    const parsed = parseCuttingPreviewPayload({
      panels: [
        {
          glass_width_in: 24,
          glass_height_in: 50,
        },
      ],
      options: {
        overlap_in: 3,
        roll_widths_in: [60, "72"],
        roll_stock: [
          {
            roll_id: "r60",
            roll_width_in: 60,
            available_length_in: 120,
          },
        ],
      },
    });

    assert.equal(parsed.ok, true);

    if (parsed.ok) {
      assert.deepEqual(parsed.options.rollWidthsIn, [60, 72]);
      assert.equal(parsed.options.rollStock?.[0].availableLengthIn, 120);
    }
  });

  it("rejects missing panels", () => {
    const parsed = parseCuttingPreviewPayload({});

    assert.equal(parsed.ok, false);

    if (!parsed.ok) {
      assert.equal(parsed.code, "invalid_payload");
    }
  });

  it("rejects non-positive dimensions", () => {
    const parsed = parseCuttingPreviewPayload({
      panels: [
        {
          glassWidthIn: 0,
          glassHeightIn: 50,
        },
      ],
    });

    assert.equal(parsed.ok, false);

    if (!parsed.ok) {
      assert.equal(parsed.code, "invalid_panel_width");
    }
  });
});
