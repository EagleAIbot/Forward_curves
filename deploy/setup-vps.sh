#!/bin/bash
# Forward Curve Hub - VPS Setup Script
#
# Run on a fresh Ubuntu 22.04 VPS:
#   curl -sSL https://raw.githubusercontent.com/YOUR_REPO/main/ForwardCurveHub/deploy/setup-vps.sh | bash
#
# Or manually:
#   chmod +x setup-vps.sh
#   ./setup-vps.sh

set -e

echo "=========================================="
echo "Forward Curve Hub - VPS Setup"
echo "=========================================="

# Update system
echo "[1/8] Updating system..."
sudo apt-get update && sudo apt-get upgrade -y

# Install dependencies
echo "[2/8] Installing dependencies..."
sudo apt-get install -y python3 python3-pip python3-venv nginx certbot python3-certbot-nginx git curl

# Create app directory
echo "[3/8] Creating application directory..."
sudo mkdir -p /opt/forward-curve-hub
sudo chown $USER:$USER /opt/forward-curve-hub

# Clone repository (or copy files)
echo "[4/8] Cloning repository..."
cd /opt/forward-curve-hub
if [ -d ".git" ]; then
    git pull
else
    # Replace with your actual repo URL
    git clone https://github.com/YOUR_ORG/forward-curve-hub.git .
    # Or if copying manually, skip this step
fi

# Setup Python virtual environment
echo "[5/8] Setting up Python environment..."
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Install systemd service
echo "[6/8] Installing systemd service..."
sudo cp deploy/forward-curve-hub.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable forward-curve-hub

# Install nginx config
echo "[7/8] Configuring nginx..."
sudo cp deploy/nginx.conf /etc/nginx/sites-available/forward-curve-hub
sudo ln -sf /etc/nginx/sites-available/forward-curve-hub /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

# Start the service
echo "[8/8] Starting Forward Curve Hub..."
sudo systemctl start forward-curve-hub
sudo systemctl status forward-curve-hub

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Forward Curve Hub is now running at:"
echo "  http://$(curl -s ifconfig.me):80"
echo ""
echo "Next steps:"
echo "  1. Update DNS to point your domain to this server"
echo "  2. Run: sudo certbot --nginx -d YOUR_DOMAIN"
echo "  3. Update nginx.conf with your domain"
echo ""
echo "Useful commands:"
echo "  sudo systemctl status forward-curve-hub"
echo "  sudo journalctl -u forward-curve-hub -f"
echo "  sudo systemctl restart forward-curve-hub"
echo ""

