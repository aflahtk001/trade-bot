import unittest
from train import split_samples

class SplitTests(unittest.TestCase):
    def test_rejects_insufficient_data(self):
        with self.assertRaises(ValueError):
            split_samples([])

    def test_chronological_and_purged(self):
        samples = []
        start = 1788138000000
        for week in range(8):
            for row in range(60):
                at = start + week * 7 * 86400000 + row * 60000
                samples.append({"received": at, "observed": at + 1800000, "label": ["positive", "negative", "neutral"][row % 3]})
        train, calibration, test = split_samples(samples)
        self.assertLess(max(s["observed"] for s in train), min(s["received"] for s in calibration))
        self.assertLess(max(s["observed"] for s in calibration), min(s["received"] for s in test))

if __name__ == '__main__':
    unittest.main()
