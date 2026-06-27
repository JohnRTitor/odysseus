"""Tests for optional reasoning-effort and verbosity request controls."""

import asyncio

from src import llm_core


class _FakeResp:
    status_code = 200

    async def aiter_lines(self):
        yield 'data: {"choices":[{"delta":{"content":"ok"}}]}'
        yield "data: [DONE]"

    async def aread(self):
        return b""


class _FakeStreamCtx:
    def __init__(self, captured):
        self._captured = captured

    async def __aenter__(self):
        return _FakeResp()

    async def __aexit__(self, *exc):
        return False


class _FakeClient:
    def __init__(self):
        self.captured_payload = {}

    def stream(self, method, url, **kwargs):
        self.captured_payload = kwargs.get("json") or {}
        return _FakeStreamCtx(self.captured_payload)


def _capture_stream_payload(monkeypatch, url, model, **kwargs):
    client = _FakeClient()
    monkeypatch.setattr(llm_core, "_get_http_client", lambda: client)
    monkeypatch.setattr(llm_core, "_is_host_dead", lambda u: False)
    monkeypatch.setattr(llm_core, "note_model_activity", lambda *a, **k: None)
    monkeypatch.setattr(llm_core, "_clear_host_dead", lambda *a, **k: None)
    monkeypatch.setattr(llm_core, "get_context_length", lambda u, m: 32768)

    async def run():
        return [chunk async for chunk in llm_core.stream_llm(
            url,
            model,
            [{"role": "user", "content": "Hi"}],
            **kwargs,
        )]

    asyncio.run(run())
    return client.captured_payload


def test_chatgpt_subscription_payload_adds_supported_controls():
    payload = llm_core._build_chatgpt_responses_payload(
        "gpt-5.1-codex",
        [{"role": "user", "content": "Hi"}],
        temperature=0.2,
        max_tokens=0,
        reasoning_effort="high",
        verbosity="low",
    )

    assert payload["reasoning"] == {"effort": "high"}
    assert payload["text"] == {"verbosity": "low"}


def test_chatgpt_subscription_payload_maps_off_to_none_for_newer_gpt5():
    payload = llm_core._build_chatgpt_responses_payload(
        "gpt-5.5",
        [{"role": "user", "content": "Hi"}],
        temperature=0.2,
        max_tokens=0,
        reasoning_effort="off",
    )

    assert payload["reasoning"] == {"effort": "none"}


def test_chatgpt_subscription_payload_omits_none_for_pre_5_1_gpt5():
    payload = llm_core._build_chatgpt_responses_payload(
        "gpt-5",
        [{"role": "user", "content": "Hi"}],
        temperature=0.2,
        max_tokens=0,
        reasoning_effort="off",
    )

    assert "reasoning" not in payload


def test_chatgpt_subscription_payload_auto_omits_controls():
    payload = llm_core._build_chatgpt_responses_payload(
        "gpt-5.1-codex",
        [{"role": "user", "content": "Hi"}],
        temperature=0.2,
        max_tokens=0,
        reasoning_effort="auto",
        verbosity="auto",
    )

    assert "reasoning" not in payload
    assert "text" not in payload


def test_chatgpt_subscription_payload_unsupported_model_omits_controls():
    payload = llm_core._build_chatgpt_responses_payload(
        "gpt-4o",
        [{"role": "user", "content": "Hi"}],
        temperature=0.2,
        max_tokens=0,
        reasoning_effort="high",
        verbosity="high",
    )

    assert "reasoning" not in payload
    assert "text" not in payload


def test_chatgpt_subscription_payload_o_series_omits_minimal_reasoning():
    payload = llm_core._build_chatgpt_responses_payload(
        "o3-mini",
        [{"role": "user", "content": "Hi"}],
        temperature=0.2,
        max_tokens=0,
        reasoning_effort="minimal",
        verbosity="high",
    )

    assert "reasoning" not in payload
    assert "text" not in payload


def test_chatgpt_subscription_payload_o_series_accepts_high_reasoning():
    payload = llm_core._build_chatgpt_responses_payload(
        "o3-mini",
        [{"role": "user", "content": "Hi"}],
        temperature=0.2,
        max_tokens=0,
        reasoning_effort="high",
    )

    assert payload["reasoning"] == {"effort": "high"}


def test_chatgpt_subscription_payload_invalid_values_omit_controls():
    payload = llm_core._build_chatgpt_responses_payload(
        "gpt-5.1-codex",
        [{"role": "user", "content": "Hi"}],
        temperature=0.2,
        max_tokens=0,
        reasoning_effort="maximum",
        verbosity="long",
    )

    assert "reasoning" not in payload
    assert "text" not in payload


