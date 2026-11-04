"""Backwater-aware stacks (fim-commander ADR 0013) through the manifest and validator.

A stack may repeat a flow once per downstream control when it also says, per
layer, which control that is (``boundary_condition`` and ``ds_wse``). The
manifest reports the families and the validator holds the layer key
``(flow, boundary_condition, ds_wse)`` unique. A repeated flow without the two
variables is two layers nobody can tell apart, and fails.
"""

from __future__ import annotations

import shutil
import tempfile
import unittest
from pathlib import Path

from pipeline.fim2d import manifest as manifest_builder
from pipeline.fim2d import validate as validator

from . import fixture_nc

FLOWS = (100.0, 200.0, 200.0, 200.0, 300.0)
CONTROLS = (("nd", 101.2), ("nd", 102.0), ("kwse", 104.0), ("kwse", 106.0), ("nd", 103.1))


class BackwaterStackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="fim-backwater-"))
        cls.labeled = fixture_nc.write_stack(
            cls.tmp / "labeled.nc", stream_id="wb-1", variable="depth",
            flows=FLOWS, controls=CONTROLS)
        cls.unlabeled = fixture_nc.write_stack(
            cls.tmp / "unlabeled.nc", stream_id="wb-2", variable="depth", flows=FLOWS)
        cls.plain = fixture_nc.write_stack(cls.tmp / "plain.nc", stream_id="wb-3")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def _validate(self, path: Path) -> validator.Report:
        entry = manifest_builder.describe(path, self.tmp)
        self.assertIsNotNone(entry)
        report = validator.Report()
        validator.validate_data(self.tmp, {"streams": [entry]}, report)
        return report

    def test_manifest_reports_the_families(self):
        entry = manifest_builder.describe(self.labeled, self.tmp)
        self.assertEqual(entry["flow_count"], 5)
        self.assertEqual(entry["controls"]["nd"], 3)
        self.assertEqual(entry["controls"]["kwse"], 2)
        self.assertEqual(entry["controls"]["kwse_ds_wse_range"], [104.0, 106.0])
        self.assertEqual(entry["controls"]["ds_wse_units"], "feet")
        self.assertIsNone(manifest_builder.describe(self.plain, self.tmp)["controls"])

    def test_labeled_repeated_flows_validate(self):
        report = self._validate(self.labeled)
        self.assertEqual(report.failures, [])

    def test_plain_stack_still_validates(self):
        self.assertEqual(self._validate(self.plain).failures, [])

    def test_repeated_flow_without_controls_fails(self):
        failures = self._validate(self.unlabeled).failures
        self.assertTrue(any("repeated flow" in f for f in failures), failures)

    def test_duplicate_key_fails(self):
        dup = fixture_nc.write_stack(
            self.tmp / "dup.nc", stream_id="wb-4", variable="depth",
            flows=(200.0, 200.0), controls=(("kwse", 104.0), ("kwse", 104.04)))
        failures = self._validate(dup).failures
        self.assertTrue(any("duplicate" in f for f in failures), failures)


if __name__ == "__main__":
    unittest.main()
