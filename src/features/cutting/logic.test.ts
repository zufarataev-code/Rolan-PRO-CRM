import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateCutSize, calculateCuttingPlan } from "./logic";

describe("cutting logic", () => {
  it("adds 3 inches of overlap on every side", () => {
    const size = calculateCutSize(30, 50);

    assert.equal(size.cutWidthIn, 36);
    assert.equal(size.cutLengthIn, 56);
    assert.equal(size.glassAreaSqft, 10.4167);
    assert.equal(size.cutAreaSqft, 14);
  });

  it("packs two equal pieces side by side on a 60 inch roll", () => {
    const plan = calculateCuttingPlan([
      {
        id: "w1",
        label: "Kitchen W1",
        glassWidthIn: 24,
        glassHeightIn: 50,
        quantity: 2,
      },
    ]);

    assert.equal(plan.summary.unfitCount, 0);
    assert.equal(plan.summary.pieceCount, 2);
    assert.equal(plan.summary.rollUsages.find((usage) => usage.rollWidthIn === 60)?.requiredLinearIn, 56);
    assert.equal(plan.summary.rollUsages.find((usage) => usage.rollWidthIn === 60)?.wasteSqft, 0);
  });

  it("chooses a 72 inch roll when the cut width cannot fit 60 inches", () => {
    const plan = calculateCuttingPlan([
      {
        id: "wide",
        label: "Wide panel",
        glassWidthIn: 58,
        glassHeightIn: 40,
      },
    ]);

    assert.equal(plan.summary.unfitCount, 0);
    assert.equal(plan.pieces[0].cutWidthIn, 64);
    assert.equal(plan.pieces[0].rollWidthIn, 72);
  });

  it("can rotate a piece only when rotation is allowed", () => {
    const unfit = calculateCuttingPlan([
      {
        id: "door",
        label: "Tall door",
        glassWidthIn: 70,
        glassHeightIn: 20,
      },
    ]);

    assert.equal(unfit.summary.unfitCount, 1);

    const rotated = calculateCuttingPlan([
      {
        id: "door",
        label: "Tall door",
        glassWidthIn: 70,
        glassHeightIn: 20,
        allowRotation: true,
      },
    ]);

    assert.equal(rotated.summary.unfitCount, 0);
    assert.equal(rotated.pieces[0].rotated, true);
    assert.equal(rotated.pieces[0].cutWidthIn, 26);
    assert.equal(rotated.pieces[0].cutLengthIn, 76);
  });

  it("calculates remaining roll material when stock length is provided", () => {
    const plan = calculateCuttingPlan(
      [
        {
          id: "w1",
          label: "Office W1",
          glassWidthIn: 30,
          glassHeightIn: 50,
        },
      ],
      {
        rollStock: [
          {
            rollId: "r60",
            rollWidthIn: 60,
            availableLengthIn: 120,
          },
        ],
      },
    );

    const usage60 = plan.summary.rollUsages.find((usage) => usage.rollWidthIn === 60);

    assert.equal(usage60?.requiredLinearIn, 56);
    assert.equal(usage60?.remainingLinearIn, 64);
    assert.equal(usage60?.shortageLinearIn, 0);
  });

  it("rejects invalid panel dimensions", () => {
    assert.throws(
      () =>
        calculateCuttingPlan([
          {
            glassWidthIn: 0,
            glassHeightIn: 50,
          },
        ]),
      /positive number/,
    );
  });
});