def test_ollama_native_reasoning_control_maps_to_binary_think():
    messages = [{"role": "user", "content": "Hi"}]

    auto_payload = llm_core._build_ollama_payload(
        "qwen3:14b",
        messages,
        temperature=0.2,
        max_tokens=0,
        reasoning_effort="auto",
    )
    off_payload = llm_core._build_ollama_payload(
        "qwen3:14b",
        messages,
        temperature=0.2,
        max_tokens=0,
        reasoning_effort="off",
    )
    on_payload = llm_core._build_ollama_payload(
        "qwen3:14b",
        messages,
        temperature=0.2,
        max_tokens=0,
        reasoning_effort="high",
    )

    assert "think" not in auto_payload
    assert off_payload["think"] is False
    assert on_payload["think"] is True


def test_generic_openai_compatible_endpoint_does_not_receive_controls(monkeypatch):
    payload = _capture_stream_payload(
        monkeypatch,
        "https://api.openai.com/v1/chat/completions",
        "gpt-5.1-codex",
        reasoning_effort="high",
        verbosity="high",
    )

    assert payload["model"] == "gpt-5.1-codex"
    assert "reasoning" not in payload
    assert "text" not in payload
    assert "reasoning_effort" not in payload
    assert "verbosity" not in payload


def test_ollama_openai_compat_auto_preserves_think_false(monkeypatch):
    payload = _capture_stream_payload(
        monkeypatch,
        "http://127.0.0.1:11434/v1/chat/completions",
        "qwen3:14b",
        reasoning_effort="auto",
    )

    assert payload["think"] is False


def test_ollama_openai_compat_explicit_reasoning_enables_think(monkeypatch):
    payload = _capture_stream_payload(
        monkeypatch,
        "http://127.0.0.1:11434/v1/chat/completions",
        "qwen3:14b",
        reasoning_effort="high",
    )

    assert payload["think"] is True


def test_ollama_openai_compat_off_disables_think(monkeypatch):
    payload = _capture_stream_payload(
        monkeypatch,
        "http://127.0.0.1:11434/v1/chat/completions",
        "qwen3:14b",
        reasoning_effort="off",
    )

    assert payload["think"] is False


def test_ollama_openai_compat_non_thinking_model_omits_think(monkeypatch):
    payload = _capture_stream_payload(
        monkeypatch,
        "http://127.0.0.1:11434/v1/chat/completions",
        "llama3.2:3b",
        reasoning_effort="high",
    )

    assert "think" not in payload


def test_ollama_payload_maps_inference_parameters():
    messages = [{"role": "user", "content": "Hi"}]
    payload = llm_core._build_ollama_payload(
        "llama3.2",
        messages,
        max_tokens=0,
        temperature=0.7,
        top_p=0.9,
        top_k=40,
        repeat_penalty=1.1,
        presence_penalty=0.5,
        frequency_penalty=0.5,
        seed=42,
        context_window=8192,
    )
    assert payload["options"]["temperature"] == 0.7
    assert payload["options"]["top_p"] == 0.9
    assert payload["options"]["top_k"] == 40
    assert payload["options"]["repeat_penalty"] == 1.1
    assert payload["options"]["presence_penalty"] == 0.5
    assert payload["options"]["frequency_penalty"] == 0.5
    assert payload["options"]["seed"] == 42
    assert payload["options"]["num_ctx"] == 8192


def test_chatgpt_payload_maps_inference_parameters():
    messages = [{"role": "user", "content": "Hi"}]
    payload = llm_core._build_chatgpt_responses_payload(
        "gpt-4o",
        messages,
        max_tokens=0,
        temperature=0.7,
        top_p=0.9,
        presence_penalty=0.5,
        frequency_penalty=0.5,
        seed=42,
    )
    assert payload["temperature"] == 0.7
    assert payload["top_p"] == 0.9
    assert payload["presence_penalty"] == 0.5
    assert payload["frequency_penalty"] == 0.5
    assert payload["seed"] == 42


def test_anthropic_payload_maps_inference_parameters():
    messages = [{"role": "user", "content": "Hi"}]
    payload = llm_core._build_anthropic_payload(
        "claude-3-5-sonnet",
        messages,
        max_tokens=0,
        temperature=0.7,
        top_p=0.9,
        top_k=40,
    )
    assert payload["temperature"] == 0.7
    assert payload["top_p"] == 0.9
    assert payload["top_k"] == 40

