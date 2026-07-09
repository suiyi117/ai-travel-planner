import httpx

from planner.prompting import SYSTEM_PROMPT


class AiClientError(RuntimeError):
    pass


def calculate_max_tokens(days: int, destination_count: int) -> int:
    return min(8000, 2000 + days * 350 + destination_count * 200)


def build_chat_payload(model: str, prompt: str, days: int, destination_count: int) -> dict:
    return {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "max_tokens": calculate_max_tokens(days, destination_count),
    }


def extract_chat_content(response_data: dict) -> str:
    try:
        return response_data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError, AttributeError) as exc:
        raise AiClientError("AI API 返回结构异常") from exc


async def request_chat_completion(
    *,
    api_key: str,
    base_url: str,
    model: str,
    prompt: str,
    days: int,
    destination_count: int,
    transport: httpx.AsyncBaseTransport | None = None,
) -> str:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = build_chat_payload(model, prompt, days, destination_count)

    async with httpx.AsyncClient(timeout=60, transport=transport) as client:
        response = await client.post(
            f"{base_url}/chat/completions",
            headers=headers,
            json=payload,
        )

    if response.status_code != 200:
        raise AiClientError(f"AI API 错误 ({response.status_code}): {response.text[:200]}")

    return extract_chat_content(response.json())
