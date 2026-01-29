"""
V5 Flash Forward Curve Provider

Fetches forward curve data from V5 Flash API (LSTM+TFT model).
Provides real-time curve data with 10 horizons from +1H to +48H.
"""

import aiohttp
import asyncio
from datetime import datetime, UTC
from typing import Any, Optional, Callable
import ssl

# SSL context for HTTPS requests
SSL_CONTEXT = ssl.create_default_context()
SSL_CONTEXT.check_hostname = False
SSL_CONTEXT.verify_mode = ssl.CERT_NONE


class V5CurveProvider:
    """Provider for V5 Flash forward curve data."""

    # V5 Flash API endpoints (Tailscale IP for remote access)
    V5_BASE_URL = "http://100.119.255.60:8005"
    
    # Horizons in order
    HORIZONS = ["+1H", "+2H", "+4H", "+6H", "+8H", "+12H", "+18H", "+24H", "+36H", "+48H"]

    def __init__(
        self,
        log_callback: Optional[Callable[[str, str], None]] = None,
        poll_interval: float = 5.0,
    ):
        self.log_callback = log_callback or (lambda level, msg: print(f"[{level}] {msg}"))
        self.poll_interval = poll_interval
        self._polling_task: Optional[asyncio.Task] = None
        self._broadcast_callback: Optional[Callable] = None
        self._last_curve: Optional[dict] = None

    def log(self, level: str, message: str):
        self.log_callback(level, message)

    async def fetch_curve(self) -> Optional[dict]:
        """Fetch current forward curve from V5 API."""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.V5_BASE_URL}/prediction",
                    timeout=aiohttp.ClientTimeout(total=10),
                    headers={"ngrok-skip-browser-warning": "true"}
                ) as resp:
                    if resp.status != 200:
                        self.log("ERROR", f"V5 API error: {resp.status}")
                        return None
                    
                    data = await resp.json()
                    return self._transform_response(data)
                    
        except asyncio.TimeoutError:
            self.log("WARNING", "V5 API timeout")
            return None
        except Exception as e:
            self.log("ERROR", f"V5 API error: {e}")
            return None

    def _transform_response(self, data: dict) -> dict:
        """Transform V5 API response to standard format."""
        forward_curve = data.get("forward_curve", {})
        
        # Build curve array with all horizons
        curve_points = []
        for horizon in self.HORIZONS:
            if horizon in forward_curve:
                point = forward_curve[horizon]
                curve_points.append({
                    "horizon": horizon,
                    "target_price": point.get("target_price", 0),
                    "pct_change": point.get("pct_change", 0),
                    "lower_90": point.get("lower_90", 0),
                    "upper_90": point.get("upper_90", 0),
                })
        
        return {
            "type": "forward_curve",
            "timestamp": datetime.now(UTC).isoformat(),  # Use fetch time, not API timestamp
            "model_timestamp": data.get("timestamp"),  # Keep original API timestamp for reference
            "current_price": data.get("current_price", 0),
            "direction": data.get("direction", "NEUTRAL"),
            "confidence_level": data.get("confidence_level", "LOW"),
            "confidence_score": data.get("confidence_score", 0),
            "curve": curve_points,
            "model": "V5 Flash (LSTM+TFT)",
        }

    async def fetch_summary(self) -> Optional[dict]:
        """Fetch quick summary from V5 API."""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.V5_BASE_URL}/prediction/summary",
                    timeout=aiohttp.ClientTimeout(total=10),
                    headers={"ngrok-skip-browser-warning": "true"}
                ) as resp:
                    if resp.status != 200:
                        return None
                    return await resp.json()
        except Exception as e:
            self.log("ERROR", f"V5 summary error: {e}")
            return None

    async def start_polling(self, broadcast_callback: Callable):
        """Start polling V5 API and broadcasting updates."""
        self._broadcast_callback = broadcast_callback
        self._polling_task = asyncio.create_task(self._poll_loop())
        self.log("INFO", f"V5 curve polling started (interval: {self.poll_interval}s)")

    async def stop_polling(self):
        """Stop polling."""
        if self._polling_task:
            self._polling_task.cancel()
            try:
                await self._polling_task
            except asyncio.CancelledError:
                pass
        self.log("INFO", "V5 curve polling stopped")

    async def _poll_loop(self):
        """Poll V5 API and broadcast curve updates, aligned to 5-minute marks."""
        import datetime

        while True:
            try:
                # Fetch and broadcast immediately
                curve = await self.fetch_curve()
                if curve and self._broadcast_callback:
                    self._last_curve = curve
                    await self._broadcast_callback(curve)

                # Calculate sleep time to align with next 5-minute mark
                now = datetime.datetime.now()
                current_minute = now.minute
                current_second = now.second

                # Find next 5-minute mark (0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55)
                next_5min = ((current_minute // 5) + 1) * 5
                if next_5min >= 60:
                    next_5min = 0
                    minutes_to_wait = (60 - current_minute) + next_5min
                else:
                    minutes_to_wait = next_5min - current_minute

                # Calculate seconds to wait (subtract current seconds, add small buffer)
                seconds_to_wait = (minutes_to_wait * 60) - current_second + 2  # +2s buffer

                self.log("DEBUG", f"Next poll at :{next_5min:02d}, waiting {seconds_to_wait}s")
                await asyncio.sleep(seconds_to_wait)

            except asyncio.CancelledError:
                break
            except Exception as e:
                self.log("ERROR", f"Poll loop error: {e}")
                await asyncio.sleep(60)  # Wait 1 minute on error

    def get_last_curve(self) -> Optional[dict]:
        """Get the last fetched curve."""
        return self._last_curve

