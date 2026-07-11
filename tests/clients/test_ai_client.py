import asyncio
import json
import unittest

import httpx

from clients.ai import (
    AiClientError,
    build_chat_payload,
    calculate_max_tokens,
    extract_chat_content,
    request_chat_completion,
)
from planner.prompting import SYSTEM_PROMPT


class AiClientPayloadTests(unittest.TestCase):
    def test_calculate_max_tokens_caps_at_8000(self):
        self.assertEqual(calculate_max_tokens(3, 2), 3450)
        self.assertEqual(calculate_max_tokens(30, 10), 8000)

    def test_build_chat_payload_uses_system_prompt_and_user_prompt(self):
        payload = build_chat_payload("test-model", "用户 prompt", 3, 2)

        self.assertEqual(payload["model"], "test-model")
        self.assertEqual(payload["messages"][0], {"role": "system", "content": SYSTEM_PROMPT})
        self.assertEqual(payload["messages"][1], {"role": "user", "content": "用户 prompt"})
        self.assertEqual(payload["temperature"], 0.7)
        self.assertEqual(payload["max_tokens"], 3450)

    def test_extract_chat_content_strips_response_content(self):
        content = extract_chat_content({"choices": [{"message": {"content": "  {\"ok\": true}  "}}]})

        self.assertEqual(content, '{"ok": true}')

    def test_extract_chat_content_raises_on_unexpected_shape(self):
        with self.assertRaises(AiClientError):
            extract_chat_content({"choices": []})


class AiClientRequestTests(unittest.TestCase):
    def test_request_chat_completion_posts_to_openai_compatible_endpoint(self):
        captured = {}

        async def handler(request: httpx.Request) -> httpx.Response:
            captured["url"] = str(request.url)
            captured["authorization"] = request.headers.get("authorization")
            captured["payload"] = json.loads(request.content.decode("utf-8"))
            return httpx.Response(200, json={"choices": [{"message": {"content": " result "}}]})

        result = asyncio.run(request_chat_completion(
            api_key="test-token",  # pragma: allowlist secret
            base_url="https://ai.example/v1",
            model="demo-model",
            prompt="hello",
            days=1,
            destination_count=1,
            transport=httpx.MockTransport(handler),
        ))

        self.assertEqual(result, "result")
        self.assertEqual(captured["url"], "https://ai.example/v1/chat/completions")
        self.assertEqual(captured["authorization"], "Bearer test-token")
        self.assertEqual(captured["payload"]["model"], "demo-model")

    def test_request_chat_completion_raises_ai_client_error_on_non_200(self):
        async def handler(_: httpx.Request) -> httpx.Response:
            return httpx.Response(401, text="bad key")

        with self.assertRaisesRegex(AiClientError, "401"):
            asyncio.run(request_chat_completion(
                api_key="test-token",  # pragma: allowlist secret
                base_url="https://ai.example/v1",
                model="demo-model",
                prompt="hello",
                days=1,
                destination_count=1,
                transport=httpx.MockTransport(handler),
            ))


if __name__ == "__main__":
    unittest.main()
