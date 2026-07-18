import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

import server
from core.settings import parse_bool_env, resolve_allowed_origins


class RuntimeConfigTests(unittest.TestCase):
    def test_parse_bool_env_accepts_explicit_truthy_values(self):
        self.assertTrue(parse_bool_env("true"))
        self.assertTrue(parse_bool_env("1"))
        self.assertTrue(parse_bool_env("YES"))
        self.assertFalse(parse_bool_env("false"))
        self.assertFalse(parse_bool_env(None))

    def test_default_allowed_origins_are_local_development_origins(self):
        origins = resolve_allowed_origins(None, "development")

        self.assertIn("http://localhost:8000", origins)
        self.assertNotIn("*", origins)

    def test_production_rejects_wildcard_cors(self):
        with self.assertRaises(RuntimeError):
            resolve_allowed_origins("*", "production")


class RuntimeHardeningTests(unittest.TestCase):
    def test_lifespan_initializes_station_data_once(self):
        async def run_lifespan():
            async with server.app.router.lifespan_context(server.app):
                pass

        with patch("server.init_station_data", new_callable=AsyncMock) as initialize:
            asyncio.run(run_lifespan())

        initialize.assert_awaited_once_with()

    def test_health_response_has_request_id_and_security_headers(self):
        client = TestClient(server.app)

        response = client.get("/api/health", headers={"x-request-id": "test-request-id"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["x-request-id"], "test-request-id")
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")
        self.assertEqual(response.headers["x-frame-options"], "DENY")
        self.assertEqual(response.headers["referrer-policy"], "no-referrer")
        self.assertIn("environment", response.json())

    def test_config_hides_client_keys_by_default(self):
        original_expose = server.EXPOSE_CLIENT_CONFIG
        original_amap_key = server.AMAP_KEY
        original_security_key = server.AMAP_SECURITY_KEY
        server.EXPOSE_CLIENT_CONFIG = False
        server.AMAP_KEY = "test-amap-key"
        server.AMAP_SECURITY_KEY = "test-security-key"
        try:
            client = TestClient(server.app)

            response = client.get("/api/config")

            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["amap_key"], "")
            self.assertEqual(data["amap_security_key"], "")
            self.assertFalse(data["client_config_exposed"])
        finally:
            server.EXPOSE_CLIENT_CONFIG = original_expose
            server.AMAP_KEY = original_amap_key
            server.AMAP_SECURITY_KEY = original_security_key


if __name__ == "__main__":
    unittest.main()
