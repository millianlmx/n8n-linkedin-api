# Use Node.js latest as base image
FROM node:latest

# Install dependencies for Chromium and headless browser
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    apt-transport-https \
    chromium \
    chromium-driver \
    xvfb \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libwayland-client0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Chrome binary path for puppeteer-real-browser
ENV CHROME_BIN=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV DISPLAY=:99

# Create app directory
WORKDIR /usr/src/app

# Create directory for browser data with proper permissions
RUN mkdir -p /usr/src/app/.browser-data && \
    chmod 777 /usr/src/app/.browser-data

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy project source code
COPY . .

# Build TypeScript to JavaScript
RUN npm run build

# Create startup script
RUN echo '#!/bin/bash\n\
set -e\n\
echo "🚀 Starting LinkedIn API container..."\n\
\n\
# Clean up any stale X lock files\n\
echo "🧹 Cleaning up stale X lock files..."\n\
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99\n\
\n\
# Start Xvfb (virtual display) in background\n\
echo "📺 Starting Xvfb virtual display..."\n\
Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset &\n\
XVFB_PID=$!\n\
sleep 2\n\
\n\
# Verify Xvfb is running\n\
if ps -p $XVFB_PID > /dev/null; then\n\
  echo "✅ Xvfb started successfully (PID: $XVFB_PID)"\n\
else\n\
  echo "❌ Failed to start Xvfb"\n\
  exit 1\n\
fi\n\
\n\
# Start the Node.js application\n\
echo "🎯 Starting Node.js application..."\n\
exec node dist/src/server.js' > /usr/src/app/start.sh && \
    chmod +x /usr/src/app/start.sh

# Expose API port
EXPOSE 8080

# Start with the startup script
CMD ["/usr/src/app/start.sh"]
