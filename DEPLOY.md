# Forward Curve Hub - Deployment Guide

## Quick Deploy to VPS

### Prerequisites
- Ubuntu 22.04 VPS (DigitalOcean, AWS, etc.)
- Domain name (optional but recommended)
- SSH access to VPS

---

## Option 1: Docker (Recommended)

### On your VPS:

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Clone repo
git clone https://github.com/YOUR_ORG/forward-curve-hub.git
cd forward-curve-hub/ForwardCurveHub

# Run with Docker Compose
docker-compose up -d

# Check logs
docker-compose logs -f
```

**Done!** Access at `http://YOUR_VPS_IP:8766`

---

## Option 2: Manual Setup (systemd + nginx)

### Step 1: Push to GitHub

```bash
# On your local machine
cd /Users/jackrockell/Desktop/FORWARD_CURVES
git add ForwardCurveHub/
git commit -m "Add Forward Curve Hub deployment"
git push origin main
```

### Step 2: SSH to VPS

```bash
ssh ubuntu@YOUR_VPS_IP
```

### Step 3: Run Setup Script

```bash
# Clone repo
git clone https://github.com/YOUR_ORG/forward-curve-hub.git
cd forward-curve-hub/ForwardCurveHub

# Run setup
chmod +x deploy/setup-vps.sh
./deploy/setup-vps.sh
```

### Step 4: Configure Domain (Optional)

```bash
# Edit nginx config with your domain
sudo nano /etc/nginx/sites-available/forward-curve-hub
# Change: server_name forwardcurve.eagleai.com;

# Get SSL certificate
sudo certbot --nginx -d forwardcurve.eagleai.com
```

---

## Useful Commands

```bash
# Check status
sudo systemctl status forward-curve-hub

# View logs
sudo journalctl -u forward-curve-hub -f

# Restart service
sudo systemctl restart forward-curve-hub

# Update code
cd /opt/forward-curve-hub
git pull
sudo systemctl restart forward-curve-hub
```

---

## Architecture

```
Internet
    │
    ▼
┌─────────────────┐
│     Nginx       │  :80/:443
│  (reverse proxy)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Forward Curve   │  :8766
│     Hub         │
│  (Python/aiohttp)│
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐ ┌───────┐
│V4 API │ │V5 API │
│(ngrok)│ │(local)│
└───────┘ └───────┘
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 8766 | Server port |
| HOST | 0.0.0.0 | Bind address |
| V4_API_URL | ngrok URL | V4 prediction API |
| V5_API_URL | local IP | V5 prediction API |
| LOG_LEVEL | INFO | Logging level |

---

## Troubleshooting

### WebSocket not connecting
- Check nginx WebSocket headers are set
- Ensure `proxy_read_timeout 86400;` is set

### V4 API errors
- V4 API runs via ngrok - URL may change
- Update `V4_API_URL` in server code if needed

### Service won't start
```bash
# Check logs
sudo journalctl -u forward-curve-hub -n 50

# Check Python path
/opt/forward-curve-hub/venv/bin/python --version
```

