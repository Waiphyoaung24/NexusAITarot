import json
import traceback
import uuid
import httpx
from typing import Any, Callable, Dict, Mapping, Sequence

from fastapi.responses import StreamingResponse
from openai import OpenAI
from openai.types.chat.chat_completion_message_param import ChatCompletionMessageParam


def stream_text(
    client: OpenAI,
    messages: Sequence[ChatCompletionMessageParam],
    tool_definitions: Sequence[Dict[str, Any]],
    available_tools: Mapping[str, Callable[..., Any]],
    protocol: str = "data",
):
    """Yield Server-Sent Events for a streaming chat completion."""
    try:
        def format_sse(payload: dict) -> str:
            return f"data: {json.dumps(payload, separators=(',', ':'))}\n\n"

        message_id = f"msg-{uuid.uuid4().hex}"
        text_stream_id = "text-1"
        text_started = False
        text_finished = False
        finish_reason = None
        usage_data = None
        tool_calls_state: Dict[int, Dict[str, Any]] = {}

        yield format_sse({"type": "start", "messageId": message_id})

        stream = client.chat.completions.create(
            messages=messages,
            model="gpt-4o",
            stream=True,
            tools=tool_definitions,
        )

        for chunk in stream:
            for choice in chunk.choices:
                if choice.finish_reason is not None:
                    finish_reason = choice.finish_reason

                delta = choice.delta
                if delta is None:
                    continue

                if delta.content is not None:
                    if not text_started:
                        yield format_sse({"type": "text-start", "id": text_stream_id})
                        text_started = True
                    yield format_sse(
                        {"type": "text-delta", "id": text_stream_id, "delta": delta.content}
                    )

                if delta.tool_calls:
                    for tool_call_delta in delta.tool_calls:
                        index = tool_call_delta.index
                        state = tool_calls_state.setdefault(
                            index,
                            {
                                "id": None,
                                "name": None,
                                "arguments": "",
                                "started": False,
                            },
                        )

                        if tool_call_delta.id is not None:
                            state["id"] = tool_call_delta.id
                            if (
                                state["id"] is not None
                                and state["name"] is not None
                                and not state["started"]
                            ):
                                yield format_sse(
                                    {
                                        "type": "tool-input-start",
                                        "toolCallId": state["id"],
                                        "toolName": state["name"],
                                    }
                                )
                                state["started"] = True

                        function_call = getattr(tool_call_delta, "function", None)
                        if function_call is not None:
                            if function_call.name is not None:
                                state["name"] = function_call.name
                                if (
                                    state["id"] is not None
                                    and state["name"] is not None
                                    and not state["started"]
                                ):
                                    yield format_sse(
                                        {
                                            "type": "tool-input-start",
                                            "toolCallId": state["id"],
                                            "toolName": state["name"],
                                        }
                                    )
                                    state["started"] = True

                            if function_call.arguments:
                                if (
                                    state["id"] is not None
                                    and state["name"] is not None
                                    and not state["started"]
                                ):
                                    yield format_sse(
                                        {
                                            "type": "tool-input-start",
                                            "toolCallId": state["id"],
                                            "toolName": state["name"],
                                        }
                                    )
                                    state["started"] = True

                                state["arguments"] += function_call.arguments
                                if state["id"] is not None:
                                    yield format_sse(
                                        {
                                            "type": "tool-input-delta",
                                            "toolCallId": state["id"],
                                            "inputTextDelta": function_call.arguments,
                                        }
                                    )

            if not chunk.choices and chunk.usage is not None:
                usage_data = chunk.usage

        if finish_reason == "stop" and text_started and not text_finished:
            yield format_sse({"type": "text-end", "id": text_stream_id})
            text_finished = True

        if finish_reason == "tool_calls":
            for index in sorted(tool_calls_state.keys()):
                state = tool_calls_state[index]
                tool_call_id = state.get("id")
                tool_name = state.get("name")

                if tool_call_id is None or tool_name is None:
                    continue

                if not state["started"]:
                    yield format_sse(
                        {
                            "type": "tool-input-start",
                            "toolCallId": tool_call_id,
                            "toolName": tool_name,
                        }
                    )
                    state["started"] = True

                raw_arguments = state["arguments"]
                try:
                    parsed_arguments = json.loads(raw_arguments) if raw_arguments else {}
                except Exception as error:
                    yield format_sse(
                        {
                            "type": "tool-input-error",
                            "toolCallId": tool_call_id,
                            "toolName": tool_name,
                            "input": raw_arguments,
                            "errorText": str(error),
                        }
                    )
                    continue

                yield format_sse(
                    {
                        "type": "tool-input-available",
                        "toolCallId": tool_call_id,
                        "toolName": tool_name,
                        "input": parsed_arguments,
                    }
                )

                tool_function = available_tools.get(tool_name)
                if tool_function is None:
                    yield format_sse(
                        {
                            "type": "tool-output-error",
                            "toolCallId": tool_call_id,
                            "errorText": f"Tool '{tool_name}' not found.",
                        }
                    )
                    continue

                try:
                    tool_result = tool_function(**parsed_arguments)
                except Exception as error:
                    yield format_sse(
                        {
                            "type": "tool-output-error",
                            "toolCallId": tool_call_id,
                            "errorText": str(error),
                        }
                    )
                else:
                    yield format_sse(
                        {
                            "type": "tool-output-available",
                            "toolCallId": tool_call_id,
                            "output": tool_result,
                        }
                    )

        if text_started and not text_finished:
            yield format_sse({"type": "text-end", "id": text_stream_id})
            text_finished = True

        finish_metadata: Dict[str, Any] = {}
        if finish_reason is not None:
            finish_metadata["finishReason"] = finish_reason.replace("_", "-")

        if usage_data is not None:
            usage_payload = {
                "promptTokens": usage_data.prompt_tokens,
                "completionTokens": usage_data.completion_tokens,
            }
            total_tokens = getattr(usage_data, "total_tokens", None)
            if total_tokens is not None:
                usage_payload["totalTokens"] = total_tokens
            finish_metadata["usage"] = usage_payload

        if finish_metadata:
            yield format_sse({"type": "finish", "messageMetadata": finish_metadata})
        else:
            yield format_sse({"type": "finish"})

        yield "data: [DONE]\n\n"
    except Exception:
        traceback.print_exc()
        raise


