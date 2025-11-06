#!/bin/bash

echo "🚀 Installing n8n LinkedIn API Custom Nodes..."

# Check if running in Docker
if [ -f /.dockerenv ]; then
    echo "📦 Running inside Docker container"
    INSTALL_PATH="/home/node/.n8n/nodes"
else
    echo "💻 Running on host machine"
    INSTALL_PATH="./n8n_custom_nodes"
fi

# Install dependencies
echo "📥 Installing dependencies..."
npm install

# Build TypeScript files (if tsc is available)
if command -v tsc &> /dev/null; then
    echo "🔨 Building TypeScript files..."
    npm run build 2>/dev/null || echo "⚠️  Build skipped (will be built by n8n)"
else
    echo "⚠️  TypeScript compiler not found, skipping build"
fi

echo ""
echo "✅ Installation complete!"
echo ""
echo "📝 Next steps:"
echo "1. Restart n8n: docker-compose restart n8n"
echo "2. Open n8n at http://localhost:5678"
echo "3. Go to Credentials → New → LinkedIn API"
echo "4. Configure and test your credentials"
echo "5. Start using the LinkedIn nodes in your workflows!"
echo ""
echo "📚 See README.md for detailed usage instructions"
