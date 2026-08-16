import os
import unittest
from unittest.mock import MagicMock, patch

import handler


class PendingFileCleanupHandlerTests(unittest.TestCase):
    def setUp(self):
        os.environ["INTERNAL_API_URL"] = "https://internal.example.com"
        os.environ["INTERNAL_API_CLIENT_ID"] = "cleanup-lambda"
        os.environ["INTERNAL_API_CLIENT_SECRET"] = "cleanup-secret"

    @patch("handler.requests.delete")
    def test_deletes_stale_pending_uploads(self, mock_delete):
        mock_delete.return_value = MagicMock(
            status_code=200,
            content=b'{"deletedCount": 3}',
            json=lambda: {"deletedCount": 3, "cutoff": "2026-08-16T00:00:00.000Z"},
        )

        result = handler.handler({}, None)

        self.assertEqual(result["deletedCount"], 3)
        mock_delete.assert_called_once_with(
            "https://internal.example.com/upload-metadata/pending",
            headers={
                "Accept": "application/json",
                "x-internal-client-id": "cleanup-lambda",
                "x-internal-client-secret": "cleanup-secret",
            },
            timeout=15,
        )

    def test_requires_internal_api_url(self):
        del os.environ["INTERNAL_API_URL"]

        with self.assertRaisesRegex(RuntimeError, "INTERNAL_API_URL"):
            handler.handler({}, None)


if __name__ == "__main__":
    unittest.main()