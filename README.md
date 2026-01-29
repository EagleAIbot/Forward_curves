# Forward Curve Hub

**Institutional-grade forward curve visualization platform for digital assets.**

Built by [Eagle AI Labs](https://eagleai.com)

![Forward Curve Hub](https://img.shields.io/badge/status-live-brightgreen) ![Python](https://img.shields.io/badge/python-3.11+-blue) ![License](https://img.shields.io/badge/license-proprietary-red)

---

## Overview

Forward Curve Hub provides real-time visualization of BTC forward curves with institutional analytics, combining predictions from our V4.32 and V5 oracle models.

### Features

- **Real-time Forward Curves** - 8 tenor points from +1H to +24H
- **Dual Model Support** - V4.32 (stabilized) and V5 (research) curves
- **Live Price Feed** - Binance WebSocket tick data
- **Model Accuracy Tracker** - MAPE, MAE, Raw vs Stabilized error comparison
- **Curve Analytics** - Steepness, convexity, carry, butterfly spreads
- **Spread Matrix** - Color-coded heatmap of inter-tenor spreads
- **Trade Calculator** - Curve trade P/L and yield calculations
- **Multiple Interpolation** - Standard, Cubic Spline, Monotone Convex (Hagan-West)

---

## Quick Start

### Local Development

```bash
# Clone repo
git clone https://github.com/EagleAIbot/Forward_curves.git
cd Forward_curves

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run server
python server/ipc_ui_server.py --port 8766

# Open browser
open http://localhost:8766
```

### Docker

```bash
docker-compose up -d
# Access at http://localhost:8766
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser (UI)                      │
│  - LightweightCharts visualization                  │
│  - Real-time WebSocket updates                      │
│  - Institutional analytics panels                   │
└──────────────────────┬──────────────────────────────┘
                       │ WebSocket
                       ▼
┌─────────────────────────────────────────────────────┐
│              Forward Curve Hub Server               │
│  - Python/aiohttp                                   │
│  - WebSocket broadcast                              │
│  - V4 + V5 curve polling                           │
└───────┬─────────────────────────────┬───────────────┘
        │                             │
        ▼                             ▼
┌───────────────┐           ┌───────────────┐
│   V4.32 API   │           │    V5 API     │
│   (Oracle)    │           │  (Research)   │
└───────────────┘           └───────────────┘
```

---

## Deployment

See [DEPLOY.md](DEPLOY.md) for full deployment instructions.

### Quick Deploy (Docker)

```bash
ssh ubuntu@YOUR_VPS_IP
git clone https://github.com/EagleAIbot/Forward_curves.git
cd Forward_curves
docker-compose up -d
```

### With SSL (nginx + certbot)

```bash
# Run setup script
chmod +x deploy/setup-vps.sh
./deploy/setup-vps.sh

# Add SSL
sudo certbot --nginx -d your-domain.com
```

---

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Main UI |
| `WS /ws` | WebSocket for real-time data |
| `GET /api/health` | Health check |

---

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8766 | Server port |
| `HOST` | 0.0.0.0 | Bind address |
| `V4_API_URL` | ngrok URL | V4 Oracle API |
| `V5_API_URL` | local | V5 Research API |

---

## License

Proprietary - Eagle AI Labs © 2026

---

## Support

Contact: [team@eagleai.com](mailto:team@eagleai.com)

