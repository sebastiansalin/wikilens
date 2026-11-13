"""Regression: Windows without tzdata must export UTC without shifting dates."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
import pyarrow as pa

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'pipeline'))
from prepare_m import utc_rows

class UtcExportTests(unittest.TestCase):
    def test_utc_epoch_values_survive_without_zoneinfo(self):
        batch = pa.record_batch([pa.array([0, 3600123], type=pa.timestamp('ms', tz='UTC'))], names=['timestamp'])
        with patch('zoneinfo.ZoneInfo', side_effect=AssertionError('Must not use IANA data')):
            rows = list(utc_rows(batch))
        self.assertEqual([r['timestamp'] for r in rows], ['1970-01-01T00:00:00Z','1970-01-01T01:00:00.123000Z'])

    def test_non_utc_and_missing_values_are_rejected(self):
        for array in [pa.array([0],type=pa.timestamp('ms',tz='Europe/Helsinki')),pa.array([None],type=pa.timestamp('ms',tz='UTC'))]:
            with self.assertRaises(ValueError):
                list(utc_rows(pa.record_batch([array],names=['timestamp'])))

if __name__ == '__main__':
    unittest.main()
