"""
V4.32 Forward Curve Provider

Fetches forward curve data from V4 API (via ngrok).
Provides curve data with 8 horizons: 1H, 2H, 4H, 6H, 8H, 12H, 18H, 24H.
"""

import aiohttp
import asyncio
import ssl
from datetime import datetime, UTC
from typing import Any, Optional, Callable


class V4CurveProvider:
    """Provider for V4.32 forward curve data."""

    # V4 API via ngrok
    V4_BASE_URL = "https://uncentripetal-derek-euryphagous.ngrok-free.dev"
    
    # Horizons in order (V4 has 8 horizons up to 24H) - with + prefix as returned by API
    HORIZONS = ["+1H", "+2H", "+4H", "+6H", "+8H", "+12H", "+18H", "+24H"]

    def __init__(
        self,
        log_callback: Optional[Callable[[str, str], None]] = None,
        poll_interval: float = 300.0,  # 5 minutes
    ):
        self.log_callback = log_callback or (lambda level, msg: print(f"[{level}] {msg}"))
        self.poll_interval = poll_interval
        self._polling_task: Optional[asyncio.Task] = None
        self._broadcast_callback: Optional[Callable] = None
        self._last_curve: Optional[dict] = None

        # Store curve history to track prediction evolution over time
        # Key: anchor_timestamp, Value: list of curve snapshots
        self._curve_history: list[dict] = []
        self._max_history_size = 300  # ~25 hours at 5min intervals

    def log(self, level: str, message: str):
        self.log_callback(level, message)

    async def fetch_curve(self) -> Optional[dict]:
        """Fetch current forward curve from V4 API /prediction/tracking."""
        try:
            # Create SSL context that doesn't verify certificates (for ngrok)
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE

            connector = aiohttp.TCPConnector(ssl=ssl_context)
            async with aiohttp.ClientSession(connector=connector) as session:
                # Fetch tracking, yesterday, and history endpoints in parallel
                tracking_task = session.get(
                    f"{self.V4_BASE_URL}/prediction/tracking",
                    timeout=aiohttp.ClientTimeout(total=15),
                    headers={"ngrok-skip-browser-warning": "true"}
                )
                yesterday_task = session.get(
                    f"{self.V4_BASE_URL}/prediction/yesterday",
                    timeout=aiohttp.ClientTimeout(total=15),
                    headers={"ngrok-skip-browser-warning": "true"}
                )
                # Fetch history to get stabilized predictions (hourly snapshots)
                history_task = session.get(
                    f"{self.V4_BASE_URL}/history?limit=24",
                    timeout=aiohttp.ClientTimeout(total=15),
                    headers={"ngrok-skip-browser-warning": "true"}
                )

                tracking_resp, yesterday_resp, history_resp = await asyncio.gather(
                    tracking_task, yesterday_task, history_task, return_exceptions=True
                )

                # Process tracking response
                if isinstance(tracking_resp, Exception) or tracking_resp.status != 200:
                    self.log("ERROR", f"[V4] Tracking API error")
                    return None

                data = await tracking_resp.json()

                # Process yesterday response (optional - for accuracy comparison)
                yesterday_data = None
                if not isinstance(yesterday_resp, Exception) and yesterday_resp.status == 200:
                    yesterday_data = await yesterday_resp.json()

                # Process history response (for stabilized predictions)
                history_data = None
                if not isinstance(history_resp, Exception) and history_resp.status == 200:
                    history_data = await history_resp.json()

                return self._transform_response(data, yesterday_data, history_data)

        except asyncio.TimeoutError:
            self.log("WARNING", "[V4] API timeout")
            return None
        except Exception as e:
            self.log("ERROR", f"[V4] API error: {e}")
            return None

    def _transform_response(self, data: dict, yesterday_data: dict = None, history_data: list = None) -> dict:
        """Transform V4 API response to standard format."""
        forward_curve = data.get("forward_curve", {})
        original_predictions = data.get("original_predictions", {})

        # Get yesterday's predictions if available (for 24h ago comparison)
        yesterday_curve = {}
        if yesterday_data:
            yesterday_curve = yesterday_data.get("forward_curve", {})

        # Extract stabilized predictions from history
        # For each horizon, find the last prediction before it became actual
        stabilized_predictions = self._extract_stabilized_from_history(history_data, forward_curve)

        # Build curve array with all horizons
        curve_points = []
        for horizon in self.HORIZONS:
            if horizon in forward_curve:
                point = forward_curve[horizon]
                # Get original prediction for this horizon (what model predicted at anchor time)
                orig = original_predictions.get(horizon, {})
                # Get yesterday's prediction for this horizon
                yest = yesterday_curve.get(horizon, {})
                # Get stabilized prediction (last prediction before becoming actual)
                stab = stabilized_predictions.get(horizon, {})

                curve_points.append({
                    "horizon": horizon,  # Already has + prefix from API
                    "target_price": point.get("price", 0),
                    "pct_change": point.get("pct_change", 0),
                    "lower_90": point.get("lower_90", 0),
                    "upper_90": point.get("upper_90", 0),
                    "is_actual": point.get("is_actual", False),
                    # Original prediction (what model thought at 13:00 UTC)
                    "original_price": orig.get("original_price"),
                    "original_pct": orig.get("original_pct"),
                    # Yesterday's prediction (what we predicted 24h ago)
                    "yesterday_price": yest.get("price"),
                    # Stabilized prediction (last prediction before becoming actual)
                    "stabilized_price": stab.get("price"),
                    "stabilized_timestamp": stab.get("timestamp"),
                })

        return {
            "type": "v4_forward_curve",
            "timestamp": datetime.now(UTC).isoformat(),
            "generated_at": data.get("generated_at"),
            "anchor_timestamp": data.get("anchor_timestamp"),  # 13:00 UTC anchor
            "hours_elapsed": data.get("hours_elapsed", 0),
            "current_price": data.get("current_price", 0),
            "anchor_price": data.get("current_price", 0),  # Price at anchor time
            "direction": data.get("direction", "neutral"),
            "regime": data.get("regime", "neutral"),
            "curve_quality": data.get("curve_quality", 0),
            "curve": curve_points,
            "model": "V4.32",
            "has_yesterday": yesterday_data is not None,
            "has_history": history_data is not None and len(history_data) > 0,
        }

    def _extract_stabilized_from_history(self, history_data: list, current_curve: dict) -> dict:
        """
        Extract stabilized predictions from history.

        For each horizon that is now actual, find the last history entry
        where it was still a prediction (is_actual=False).
        That's the "stabilized" prediction - the last forecast before it became actual.
        """
        stabilized = {}

        if not history_data:
            return stabilized

        # Sort history by timestamp (oldest first)
        sorted_history = sorted(history_data, key=lambda x: x.get("timestamp", ""))

        for horizon in self.HORIZONS:
            current_point = current_curve.get(horizon, {})
            is_now_actual = current_point.get("is_actual", False)

            if is_now_actual:
                # Find the last history entry where this horizon was still a prediction
                last_prediction = None
                last_timestamp = None

                for entry in sorted_history:
                    fc = entry.get("forward_curve", {})
                    h_data = fc.get(horizon, {})

                    # If this entry has the horizon and it's NOT actual, it's a prediction
                    if h_data and not h_data.get("is_actual", False):
                        last_prediction = h_data.get("price")
                        last_timestamp = entry.get("timestamp")

                if last_prediction is not None:
                    stabilized[horizon] = {
                        "price": last_prediction,
                        "timestamp": last_timestamp
                    }
            else:
                # For pending horizons, the current price IS the stabilized prediction
                stabilized[horizon] = {
                    "price": current_point.get("price"),
                    "timestamp": None  # Current
                }

        return stabilized

    async def start_polling(self, broadcast_callback: Callable):
        """Start polling V4 API and broadcasting updates."""
        self._broadcast_callback = broadcast_callback
        self._polling_task = asyncio.create_task(self._poll_loop())
        self.log("INFO", f"[V4] V4.32 curve polling started (interval: {self.poll_interval}s)")

    async def stop_polling(self):
        """Stop polling."""
        if self._polling_task:
            self._polling_task.cancel()
            try:
                await self._polling_task
            except asyncio.CancelledError:
                pass
        self.log("INFO", "[V4] V4.32 curve polling stopped")

    async def _poll_loop(self):
        """Poll V4 API and broadcast curve updates, aligned to 5-minute marks."""
        import datetime as dt

        while True:
            try:
                # Fetch and broadcast immediately
                curve = await self.fetch_curve()
                if curve and self._broadcast_callback:
                    self._last_curve = curve
                    # Store snapshot for history tracking
                    self._store_curve_snapshot(curve)
                    # Add history to the curve data before broadcasting
                    curve_with_history = self._add_history_to_curve(curve)
                    await self._broadcast_callback(curve_with_history)

                # Calculate sleep time to align with next 5-minute mark
                now = dt.datetime.now()
                current_minute = now.minute
                current_second = now.second

                next_5min = ((current_minute // 5) + 1) * 5
                if next_5min >= 60:
                    next_5min = 0
                    minutes_to_wait = (60 - current_minute) + next_5min
                else:
                    minutes_to_wait = next_5min - current_minute

                seconds_to_wait = (minutes_to_wait * 60) - current_second + 5  # +5s offset from V5

                self.log("DEBUG", f"[V4] Next poll at :{next_5min:02d}, waiting {seconds_to_wait}s")
                await asyncio.sleep(seconds_to_wait)

            except asyncio.CancelledError:
                break
            except Exception as e:
                self.log("ERROR", f"[V4] Poll loop error: {e}")
                await asyncio.sleep(60)

    def _store_curve_snapshot(self, curve: dict):
        """Store a curve snapshot for history tracking."""
        snapshot = {
            "timestamp": datetime.now(UTC).isoformat(),
            "hours_elapsed": curve.get("hours_elapsed", 0),
            "anchor_timestamp": curve.get("anchor_timestamp"),
            "predictions": {}
        }

        # Store each horizon's prediction (only non-actuals, as those are still predictions)
        for point in curve.get("curve", []):
            horizon = point.get("horizon")
            if not point.get("is_actual", False):
                snapshot["predictions"][horizon] = {
                    "price": point.get("target_price"),
                    "original_price": point.get("original_price")
                }

        self._curve_history.append(snapshot)

        # Trim to max size
        if len(self._curve_history) > self._max_history_size:
            self._curve_history = self._curve_history[-self._max_history_size:]

    def _add_history_to_curve(self, curve: dict) -> dict:
        """Add prediction evolution history to each horizon in the curve."""
        curve_copy = curve.copy()
        curve_copy["curve"] = []

        for point in curve.get("curve", []):
            point_copy = point.copy()
            horizon = point.get("horizon")

            # Get the evolution history for this horizon
            evolution = []
            for snapshot in self._curve_history:
                pred = snapshot["predictions"].get(horizon)
                if pred:
                    evolution.append({
                        "timestamp": snapshot["timestamp"],
                        "hours_elapsed": snapshot["hours_elapsed"],
                        "price": pred["price"]
                    })

            # Add the last stabilized price (most recent prediction before it became actual)
            if point.get("is_actual") and evolution:
                point_copy["last_stabilized_price"] = evolution[-1]["price"]
            elif not point.get("is_actual") and evolution:
                # For pending, show current stabilized (which is target_price)
                point_copy["last_stabilized_price"] = point.get("target_price")

            point_copy["evolution_count"] = len(evolution)
            curve_copy["curve"].append(point_copy)

        curve_copy["history_size"] = len(self._curve_history)
        return curve_copy

    def get_last_curve(self) -> Optional[dict]:
        """Get the last fetched curve."""
        return self._last_curve

    def get_curve_history(self) -> list[dict]:
        """Get the stored curve history."""
        return self._curve_history

