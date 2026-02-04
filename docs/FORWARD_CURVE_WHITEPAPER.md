# Eagle AI Labs Forward Curve System
## Technical Whitepaper v1.0

**Document Version:** 1.0
**Date:** February 2026
**Classification:** Internal Technical Documentation
**Author:** Eagle AI Labs Engineering Team

---

## Executive Summary

The Eagle AI Labs Forward Curve System is a proprietary cryptocurrency price prediction and visualization platform that generates real-time forward curves for Bitcoin (BTC). Similar to forward curves in traditional commodities and fixed-income markets, our system projects expected prices across multiple time horizons, providing traders and analysts with actionable intelligence on anticipated price movements.

This whitepaper provides a comprehensive technical overview of the system architecture, prediction models, data flows, and operational mechanics.

---

## Table of Contents

1. [Introduction to Forward Curves](#1-introduction-to-forward-curves)
2. [System Architecture](#2-system-architecture)
3. [Prediction Models](#3-prediction-models)
4. [The Liquidity Fixing Anchor](#4-the-liquidity-fixing-anchor)
5. [Data Pipeline](#5-data-pipeline)
6. [Horizon Predictions](#6-horizon-predictions)
7. [Accuracy Tracking & Validation](#7-accuracy-tracking--validation)
8. [Visualization Layer](#8-visualization-layer)
9. [API Reference](#9-api-reference)
10. [Operational Considerations](#10-operational-considerations)

---

## 1. Introduction to Forward Curves

### 1.1 What is a Forward Curve?

A forward curve is a graphical representation of expected future prices for an asset at various points in time. In traditional finance, forward curves are commonly used in:

- **Commodities markets** (oil, natural gas, agricultural products)
- **Fixed income** (yield curves for bonds)
- **Foreign exchange** (forward rate agreements)

The Eagle AI Forward Curve applies this concept to cryptocurrency markets, specifically Bitcoin, using machine learning models to generate price predictions across multiple time horizons.

### 1.2 Why Forward Curves for Crypto?

Cryptocurrency markets operate 24/7 with high volatility and complex market microstructure. Traditional technical analysis often fails to capture:

- Cross-exchange arbitrage dynamics
- Derivatives market influence (futures, options, perpetuals)
- On-chain metrics and whale movements
- Macro liquidity cycles

Our forward curve system synthesizes these diverse data sources into a unified predictive framework.

### 1.3 Key Terminology

| Term | Definition |
|------|------------|
| **Horizon** | A specific future time point (e.g., +1H, +2H, +4H) |
| **Anchor** | The reference timestamp from which predictions are made |
| **Liquidity Fixing** | Daily anchor point at 13:00 UTC |
| **Curve Point** | A single price prediction at a specific horizon |
| **Confidence Band** | Upper/lower bounds representing prediction uncertainty |
| **Stabilized Prediction** | Final prediction before a horizon becomes actual |

---

## 2. System Architecture

### 2.1 High-Level Overview

The Forward Curve System consists of three primary layers:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PREDICTION LAYER                                 │
│  ┌─────────────────────────┐    ┌─────────────────────────┐        │
│  │   V4.32 Model Server    │    │   V5 Flash Model Server │        │
│  │   (LSTM Neural Net)     │    │   (LSTM + TFT Hybrid)   │        │
│  │   8 Horizons: 1H-24H    │    │   10 Horizons: 1H-48H   │        │
│  └───────────┬─────────────┘    └───────────┬─────────────┘        │
│              │                              │                       │
└──────────────┼──────────────────────────────┼───────────────────────┘
               │         HTTP/JSON            │
               ▼                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     DISTRIBUTION LAYER                               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Forward Curve Hub Server                        │   │
│  │  • V4 Curve Provider (polls every 5 min)                    │   │
│  │  • V5 Curve Provider (polls every 5 min)                    │   │
│  │  • Binance WebSocket Proxy (real-time ticks)                │   │
│  │  • WebSocket Broadcast (to all connected clients)           │   │
│  └─────────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │  WebSocket + HTTP
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     VISUALIZATION LAYER                              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Web UI (TradingView Charts)                     │   │
│  │  • Forward curve line plots                                  │   │
│  │  • Historical candlestick data                               │   │
│  │  • Confidence bands (90% intervals)                          │   │
│  │  • Spread matrix                                             │   │
│  │  • Accuracy tracking tables                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Component Responsibilities

#### Prediction Layer
- Runs machine learning inference
- Generates raw price predictions
- Calculates confidence intervals
- Exposes predictions via HTTP API

#### Distribution Layer
- Aggregates predictions from multiple models
- Proxies real-time market data from Binance
- Manages WebSocket connections to clients
- Handles historical data requests

#### Visualization Layer
- Renders interactive charts
- Displays real-time updates
- Provides user controls for curve visibility
- Shows accuracy metrics and spread analysis

---

## 3. Prediction Models

### 3.1 V4.32 Model (EAI Forward Reference Curve)

The V4.32 model is the primary production model, designated as the **EAI Forward Reference Curve**.

#### Architecture
- **Type:** Long Short-Term Memory (LSTM) Neural Network
- **Framework:** TensorFlow/Keras
- **Input Window:** 60 time steps (configurable)
- **Output:** Multi-horizon price predictions

#### Model Structure
```
Input Layer (60 timesteps × N features)
    │
    ▼
LSTM Layer (60 units, return_sequences=True, L2 regularization)
    │
    ▼
Dropout (0.2)
    │
    ▼
LSTM Layer (60 units, L2 regularization)
    │
    ▼
Dropout (0.2)
    │
    ▼
Dense Layer (60 units, ReLU activation)
    │
    ▼
Output Layer (8 price predictions)
```

#### Input Features
The V4.32 model ingests the following feature categories:

**Price-Based Features:**
- OHLCV data (Open, High, Low, Close, Volume)
- Returns at multiple timeframes
- Volatility measures (ATR, Bollinger Band width)

**Technical Indicators:**
- RSI (Relative Strength Index)
- MACD (Moving Average Convergence Divergence)
- Stochastic Oscillator
- ADX (Average Directional Index)
- Multiple EMAs (9, 21, 50 period)

**External Data:**
- Long/Short ratio trends
- Funding rates
- Open interest changes

#### Prediction Horizons
| Horizon | Time Offset | Description |
|---------|-------------|-------------|
| +1H | 1 hour | Short-term momentum |
| +2H | 2 hours | Intraday trend |
| +4H | 4 hours | Session trend |
| +6H | 6 hours | Half-day outlook |
| +8H | 8 hours | Extended session |
| +12H | 12 hours | Overnight/next session |
| +18H | 18 hours | Next day early |
| +24H | 24 hours | Full day forecast |

---

### 3.2 V5 Flash Model (LSTM + TFT Hybrid)

The V5 Flash model represents the next generation of prediction technology, combining two specialized architectures.

#### Dual-Architecture Design

```
                    ┌─────────────────────────────────────┐
                    │         V5 Flash Pipeline           │
                    └─────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
        ┌───────────────────┐           ┌───────────────────┐
        │   LSTM Model      │           │   TFT Model       │
        │   (Short-Term)    │           │   (Long-Term)     │
        │   0.5H - 6H       │           │   7H - 48H        │
        └─────────┬─────────┘           └─────────┬─────────┘
                  │                               │
                  └───────────┬───────────────────┘
                              ▼
                    ┌───────────────────┐
                    │     Blender       │
                    │   (5H-7H zone)    │
                    └─────────┬─────────┘
                              ▼
                    ┌───────────────────┐
                    │   Stabilizer      │
                    │   (Smoothing)     │
                    └───────────────────┘
```

#### LSTM Component (Short Horizons)
- Optimized for capturing short-term price dynamics
- Higher sensitivity to recent price action
- Faster adaptation to regime changes

#### TFT Component (Long Horizons)
- Temporal Fusion Transformer architecture
- Better at capturing long-range dependencies
- Incorporates attention mechanisms for feature importance

#### Blending Zone (5H-7H)
The transition between LSTM and TFT predictions is smoothed using weighted averaging:

```
For horizon h in [5H, 6H, 7H]:
    weight_lstm = (7 - h) / 2
    weight_tft = (h - 5) / 2
    prediction = weight_lstm × lstm_pred + weight_tft × tft_pred
```

#### Feature Engineering (69 Features)

The V5 model uses an extensive feature set from multiple data sources:

**Data Sources:**
| Source | Data Type | Features |
|--------|-----------|----------|
| CCData | Price data | OHLCV, returns, volatility |
| CryptoQuant | On-chain | Exchange flows, whale alerts |
| Coinglass | Derivatives | Funding, OI, liquidations |
| Deribit | Options | IV, put/call ratio, skew |
| Binance | Market data | Order book, trades |

#### Extended Horizons
| Horizon | Time Offset |
|---------|-------------|
| +1H | 1 hour |
| +2H | 2 hours |
| +4H | 4 hours |
| +6H | 6 hours |
| +8H | 8 hours |
| +12H | 12 hours |
| +18H | 18 hours |
| +24H | 24 hours |
| +36H | 36 hours |
| +48H | 48 hours |

---

## 4. The Liquidity Fixing Anchor

### 4.1 Concept

The **Liquidity Fixing** (formerly "Anchor") is a critical concept in the V4.32 model. It establishes a fixed reference point each day at **13:00 UTC** from which all predictions are measured.

### 4.2 Why 13:00 UTC?

This timestamp was chosen based on market microstructure analysis:

| Timezone | Local Time | Significance |
|----------|------------|--------------|
| UTC | 13:00 | Reference standard |
| New York (EST) | 08:00 | US market pre-open |
| London (GMT) | 13:00 | European afternoon session |
| Hong Kong (HKT) | 21:00 | Asian evening session |

**Key Observations:**
- 13:00 UTC coincides with significant liquidity injection as US institutional traders begin their day
- Crypto markets show increased volume and directional moves following this time
- Provides a consistent daily reset point for prediction tracking

### 4.3 Anchor Mechanics

```
Day N, 13:00 UTC (Anchor Time)
│
├── Model generates predictions for:
│   • +1H  → 14:00 UTC
│   • +2H  → 15:00 UTC
│   • +4H  → 17:00 UTC
│   • +6H  → 19:00 UTC
│   • +8H  → 21:00 UTC
│   • +12H → 01:00 UTC (Day N+1)
│   • +18H → 07:00 UTC (Day N+1)
│   • +24H → 13:00 UTC (Day N+1)
│
├── As time passes:
│   • +1H becomes "actual" at 14:00 UTC
│   • +2H becomes "actual" at 15:00 UTC
│   • ... and so on
│
└── At Day N+1, 13:00 UTC:
    • New anchor established
    • Cycle repeats
```

### 4.4 Prediction States

Each horizon prediction transitions through states:

| State | Description |
|-------|-------------|
| **Pending** | Future horizon, prediction is active forecast |
| **Tracking** | Prediction being refined as time approaches |
| **Stabilized** | Final prediction before becoming actual |
| **Actual** | Horizon time has passed, actual price known |

### 4.5 Original vs. Tracking Predictions

The system maintains two prediction values for each horizon:

- **Original Prediction:** The price predicted at anchor time (13:00 UTC). Never changes.
- **Tracking Prediction:** Continuously updated prediction as new data arrives.

This allows analysis of:
1. How accurate the original prediction was
2. How much the model refined its prediction over time
3. Whether tracking improves or degrades accuracy

---

## 5. Data Pipeline

### 5.1 Real-Time Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DATA SOURCES                                  │
├─────────────────────────────────────────────────────────────────────┤
│  Binance WebSocket ──────────────────────────────────────────────┐  │
│  (wss://stream.binance.com:9443/ws/btcusdt@trade)                │  │
│                                                                   │  │
│  V4 API ─────────────────────────────────────────────────────┐   │  │
│  (https://...ngrok-free.dev/prediction/tracking)             │   │  │
│                                                               │   │  │
│  V5 API ─────────────────────────────────────────────────┐   │   │  │
│  (http://100.119.255.60:8005/prediction)                 │   │   │  │
└──────────────────────────────────────────────────────────┼───┼───┼──┘
                                                           │   │   │
                                                           ▼   ▼   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FORWARD CURVE HUB SERVER                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ Binance WS Proxy │  │ V4 Curve Provider│  │ V5 Curve Provider│  │
│  │ (continuous)     │  │ (5-min polling)  │  │ (5-min polling)  │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  │
│           │                     │                     │             │
│           └─────────────────────┼─────────────────────┘             │
│                                 ▼                                    │
│                    ┌────────────────────────┐                       │
│                    │   WebSocket Broadcast  │                       │
│                    │   (to all UI clients)  │                       │
│                    └────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Polling Schedule

Both curve providers align their polling to 5-minute marks:

```
:00 ─── V5 polls (+2s buffer)
:00 ─── V4 polls (+5s offset from V5)
:05 ─── V5 polls
:05 ─── V4 polls
:10 ─── V5 polls
:10 ─── V4 polls
... (continues every 5 minutes)
```

The offset prevents simultaneous API calls and ensures staggered updates.

### 5.3 Message Types

The WebSocket broadcasts the following message types:

#### Trade Message (Real-time)
```json
{
  "type": "trade",
  "data": {
    "e": "trade",
    "E": 1706889600000,
    "s": "BTCUSDT",
    "p": "98500.00",
    "q": "0.001",
    "T": 1706889600000
  }
}
```

#### V4 Forward Curve Message
```json
{
  "type": "v4_forward_curve",
  "timestamp": "2026-02-04T13:05:00Z",
  "generated_at": "2026-02-04T13:00:00Z",
  "anchor_timestamp": "2026-02-04T13:00:00Z",
  "hours_elapsed": 0.083,
  "current_price": 98500.00,
  "direction": "bullish",
  "regime": "trending",
  "curve_quality": 0.85,
  "curve": [
    {
      "horizon": "+1H",
      "target_price": 98650.00,
      "pct_change": 0.15,
      "lower_90": 98400.00,
      "upper_90": 98900.00,
      "is_actual": false,
      "original_price": 98600.00,
      "stabilized_price": null
    }
  ],
  "model": "V4.32"
}
```

#### V5 Forward Curve Message
```json
{
  "type": "forward_curve",
  "timestamp": "2026-02-04T13:05:02Z",
  "model_timestamp": "2026-02-04T13:05:00Z",
  "current_price": 98500.00,
  "direction": "UP",
  "confidence_level": "HIGH",
  "confidence_score": 0.78,
  "curve": [
    {
      "horizon": "+1H",
      "target_price": 98680.00,
      "pct_change": 0.18,
      "lower_90": 98350.00,
      "upper_90": 99010.00
    }
  ],
  "model": "V5 Flash (LSTM+TFT)"
}
```

#### Heartbeat Message
```json
{
  "type": "heartbeat",
  "data": {
    "instance_name": "ForwardCurveHub",
    "instance_id": "hostname-pid-timestamp",
    "heartbeat_at": "2026-02-04T13:05:05Z"
  }
}
```


---

## 6. Horizon Predictions

### 6.1 Understanding Horizons

Each horizon represents a specific future time point relative to the current moment (for V5) or the anchor time (for V4.32).

#### V4.32 Horizons (Anchor-Relative)
```
Anchor (13:00 UTC)
│
├── +1H  ────► 14:00 UTC (1 hour after anchor)
├── +2H  ────► 15:00 UTC (2 hours after anchor)
├── +4H  ────► 17:00 UTC (4 hours after anchor)
├── +6H  ────► 19:00 UTC (6 hours after anchor)
├── +8H  ────► 21:00 UTC (8 hours after anchor)
├── +12H ────► 01:00 UTC next day
├── +18H ────► 07:00 UTC next day
└── +24H ────► 13:00 UTC next day (next anchor)
```

#### V5 Horizons (Rolling)
V5 predictions are rolling - they always represent time from "now":
```
Current Time (T)
│
├── +1H  ────► T + 1 hour
├── +2H  ────► T + 2 hours
├── +4H  ────► T + 4 hours
├── +6H  ────► T + 6 hours
├── +8H  ────► T + 8 hours
├── +12H ────► T + 12 hours
├── +18H ────► T + 18 hours
├── +24H ────► T + 24 hours
├── +36H ────► T + 36 hours
└── +48H ────► T + 48 hours
```

### 6.2 Prediction Components

Each horizon prediction includes:

| Field | Description |
|-------|-------------|
| `target_price` | The predicted price at this horizon |
| `pct_change` | Percentage change from current price |
| `lower_90` | Lower bound of 90% confidence interval |
| `upper_90` | Upper bound of 90% confidence interval |
| `is_actual` | Whether this horizon has passed (V4 only) |

### 6.3 Confidence Intervals

The 90% confidence interval represents the range within which the model expects the actual price to fall with 90% probability.

**Interpretation:**
- Narrow bands = High confidence in prediction
- Wide bands = Higher uncertainty
- Asymmetric bands = Directional bias in uncertainty

**Calculation Method:**
The confidence intervals are derived from:
1. Historical prediction error distribution
2. Current market volatility regime
3. Model-specific uncertainty quantification

### 6.4 Spread Analysis

The **spread** between horizons provides insight into expected price trajectory:

```
Spread Matrix Example:
┌─────────┬───────┬───────┬───────┬───────┐
│         │  +1H  │  +2H  │  +4H  │  +6H  │
├─────────┼───────┼───────┼───────┼───────┤
│ Current │ +$150 │ +$280 │ +$450 │ +$520 │
├─────────┼───────┼───────┼───────┼───────┤
│ +1H     │   -   │ +$130 │ +$300 │ +$370 │
├─────────┼───────┼───────┼───────┼───────┤
│ +2H     │   -   │   -   │ +$170 │ +$240 │
└─────────┴───────┴───────┴───────┴───────┘
```

**Spread Interpretation:**
- **Positive spreads:** Model expects price to rise
- **Negative spreads:** Model expects price to fall
- **Accelerating spreads:** Momentum building
- **Decelerating spreads:** Momentum fading

---

## 7. Accuracy Tracking & Validation

### 7.1 Accuracy Metrics

The system tracks prediction accuracy using multiple metrics:

#### Mean Absolute Error (MAE)
```
MAE = (1/n) × Σ|predicted_price - actual_price|
```
Measures average absolute deviation in dollar terms.

#### Mean Absolute Percentage Error (MAPE)
```
MAPE = (1/n) × Σ|predicted_price - actual_price| / actual_price × 100
```
Measures average percentage deviation.

#### Direction Accuracy
```
Direction_Accuracy = (correct_direction_predictions / total_predictions) × 100
```
Measures how often the model correctly predicts up/down movement.

#### Stabilization Accuracy
Compares the "stabilized" prediction (last prediction before horizon becomes actual) against the actual price. This measures the model's final refined prediction.

### 7.2 Accuracy by Horizon

Typical accuracy patterns:

| Horizon | Expected MAPE | Direction Accuracy |
|---------|---------------|-------------------|
| +1H | 0.3% - 0.5% | 55% - 60% |
| +2H | 0.5% - 0.8% | 53% - 58% |
| +4H | 0.8% - 1.2% | 52% - 56% |
| +6H | 1.0% - 1.5% | 51% - 55% |
| +8H | 1.2% - 1.8% | 50% - 54% |
| +12H | 1.5% - 2.2% | 50% - 53% |
| +18H | 1.8% - 2.8% | 49% - 52% |
| +24H | 2.0% - 3.5% | 48% - 52% |

*Note: Accuracy varies significantly based on market regime (trending vs. ranging).*

### 7.3 Regime-Dependent Performance

The models perform differently across market regimes:

| Regime | Characteristics | Model Performance |
|--------|-----------------|-------------------|
| **Trending** | Clear directional moves | Higher direction accuracy |
| **Ranging** | Sideways consolidation | Lower direction accuracy, tighter MAPE |
| **Volatile** | Large swings, reversals | Wider confidence bands, lower accuracy |
| **Low Volatility** | Compressed ranges | Tighter predictions, higher accuracy |

### 7.4 Validation Methodology

#### Backtesting
- Historical data replay with walk-forward validation
- No look-ahead bias in feature engineering
- Out-of-sample testing on unseen data

#### Live Tracking
- Real-time comparison of predictions vs. actuals
- Rolling accuracy windows (24h, 7d, 30d)
- Automatic alerting on accuracy degradation

---

## 8. Visualization Layer

### 8.1 Chart Components

The UI renders the following visual elements:

#### Forward Curve Line
- **V4.32 Curve:** Cyan/teal color (#22d3ee)
- **V5 Curve:** Amber/orange color (#f59e0b)
- Plotted from current time extending into future horizons

#### Historical Candles
- Standard OHLC candlesticks
- Green (up) / Red (down) coloring
- 48 hours of historical data from Binance

#### Confidence Bands
- Semi-transparent fill between upper_90 and lower_90
- Provides visual representation of prediction uncertainty

#### NOW Marker
- Vertical line or marker indicating current time
- Separates historical data from predictions

#### Spot Price Display
- Real-time BTC price from Binance
- Updates with each trade tick

### 8.2 Information Panels

#### V4.32 Info Box
Displays:
- Current price
- Each horizon with target price and % change
- Regime indicator
- Curve quality score
- Time since anchor

#### V5 Info Box
Displays:
- Current price
- Each horizon with target price and % change
- Direction indicator
- Confidence level and score

### 8.3 Spread Matrix

Interactive matrix showing price differentials between horizons:
- Color-coded cells (green = positive, red = negative)
- Flash animation on significant changes
- Integer-only flash updates (reduces noise)

### 8.4 Accuracy Table

Historical accuracy display:
- Per-horizon accuracy metrics
- Stabilization accuracy percentage
- Color-coded performance indicators

---

## 9. API Reference

### 9.1 HTTP Endpoints

#### Get Current V5 Curve
```
GET /api/curve/current
```
Returns the latest V5 forward curve prediction.

#### Get Curve History
```
GET /api/curve/history?limit=10
```
Returns historical curve snapshots.

#### Get Curve Summary
```
GET /api/curve/summary
```
Returns a quick summary of current predictions.

#### Get Binance Klines
```
GET /api/binance-klines?symbol=BTCUSDT&interval=1h&limit=48
```
Proxies Binance klines API for historical candle data.

### 9.2 WebSocket Connection

#### Connect
```
ws://[host]:[port]/ws
```

#### Message Flow
1. Client connects
2. Server sends initial V5 curve (if available)
3. Server sends initial V4 curve (if available)
4. Server broadcasts updates:
   - Trade ticks (continuous)
   - V4 curve updates (every 5 min)
   - V5 curve updates (every 5 min)
   - Heartbeats (every 5 sec)

### 9.3 External Model APIs

#### V4.32 API Endpoints
| Endpoint | Description |
|----------|-------------|
| `/prediction/tracking` | Current tracking predictions |
| `/prediction/yesterday` | Yesterday's predictions (for comparison) |
| `/history?limit=N` | Historical prediction snapshots |

#### V5 API Endpoints
| Endpoint | Description |
|----------|-------------|
| `/prediction` | Current forward curve |
| `/prediction/summary` | Quick summary |
| `/history?limit=N` | Historical predictions |

---

## 10. Operational Considerations

### 10.1 Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PRODUCTION SETUP                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐                                                │
│  │   Nginx Proxy   │◄──── HTTPS (port 443)                         │
│  │   (SSL Term)    │                                                │
│  └────────┬────────┘                                                │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐                                                │
│  │  Docker Container│                                               │
│  │  Forward Curve   │◄──── Internal port 8766                       │
│  │  Hub Server      │                                               │
│  └─────────────────┘                                                │
│                                                                      │
│  VPS: 46.225.55.106                                                 │
│  Domain: forwardcurves.eagleailabs.com                              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.2 Monitoring

Key metrics to monitor:
- WebSocket connection count
- API response times (V4, V5)
- Prediction freshness (time since last update)
- Error rates
- Memory/CPU usage

### 10.3 Failure Modes

| Failure | Impact | Mitigation |
|---------|--------|------------|
| V4 API down | No V4 curve updates | Graceful degradation, show last known |
| V5 API down | No V5 curve updates | Graceful degradation, show last known |
| Binance WS disconnect | No live ticks | Auto-reconnect with backoff |
| Server crash | Full outage | Docker restart policy, health checks |

### 10.4 Security

- Basic authentication on UI (eagle / EagleAI2026!)
- HTTPS via Nginx SSL termination
- No sensitive data exposed in API responses
- Rate limiting on API endpoints

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **LSTM** | Long Short-Term Memory neural network |
| **TFT** | Temporal Fusion Transformer |
| **Horizon** | Future time point for prediction |
| **Anchor** | Fixed reference timestamp (13:00 UTC) |
| **Liquidity Fixing** | Daily anchor point |
| **Confidence Band** | Range of expected prices (90% CI) |
| **Spread** | Price difference between horizons |
| **Regime** | Market condition (trending, ranging, etc.) |
| **Stabilized** | Final prediction before becoming actual |
| **Tracking** | Continuously updated prediction |

---

## Appendix B: Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Feb 2026 | Initial whitepaper release |

---

## Appendix C: Contact

**Eagle AI Labs**
Technical Support: engineering@eagleailabs.com
Website: https://eagleailabs.com

---

*© 2026 Eagle AI Labs. All rights reserved. This document contains proprietary information.*

