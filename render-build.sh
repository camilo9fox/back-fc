#!/bin/bash
set -e

echo "==> Installing system dependencies for canvas and mupdf..."
mkdir -p /var/lib/apt/lists/partial
apt-get update -qq
apt-get install -y -qq \
  build-essential \
  libcairo2-dev \
  libpango1.0-dev \
  libjpeg-dev \
  libgif-dev \
  librsvg2-dev \
  libmupdf-dev \
  pkg-config

echo "==> Installing Node.js dependencies..."
npm install

echo "==> Build complete."
