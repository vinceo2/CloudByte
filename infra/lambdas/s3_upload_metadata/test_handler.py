import json
import os
import unittest
from unittest.mock import MagicMock, patch

import handler


class S3UploadMetadataHandlerTests(unittest.TestCase):
    def setUp(self):
        os.environ["INTERNAL_API_URL"] = "https://internal.example.com/upload-metadata"
        os.environ["INTERNAL_API_CLIENT_ID"] = "lambda-client"
        os.environ["INTERNAL_API_CLIENT_SECRET"] = "lambda-secret"
        os.environ["COMPRESSION_QUEUE_URL"] = "https://sqs.us-east-1.amazonaws.com/123456789012/compression.fifo"
        os.environ["INDEXING_QUEUE_URL"] = "https://sqs.us-east-1.amazonaws.com/123456789012/indexing.fifo"
        os.environ["AWS_REGION"] = "us-east-1"

    @patch("handler.requests.post")
    @patch("handler.boto3.client")
    def test_under_threshold_marks_complete(self, mock_boto3_client, mock_post):
        mock_post.return_value = MagicMock(status_code=200, content=b'{"ok": true}', json=lambda: {"ok": True})
        mock_boto3_client.return_value.head_object.return_value = {"ContentLength": 5 * 1024 * 1024}

        event = {
            "Records": [
                {
                    "s3": {
                        "bucket": {"name": "cloudbyte-files-dev"},
                        "object": {"key": "user-123/profile.png", "size": 5 * 1024 * 1024},
                    }
                }
            ]
        }

        result = handler.handler(event, None)

        self.assertEqual(result["processed"], 1)
        self.assertEqual(result["results"][0]["uploadStatus"], "COMPLETED")
        mock_post.assert_called_once()
        mock_boto3_client.return_value.send_message.assert_not_called()

    @patch("handler.requests.post")
    @patch("handler.boto3.client")
    def test_exact_threshold_enqueues_compression(self, mock_boto3_client, mock_post):
        mock_post.return_value = MagicMock(status_code=200, content=b'{"ok": true}', json=lambda: {"ok": True})
        mock_boto3_client.return_value.head_object.return_value = {"ContentLength": 20 * 1024 * 1024, "ContentType": "image/jpeg"}

        event = {
            "Records": [
                {
                    "s3": {
                        "bucket": {"name": "cloudbyte-files-dev"},
                        "object": {"key": "user-123/limit.jpg", "size": 20 * 1024 * 1024},
                    }
                }
            ]
        }

        result = handler.handler(event, None)

        self.assertEqual(result["results"][0]["uploadStatus"], "PENDING_COMPRESSION")
        mock_post.assert_called_once()
        mock_boto3_client.return_value.send_message.assert_called_once()

    @patch("handler.requests.post")
    @patch("handler.boto3.client")
    def test_over_threshold_enqueues_compression(self, mock_boto3_client, mock_post):
        mock_post.return_value = MagicMock(status_code=200, content=b'{"ok": true}', json=lambda: {"ok": True})
        mock_boto3_client.return_value.head_object.return_value = {"ContentLength": 25 * 1024 * 1024, "ContentType": "video/mp4"}

        event = {
            "Records": [
                {
                    "s3": {
                        "bucket": {"name": "cloudbyte-files-dev"},
                        "object": {"key": "user-123/video.mp4", "size": 25 * 1024 * 1024},
                    }
                }
            ]
        }

        result = handler.handler(event, None)

        self.assertEqual(result["results"][0]["uploadStatus"], "PENDING_COMPRESSION")
        mock_post.assert_called_once()
        mock_boto3_client.return_value.send_message.assert_called_once()

    @patch("handler.requests.post")
    @patch("handler.boto3.client")
    def test_over_threshold_non_media_does_not_enqueue_compression(self, mock_boto3_client, mock_post):
        mock_post.return_value = MagicMock(status_code=200, content=b'{"ok": true}', json=lambda: {"ok": True})
        mock_boto3_client.return_value.head_object.return_value = {"ContentLength": 25 * 1024 * 1024, "ContentType": "application/pdf"}

        event = {
            "Records": [
                {
                    "s3": {
                        "bucket": {"name": "cloudbyte-files-dev"},
                        "object": {"key": "user-123/report.pdf", "size": 25 * 1024 * 1024},
                    }
                }
            ]
        }

        result = handler.handler(event, None)

        self.assertEqual(result["results"][0]["uploadStatus"], "COMPLETED")
        mock_post.assert_called_once()
        mock_boto3_client.return_value.send_message.assert_not_called()

    @patch("handler.requests.post")
    @patch("handler.boto3.client")
    def test_eligible_text_upload_enqueues_indexing(self, mock_boto3_client, mock_post):
        mock_post.return_value = MagicMock(
            status_code=200,
            content=b'{"fileId": "file-123", "ownerId": "user-123", "fileName": "notes.txt"}',
            json=lambda: {"fileId": "file-123", "ownerId": "user-123", "fileName": "notes.txt"},
        )
        mock_boto3_client.return_value.head_object.return_value = {"ContentLength": 2048, "ContentType": "text/plain"}

        event = {
            "Records": [
                {
                    "s3": {
                        "bucket": {"name": "cloudbyte-files-dev"},
                        "object": {"key": "user-123/notes.txt", "size": 2048},
                    }
                }
            ]
        }

        result = handler.handler(event, None)

        self.assertEqual(result["results"][0]["uploadStatus"], "COMPLETED")
        self.assertIn("indexingQueue", result["results"][0])
        mock_post.assert_called_once()
        self.assertEqual(mock_boto3_client.return_value.send_message.call_count, 1)
        sent_payload = mock_boto3_client.return_value.send_message.call_args.kwargs["MessageBody"]
        self.assertIn("PENDING_INDEXING", sent_payload)
        self.assertIn("fileId", sent_payload)


if __name__ == "__main__":
    unittest.main()
