#!/usr/bin/env python3
# © 2025 Cayman Sunsets Holidays Ltd. All rights reserved.
#
# This software and its source code are proprietary and confidential.
# Unauthorized copying, distribution, or modification of this file, in
# whole or in part, without the express written permission of
# Cayman Sunsets Holidays Ltd is strictly prohibited.
"""
Forward Curve Hub Server

A clean, standalone server that:
1. Proxies Binance tick data (WebSocket)
2. Proxies Binance historical data (HTTP)
3. Fetches V5 Forward Curve predictions
4. Broadcasts all data to UI via WebSocket

No complex infrastructure required - just HTTP/WebSocket.
"""

from __future__ import annotations

import asyncio
import json
import os
import socket
from datetime import UTC, datetime
from typing import Any, LiteralString

import ssl

import aiohttp
import websockets
from aiohttp import web
from dotenv import load_dotenv

# Create SSL context that doesn't verify certificates (for Mac Python SSL issues)
SSL_CONTEXT = ssl.create_default_context()
SSL_CONTEXT.check_hostname = False
SSL_CONTEXT.verify_mode = ssl.CERT_NONE

# Import Forward Curve Providers
from v5_curve_provider import V5CurveProvider
from v4_curve_provider import V4CurveProvider

# Load environment variables
load_dotenv()