def patch_response_with_headers(
    response: StreamingResponse,
    protocol: str = "data",
) -> StreamingResponse:
    """Apply the standard streaming headers expected by the Vercel AI SDK."""

    response.headers["x-vercel-ai-ui-message-stream"] = "v1"
    response.headers["Cache-Control"] = "no-cache"
    response.headers["Connection"] = "keep-alive"
    response.headers["X-Accel-Buffering"] = "no"

    if protocol:
        response.headers.setdefault("x-vercel-ai-protocol", protocol)

    return response


async def stream_ollama_text(
    ollama_url: str,
    model: str,
    messages: Sequence[ChatCompletionMessageParam],
    protocol: str = "data",
):
    """Yield Server-Sent Events for a streaming Ollama chat completion."""
    
    # Tarot expert system prompt
    TAROT_SYSTEM_PROMPT = """You are a wise and empathetic tarot reader with deep knowledge of tarot symbolism, 
archetypes, and interpretations. You provide insightful, nuanced readings that blend traditional meanings 
with intuitive understanding. Your readings are thoughtful, non-judgmental, and focused on empowerment 
and personal growth. When interpreting cards, you consider their positions, relationships, and the 
querent's specific question or situation."""
    
    try:
        def format_sse(payload: dict) -> str:
            return f"data: {json.dumps(payload, separators=(',', ':'))}\n\n"

        message_id = f"msg-{uuid.uuid4().hex}"
        text_stream_id = "text-1"
        
        yield format_sse({"type": "start", "messageId": message_id})
        yield format_sse({"type": "text-start", "id": text_stream_id})

        # Convert messages to Ollama format
        ollama_messages = []
        
        # Add system message
        ollama_messages.append({
            "role": "system",
            "content": TAROT_SYSTEM_PROMPT
        })
        
        # Add conversation messages
        for msg in messages:
            if msg.get("role") == "system":
                continue  # Skip system messages as we already added our own
            ollama_messages.append({
                "role": msg.get("role", "user"),
                "content": msg.get("content", "")
            })

        # Prepare Ollama request
        ollama_request = {
            "model": model,
            "messages": ollama_messages,
            "stream": True,
            "options": {
                "temperature": 0.8,
                "num_ctx": 4096,
                "num_predict": 1500,
            }
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                f"{ollama_url}/api/chat",
                json=ollama_request,
                headers={"Content-Type": "application/json"}
            ) as response:
                if response.status_code != 200:
                    raise Exception(f"Ollama API error: {response.status_code}")
                
                async for line in response.aiter_lines():
                    if line.strip():
                        try:
                            chunk = json.loads(line)
                            
                            if chunk.get("done", False):
                                # Stream is complete
                                break
                            
                            if "message" in chunk and "content" in chunk["message"]:
                                content = chunk["message"]["content"]
                                if content:
                                    yield format_sse({
                                        "type": "text-delta",
                                        "id": text_stream_id,
                                        "delta": content
                                    })
                        except json.JSONDecodeError:
                            continue

        yield format_sse({"type": "text-end", "id": text_stream_id})
        yield format_sse({
            "type": "finish",
            "messageMetadata": {"finishReason": "stop"}
        })
        yield "data: [DONE]\n\n"

    except Exception as e:
        traceback.print_exc()
        yield format_sse({
            "type": "error",
            "error": str(e)
        })
        raise
