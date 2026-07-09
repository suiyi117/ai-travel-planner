import unittest

from services.train_parser import classify_train, parse_train_result


class TrainParserTests(unittest.TestCase):
    def test_classify_train_uses_public_code_prefix(self):
        self.assertEqual(classify_train("G651"), "高铁")
        self.assertEqual(classify_train("K507"), "快速")
        self.assertEqual(classify_train("1234"), "普速")

    def test_parse_train_result_picks_display_train_code_by_pattern(self):
        fields = [""] * 37
        fields[2] = "internal-train-no"
        fields[3] = "G651"
        fields[4] = "TJP"
        fields[6] = "BJP"
        fields[7] = "XAY"
        fields[8] = "07:00"
        fields[9] = "12:35"
        fields[10] = "05:35"
        fields[30] = "8"

        result = parse_train_result(
            fields,
            "北京",
            "西安",
            lambda code: {"BJP": "北京", "XAY": "西安"}.get(code),
        )

        self.assertIsNotNone(result)
        self.assertEqual(result["id"], "G651")
        self.assertEqual(result["from_station"], "北京")
        self.assertEqual(result["to_station"], "西安")
        self.assertEqual(result["duration_minutes"], 335)
        self.assertEqual(result["seats"]["二等座"], "8")


if __name__ == "__main__":
    unittest.main()