class ForwardCurveServer:
    """
    Forward Curve Hub Server.

    Provides real-time forward curve data from V5 Flash API.
    Simple, standalone server with minimal dependencies.
    """

    def __init__(
        self,
        port: int = 8765,
        log_level: str = "INFO",
        test_mode: bool = False,
    ):
        self.port = port
        self.log_level = log_level
        self.test_mode = test_mode
        self.app = web.Application()

        # WebSocket clients (UI connections)
        self.ws_clients: set[web.WebSocketResponse] = set()

        # In-memory state
        self.latest_tick: dict[str, Any] | None = None

        # Binance WebSocket
        self.binance_ws_task: asyncio.Task | None = None

        # V5 Forward Curve Provider
        self.curve_provider: V5CurveProvider | None = None
        self.curve_poll_task: asyncio.Task | None = None

        # V4 Forward Curve Provider
        self.v4_curve_provider: V4CurveProvider | None = None

        self.heartbeat_task: asyncio.Task | None = None
        self.runtime_id: str = ""  # Will be set in start()

    # ============================================
    # LOGGING
    # ============================================

    def log(self, level: str, message: str | LiteralString, **kwargs: Any) -> None:
        """Simple logging."""
        timestamp = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S")
        extra = f" {kwargs}" if kwargs else ""
        print(f"[{timestamp}] [{level}] {message}{extra}")

    # ============================================
    # 1. BINANCE TICK PROXY
    # ============================================

    async def start_binance_tick_stream(self):
        """Connect to Binance WebSocket and relay ticks to UI."""
        uri = "wss://stream.binance.com:9443/ws/btcusdt@trade"

        while True:
            try:
                self.log("INFO", f"Connecting to Binance WebSocket: {uri}")

                async with websockets.connect(uri, ping_interval=30, ssl=SSL_CONTEXT) as ws:
                    self.log("INFO", "Connected to Binance WebSocket")

                    async for message in ws:
                        try:
                            tick_data = json.loads(message)
                            self.latest_tick = tick_data

                            # Broadcast to UI
                            await self.broadcast({"type": "trade", "data": tick_data})

                        except json.JSONDecodeError as e:
                            self.log("ERROR", f"Failed to parse Binance message: {e}")

            except Exception as e:
                self.log("ERROR", f"Binance WebSocket error: {e}")
                self.log("INFO", "Reconnecting in 5 seconds...")
                await asyncio.sleep(5)

    # ============================================
    # 2. BINANCE HISTORY PROXY
    # ============================================

    async def handle_binance_klines(self, request: web.Request) -> web.Response:
        """Proxy Binance klines API."""
        try:
            params = dict(request.query)

            connector = aiohttp.TCPConnector(ssl=SSL_CONTEXT)
            async with aiohttp.ClientSession(connector=connector) as session:
                async with session.get(
                    "https://api.binance.com/api/v3/klines",
                    params=params,
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return web.json_response(data)
                    else:
                        error_text = await resp.text()
                        self.log("ERROR", f"Binance API error: {resp.status} - {error_text}")
                        return web.json_response(
                            {"error": f"Binance API error: {resp.status}"}, status=resp.status
                        )

        except Exception as e:
            self.log("ERROR", f"Error proxying Binance klines: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_binance_aggtrades(self, request: web.Request) -> web.Response:
        """Proxy Binance aggTrades API."""
        try:
            params = dict(request.query)

            connector = aiohttp.TCPConnector(ssl=SSL_CONTEXT)
            async with aiohttp.ClientSession(connector=connector) as session:
                async with session.get(
                    "https://api.binance.com/api/v3/aggTrades",
                    params=params,
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return web.json_response(data)
                    else:
                        return web.json_response(
                            {"error": f"Binance API error: {resp.status}"}, status=resp.status
                        )

        except Exception as e:
            self.log("ERROR", f"Error proxying Binance aggTrades: {e}")
            return web.json_response({"error": str(e)}, status=500)

    # ============================================
    # 3. V5 FORWARD CURVE PROVIDER
    # ============================================

    async def broadcast_curve(self, curve_data: dict):
        """Broadcast forward curve data to all connected clients."""
        num_clients = len(self.ws_clients)
        await self.broadcast(curve_data)

        # Only log when something changes
        price = curve_data.get("current_price", 0)
        direction = curve_data.get("direction", "?")
        confidence = curve_data.get("confidence_level", "?")

        # Always log broadcast count for debugging
        if num_clients > 0:
            self.log("DEBUG", f"Broadcast curve to {num_clients} client(s)")

        current_state = f"{price:.2f}|{direction}|{confidence}"
        if not hasattr(self, '_last_curve_state') or self._last_curve_state != current_state:
            self._last_curve_state = current_state
            self.log("INFO", f"Forward curve updated: ${price:,.2f} {direction} ({confidence})")

    # ============================================
    # 3b. V4 FORWARD CURVE PROVIDER
    # ============================================

    async def broadcast_v4_curve(self, curve_data: dict):
        """Broadcast V4 forward curve data to all connected clients."""
        num_clients = len(self.ws_clients)
        await self.broadcast(curve_data)

        price = curve_data.get("current_price", 0)
        regime = curve_data.get("regime", "?")
        quality = curve_data.get("curve_quality", 0)

        if num_clients > 0:
            self.log("DEBUG", f"[V4] Broadcast curve to {num_clients} client(s)")

        current_state = f"{price:.2f}|{regime}|{quality:.2f}"
        if not hasattr(self, '_last_v4_curve_state') or self._last_v4_curve_state != current_state:
            self._last_v4_curve_state = current_state
            self.log("INFO", f"[V4] Forward curve updated: ${price:,.2f} {regime} (quality: {quality:.2f})")

    async def handle_curve_current(self, request: web.Request) -> web.Response:
        """Get current forward curve from V5 API."""
        _ = request  # unused
        if self.curve_provider:
            curve = await self.curve_provider.fetch_curve()
            if curve:
                return web.json_response(curve)
        return web.json_response({"error": "Curve not available"}, status=503)

    async def handle_curve_history(self, request: web.Request) -> web.Response:
        """Get historical curves from V5 API."""
        limit = int(request.query.get("limit", "10"))
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{V5CurveProvider.V5_BASE_URL}/history?limit={limit}",
                    timeout=aiohttp.ClientTimeout(total=10),
                    headers={"ngrok-skip-browser-warning": "true"}
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return web.json_response(data)
                    return web.json_response({"error": f"V5 API error: {resp.status}"}, status=resp.status)
        except Exception as e:
            self.log("ERROR", f"Error fetching curve history: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_curve_summary(self, request: web.Request) -> web.Response:
        """Get quick summary from V5 API."""
        _ = request  # unused
        if self.curve_provider:
            summary = await self.curve_provider.fetch_summary()
            if summary:
                return web.json_response(summary)
        return web.json_response({"error": "Summary not available"}, status=503)

    # ============================================
    # 4. WEBSOCKET BROADCAST
    # ============================================

    async def broadcast(self, message: dict[str, Any]):
        """Broadcast message to all connected UI clients."""
        if not self.ws_clients:
            return

        try:
            message_str = json.dumps(message)

            # Send to all clients
            disconnected = set()
            for ws in self.ws_clients:
                try:
                    await ws.send_str(message_str)
                except Exception:
                    disconnected.add(ws)

            # Clean up disconnected clients
            self.ws_clients -= disconnected

        except Exception as e:
            self.log("ERROR", f"Error broadcasting: {e}")

    async def _heartbeat_loop(self) -> None:
        """Broadcast heartbeats every 5 seconds."""
        while True:
            try:
                heartbeat_message = {
                    "type": "heartbeat",
                    "data": {
                        "instance_name": "ForwardCurveHub",
                        "instance_id": self.runtime_id,
                        "heartbeat_at": datetime.now(UTC).isoformat(),
                    },
                }
                await self.broadcast(heartbeat_message)
                await asyncio.sleep(5)  # Heartbeat every 5 seconds

            except Exception as e:
                self.log("ERROR", f"Error in heartbeat loop: {e}")
                await asyncio.sleep(5)

    async def handle_websocket(self, request: web.Request) -> web.WebSocketResponse:
        """Handle WebSocket connections from UI."""
        ws = web.WebSocketResponse()
        await ws.prepare(request)

        self.ws_clients.add(ws)
        client_ip = request.remote or "unknown"
        self.log("INFO", f"WebSocket connected: {client_ip} (total: {len(self.ws_clients)})")

        # Send current V5 curve data immediately to new client
        if self.curve_provider:
            last_curve = self.curve_provider.get_last_curve()
            if last_curve:
                try:
                    await ws.send_str(json.dumps(last_curve))
                    self.log("INFO", f"Sent initial V5 curve to {client_ip}")
                except Exception as e:
                    self.log("ERROR", f"Failed to send initial V5 curve: {e}")

        # Send current V4 curve data immediately to new client
        if self.v4_curve_provider:
            last_v4_curve = self.v4_curve_provider.get_last_curve()
            if last_v4_curve:
                try:
                    await ws.send_str(json.dumps(last_v4_curve))
                    self.log("INFO", f"Sent initial V4 curve to {client_ip}")
                except Exception as e:
                    self.log("ERROR", f"Failed to send initial V4 curve: {e}")

        try:
            async for msg in ws:
                if msg.type == web.WSMsgType.TEXT:
                    # UI can send messages (for future features)
                    pass
                elif msg.type == web.WSMsgType.ERROR:
                    self.log("ERROR", f"WebSocket error: {ws.exception()}")
        finally:
            self.ws_clients.discard(ws)
            self.log("INFO", f"WebSocket disconnected: {client_ip} (remaining: {len(self.ws_clients)})")

        return ws

    # ============================================
    # 5. HTTP API
    # ============================================

    async def handle_mode(self, request: web.Request) -> web.Response:
        """Return server mode information."""
        return web.json_response(
            {
                "mode": "live",
                "simulation": False,
                "features": {"ws_channels": ["ticks:compressed:binance:btcusdt"]},
                "version": "IPC_UI_Server",
                "timestamp": datetime.now(UTC).isoformat(),
            }
        )

    async def handle_strategy_instances(self, request: web.Request) -> web.Response:
        """Return strategy instance for UI compatibility (stub for Forward Curve Hub)."""
        _ = request  # unused
        return web.json_response(["ForwardCurve"])

    async def handle_strategy_events(self, request: web.Request) -> web.Response:
        """Handle historic strategy events request (stub - returns empty list)."""
        _ = request  # unused
        return web.json_response([])

    async def handle_index(self, request: web.Request) -> web.FileResponse:
        """Serve main UI page."""
        import pathlib
        ui_dir = pathlib.Path(__file__).parent.parent / "ui"
        return web.FileResponse(ui_dir / "chart.html")

    async def handle_telemetry_stub(self, request: web.Request) -> web.Response:
        """Stub handler for telemetry endpoints (traces, logs). Just accepts and ignores."""
        return web.Response(status=200)

    # ============================================
    # 6. SETUP & RUN
    # ============================================

    def setup_routes(self):
        """Setup HTTP routes."""
        # API endpoints
        self.app.router.add_get("/api/mode", self.handle_mode)
        self.app.router.add_get("/api/strategy_instances", self.handle_strategy_instances)
        self.app.router.add_get("/api/strategy-events", self.handle_strategy_events)
        self.app.router.add_get("/api/binance-klines", self.handle_binance_klines)
        self.app.router.add_get("/api/binance-aggTrades", self.handle_binance_aggtrades)

        # Forward Curve API endpoints
        self.app.router.add_get("/api/curve/current", self.handle_curve_current)
        self.app.router.add_get("/api/curve/history", self.handle_curve_history)
        self.app.router.add_get("/api/curve/summary", self.handle_curve_summary)

        # WebSocket
        self.app.router.add_get("/ws", self.handle_websocket)

        # Stub routes for telemetry (silences 404 errors in browser console)
        self.app.router.add_post("/v1/traces", self.handle_telemetry_stub)
        self.app.router.add_post("/v1/logs", self.handle_telemetry_stub)
        self.app.router.add_post("/api/logs", self.handle_telemetry_stub)

        # Static files (UI)
        import pathlib
        ui_dir = pathlib.Path(__file__).parent.parent / "ui"
        self.app.router.add_static("/js/", str(ui_dir / "js"))
        self.app.router.add_get("/", self.handle_index)
        self.app.router.add_get("/chart.html", self.handle_index)

    async def start(self):
        """Start the server and all background tasks."""
        self.log("INFO", "=" * 60)
        self.log("INFO", "Forward Curve Hub Server Starting")
        self.log("INFO", "=" * 60)

        # Generate runtime ID
        hostname = socket.gethostname()
        pid = os.getpid()
        self.runtime_id = f"{hostname}-{pid}-{int(datetime.now(UTC).timestamp())}"
        self.log("INFO", f"Runtime ID: {self.runtime_id}")

        # Initialize V5 Forward Curve Provider
        self.log("INFO", "Initializing V5 Forward Curve Provider...")
        try:
            self.curve_provider = V5CurveProvider(
                log_callback=lambda level, msg: self.log(level, f"[V5] {msg}"),
                poll_interval=300.0,  # Poll every 5 minutes (model updates every 5 mins)
            )
            self.log("INFO", "✓ V5 Forward Curve Provider initialized")
        except Exception as e:
            self.log("ERROR", f"Failed to initialize curve provider: {e}")
            self.curve_provider = None

        # Initialize V4 Forward Curve Provider
        self.log("INFO", "Initializing V4.32 Forward Curve Provider...")
        try:
            self.v4_curve_provider = V4CurveProvider(
                log_callback=lambda level, msg: self.log(level, msg),
                poll_interval=300.0,  # Poll every 5 minutes
            )
            self.log("INFO", "✓ V4.32 Forward Curve Provider initialized")
        except Exception as e:
            self.log("ERROR", f"Failed to initialize V4 curve provider: {e}")
            self.v4_curve_provider = None

        # Setup routes
        self.setup_routes()

        # Start background tasks
        self.log("INFO", "Starting Binance tick stream...")
        self.binance_ws_task = asyncio.create_task(self.start_binance_tick_stream())

        # Start V5 curve polling
        if self.curve_provider:
            self.log("INFO", "Starting V5 forward curve polling...")
            await self.curve_provider.start_polling(self.broadcast_curve)

        # Start V4 curve polling
        if self.v4_curve_provider:
            self.log("INFO", "Starting V4.32 forward curve polling...")
            await self.v4_curve_provider.start_polling(self.broadcast_v4_curve)

        # Start heartbeat
        self.log("INFO", "Starting heartbeat (every 5s)...")
        self.heartbeat_task = asyncio.create_task(self._heartbeat_loop())

        # Start HTTP server
        runner = web.AppRunner(self.app)
        await runner.setup()
        site = web.TCPSite(runner, "0.0.0.0", self.port)
        await site.start()

        self.log("INFO", "=" * 60)
        self.log("INFO", f"✅ Forward Curve Hub running on http://0.0.0.0:{self.port}")
        self.log("INFO", "=" * 60)
        self.log("INFO", f"UI: http://localhost:{self.port}")
        self.log("INFO", f"WebSocket: ws://localhost:{self.port}/ws")
        self.log("INFO", f"V5 API: {V5CurveProvider.V5_BASE_URL}")
        self.log("INFO", f"V4 API: {V4CurveProvider.V4_BASE_URL}")
        self.log("INFO", "=" * 60)

        # Keep running
        try:
            await asyncio.Event().wait()
        except KeyboardInterrupt:
            self.log("INFO", "Shutting down...")

    async def stop(self):
        """Stop the server."""
        if self.binance_ws_task:
            self.binance_ws_task.cancel()
        if self.curve_provider:
            await self.curve_provider.stop_polling()
        if self.v4_curve_provider:
            await self.v4_curve_provider.stop_polling()
        if self.heartbeat_task:
            self.heartbeat_task.cancel()
            try:
                await self.heartbeat_task
            except asyncio.CancelledError:
                pass


# ============================================
# MAIN
# ============================================


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Forward Curve Hub - V5 Forward Curve Visualization Server")
    parser.add_argument("--port", type=int, default=8765, help="Port to run server on (default: 8765)")
    parser.add_argument("--log-level", default="INFO", help="Log level (default: INFO)")
    parser.add_argument(
        "--test",
        action="store_true",
        help="Run in test mode",
    )

    args = parser.parse_args()

    server = ForwardCurveServer(
        port=args.port,
        log_level=args.log_level,
        test_mode=args.test,
    )

    try:
        asyncio.run(server.start())
    except KeyboardInterrupt:
        print("\nShutting down...")


if __name__ == "__main__":
    main()
