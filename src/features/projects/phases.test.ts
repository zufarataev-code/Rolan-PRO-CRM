import assert from "node:assert/strict";
import test from "node:test";

import { validatePhaseAssignments } from "./phases";

test("installation phase requires at least one installer assignment", () => {
  assert.equal(validatePhaseAssignments(["position-1"], []), "missing_installers");
});

test("every selected position must have exactly one responsible installer", () => {
  assert.equal(
    validatePhaseAssignments(
      ["position-1", "position-2"],
      [{ project_position_id: "position-1", installer_id: "installer-1" }],
    ),
    "unassigned_positions",
  );

  assert.equal(
    validatePhaseAssignments(
      ["position-1"],
      [
        { project_position_id: "position-1", installer_id: "installer-1" },
        { project_position_id: "position-1", installer_id: "installer-2" },
      ],
    ),
    "duplicate_assignment",
  );
});

test("valid phase assignments may use multiple installers across services", () => {
  assert.equal(
    validatePhaseAssignments(
      ["position-1", "position-2", "position-3"],
      [
        { project_position_id: "position-1", installer_id: "installer-1" },
        { project_position_id: "position-2", installer_id: "installer-2" },
        { project_position_id: "position-3", installer_id: "installer-1" },
      ],
    ),
    null,
  );
});
