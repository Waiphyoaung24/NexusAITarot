from typing import List, Optional
from pydantic import BaseModel
from dotenv import load_dotenv
from fastapi import FastAPI, Query, Request as FastAPIRequest, HTTPException
from fastapi.responses import StreamingResponse
from openai import OpenAI
import httpx
import json
from .utils.prompt import ClientMessage, convert_to_openai_messages
from .utils.stream import patch_response_with_headers, stream_text, stream_ollama_text
from .utils.tools import AVAILABLE_TOOLS, TOOL_DEFINITIONS
from vercel import oidc
from vercel.headers import set_headers


load_dotenv(".env.local")

app = FastAPI()


@app.middleware("http")
async def _vercel_set_headers(request: FastAPIRequest, call_next):
    set_headers(dict(request.headers))
    return await call_next(request)


class Request(BaseModel):
    messages: List[ClientMessage]

class OllamaRequest(BaseModel):
    messages: List[ClientMessage]
    model: str = "deepseek-r1:8b"
    ollama_url: str = "http://localhost:11434"


@app.post("/api/chat")
async def handle_chat_data(request: Request, protocol: str = Query('data')):
    messages = request.messages
    openai_messages = convert_to_openai_messages(messages)

    client = OpenAI(api_key=oidc.get_vercel_oidc_token(), base_url="https://ai-gateway.vercel.sh/v1")
    response = StreamingResponse(
        stream_text(client, openai_messages, TOOL_DEFINITIONS, AVAILABLE_TOOLS, protocol),
        media_type="text/event-stream",
    )
    return patch_response_with_headers(response, protocol)

@app.post("/api/chat/ollama")
async def handle_ollama_chat(request: OllamaRequest, protocol: str = Query('data')):
    messages = request.messages
    ollama_messages = convert_to_openai_messages(messages)
    
    # Check if Ollama is available
    try:
        async with httpx.AsyncClient() as client:
            health_response = await client.get(f"{request.ollama_url}/api/tags", timeout=5.0)
            if health_response.status_code != 200:
                raise HTTPException(status_code=503, detail="Ollama service is not available")
    except httpx.RequestError:
        raise HTTPException(status_code=503, detail="Cannot connect to Ollama service")
    
    response = StreamingResponse(
        stream_ollama_text(request.ollama_url, request.model, ollama_messages, protocol),
        media_type="text/event-stream",
    )
    return patch_response_with_headers(response, protocol)

@app.get("/api/ollama/models")
async def get_ollama_models(ollama_url: str = Query("http://localhost:11434")):
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{ollama_url}/api/tags", timeout=10.0)
            if response.status_code == 200:
                data = response.json()
                return {"models": [model["name"] for model in data.get("models", [])]}
            else:
                raise HTTPException(status_code=503, detail="Ollama service returned an error")
    except httpx.RequestError:
        raise HTTPException(status_code=503, detail="Cannot connect to Ollama service")

@app.get("/api/ollama/health")
async def check_ollama_health(ollama_url: str = Query("http://localhost:11434")):
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{ollama_url}/api/tags", timeout=5.0)
            return {"status": "connected" if response.status_code == 200 else "error"}
    except httpx.RequestError:
        return {"status": "disconnected"}
