# LinkedIn Scraper API - Complete Documentation

## Table of Contents
1. [Quick Start](#quick-start)
2. [Installation](#installation)
3. [API Reference](#api-reference)
4. [Testing](#testing)
5. [Architecture](#architecture)
6. [Deployment](#deployment)

---

## Quick Start

### Prerequisites
- Node.js v16+
- Chrome/Chromium browser
- LinkedIn account

### Setup (3 steps)

```bash
# 1. Setup
./setup.sh

# 2. Start server
npm run dev

# 3. Test
npm run example
```

### Your Credentials
Pre-configured in `.env.example`:
- Email: millian59192@gmail.com
- Password: mixSGj/zVS64zD(

---

## Installation

### Automated Setup
```bash
./setup.sh
```

### Manual Setup
```bash
# 1. Create environment file
cp .env.example .env

# 2. Install dependencies
npm install

# 3. Build (optional for dev)
npm run build
```

### Available Scripts
```bash
npm run dev      # Development server with hot reload
npm run build    # Build for production
npm start        # Start production server
npm run example  # Run example client
```

---

## API Reference

### Base URL
```
http://localhost:3000
```

### Authentication Endpoints

#### Initialize Session
```http
POST /api/auth/init
```
**Response:**
```json
{
  "success": true,
  "sessionId": "uuid-string",
  "message": "Browser session initialized"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "sessionId": "uuid-string",
  "email": "optional@email.com",
  "password": "optional-password"
}
```
**Response:**
```json
{
  "success": true,
  "sessionId": "uuid-string",
  "token": "li_at_token",
  "message": "Login successful"
}
```

#### Logout
```http
DELETE /api/auth/logout
Content-Type: application/json

{
  "sessionId": "uuid-string"
}
```

#### Get Active Sessions
```http
GET /api/auth/sessions
```

### Profile Endpoints

#### Scrape Profile
```http
POST /api/profile/scrape
Content-Type: application/json

{
  "sessionId": "uuid-string",
  "url": "https://www.linkedin.com/in/nicolas-briffaud/"
}
```

#### Visit Profile
```http
POST /api/profile/visit
Content-Type: application/json

{
  "sessionId": "uuid-string",
  "url": "https://www.linkedin.com/in/nicolas-briffaud/"
}
```

#### Get Profile Views
```http
GET /api/profile/views?sessionId=uuid-string
```

### Connection Endpoint

#### Send Connection Request
```http
POST /api/connection/connect
Content-Type: application/json

{
  "sessionId": "uuid-string",
  "url": "https://www.linkedin.com/in/nicolas-briffaud/",
  "message": "Hi! I'd love to connect with you."
}
```

### Messaging Endpoints

#### List Conversations
**Lists ALL your conversations** (inbox overview)
```http
GET /api/messages/conversations?sessionId=uuid-string
```
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "conversation-1-url",
      "name": "John Doe",
      "lastMessage": "Thanks!",
      "timestamp": "2024-01-01"
    }
  ]
}
```

#### Read Conversation
**Reads messages from ONE specific conversation only**
```http
GET /api/messages/conversation?sessionId=uuid-string&conversationUrl=https://www.linkedin.com/messaging/thread/2-ABC123&profileUrl=https://www.linkedin.com/in/john-doe/&forceRefresh=true
```
**Parameters:**
- `sessionId`: Your session ID (required)
- `conversationUrl`: The specific conversation URL (get this from List Conversations) (required)
- `profileUrl`: LinkedIn profile URL for caching (optional, recommended)
- `forceRefresh`: Bypass cache and fetch fresh data (optional, default: `false`)

**Caching:**
When `profileUrl` is provided, the conversation is cached in PostgreSQL using the profile URL as the primary key. Subsequent requests with the same `profileUrl` will return cached data, improving performance and reducing LinkedIn API calls.

**Force Refresh:**
Set `forceRefresh=true` or `forceRefresh=1` to bypass the cache and fetch fresh data from LinkedIn. The fresh data will automatically update the cache. Use this when you need the most up-to-date conversation messages.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "sender": "John Doe",
      "message": "Hello!",
      "timestamp": "2024-01-01T10:00:00Z"
    },
    {
      "sender": "You",
      "message": "Hi there!",
      "timestamp": "2024-01-01T10:01:00Z"
    }
  ],
  "cached": false,
  "cacheUpdated": true
}
```

**Response Fields:**
- `success`: Whether the operation was successful
- `data`: Array of conversation messages
- `cached`: Whether the data was retrieved from cache (`true`) or fetched from LinkedIn (`false`)
- `cacheUpdated`: Whether the database cache was updated during this request (`true` when fresh data was cached, `false` when returning cached data)

**Notes:** 
- **Smart Cache Updates**: When `forceRefresh=true`, the API compares fresh data with cached data:
  - If changes detected: `cached=false`, `cacheUpdated=true` (cache updated)
  - If no changes: `cached=false`, `cacheUpdated=false` (cache not updated)
- When returning cached data: `cached=true`, `cacheUpdated=false`
- When fetching fresh data (cache miss) with `profileUrl`: `cached=false`, `cacheUpdated=true`
- This prevents unnecessary database writes when data hasn't changed
- **Date Conversion**: The API automatically converts relative dates to actual dates:
  - "Today" / "Aujourd'hui" → "8 nov."
  - "Yesterday" / "Hier" → "7 nov."
  - Weekday names (e.g., "lundi", "Monday") → Actual date (e.g., "4 nov.")
  - Supports French, English, and Spanish date formats

#### Send Message
**Sends a message to a specific conversation**
```http
POST /api/messages/send
Content-Type: application/json

{
  "sessionId": "uuid-string",
  "conversationId": "https://www.linkedin.com/messaging/thread/2-ABC123",
  "message": "Hello!"
}
```

---

## Testing

### Using Example Client
```bash
npm run example
```

### Using cURL

```bash
# 1. Initialize
SESSION_ID=$(curl -s -X POST http://localhost:3000/api/auth/init | jq -r '.sessionId')

# 2. Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\"}"

# 3. Scrape profile
curl -X POST http://localhost:3000/api/profile/scrape \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\", \"url\": \"https://www.linkedin.com/in/nicolas-briffaud/\"}"

# 4. Logout
curl -X DELETE http://localhost:3000/api/auth/logout \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\": \"$SESSION_ID\"}"
```

### Using Postman
1. Import `postman_collection.json`
2. Run "Initialize Session" (saves sessionId automatically)
3. Run other endpoints

### Using Bruno
See `bruno/` directory for Bruno API client tests.

---

## Architecture

### System Overview
```
Client → Express API → LinkedInService → linvo-scraper → Puppeteer → LinkedIn
```

### Components

**Express Server** (`src/server.ts`)
- REST API endpoints
- CORS, JSON parsing
- Error handling

**Routes** (`src/routes/`)
- `auth.routes.ts` - Authentication
- `profile.routes.ts` - Profile operations
- `connection.routes.ts` - Connections
- `message.routes.ts` - Messaging

**Services** (`src/services/`)
- `LinkedInService.ts` - Core LinkedIn operations
- `SessionManager.ts` - Browser session management
- `CacheService.ts` - PostgreSQL caching layer

**Session Management**
- UUID-based sessions
- 30-minute timeout
- Auto-cleanup every 10 minutes
- Multiple concurrent sessions supported

**Caching System**
- PostgreSQL database for persistent caching
- Two cache tables:
  - `linkedin_profiles` - Cached profile data (keyed by profile URL)
  - `linkedin_conversations` - Cached conversation messages (keyed by profile URL)
- Automatic cache updates on data fetch
- Reduces LinkedIn API calls and improves performance

### Technology Stack
- **Backend**: Express.js + TypeScript
- **Browser**: Puppeteer
- **LinkedIn**: linvo-scraper
- **Database**: PostgreSQL (for caching)
- **Sessions**: UUID

---

## Deployment

### Local Development
```bash
npm run dev
```

### Production with PM2
```bash
# Install PM2
npm install -g pm2

# Build and start
npm run build
pm2 start dist/server.js --name linkedin-scraper-api

# Auto-restart on reboot
pm2 startup
pm2 save
```

### Docker
```bash
# Build
docker build -t linkedin-scraper-api .

# Run
docker run -d \
  --name linkedin-scraper \
  -p 3000:3000 \
  -e LINKEDIN_EMAIL=your_email@example.com \
  -e LINKEDIN_PASSWORD=your_password \
  linkedin-scraper-api
```

### Environment Variables
```env
LINKEDIN_EMAIL=millian59192@gmail.com
LINKEDIN_PASSWORD=mixSGj/zVS64zD(
PORT=3000
NODE_ENV=production
```

---

## Best Practices

### Rate Limiting
- Wait 3-5 seconds between profile scrapes
- Wait 5-10 seconds between connection requests
- Max 100 connection requests per day
- Max 500 profile scrapes per day

### Session Management
- Always logout when done
- Don't exceed 30-minute idle time
- Monitor active sessions

### Error Handling
```javascript
const response = await fetch(endpoint, options);
const result = await response.json();

if (!result.success) {
  console.error('Error:', result.message);
  // Handle error
}
```

---

## Troubleshooting

### Browser doesn't open
```bash
# Mac
brew install --cask google-chrome

# Linux
sudo apt-get install chromium-browser
```

### Login fails
- Verify credentials in `.env`
- Handle 2FA manually in browser
- Check for LinkedIn blocks

### Port already in use
```bash
# Find and kill process
lsof -i :3000
kill -9 <PID>

# Or change port
echo "PORT=3001" >> .env
```

### Dependencies fail
```bash
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

---

## Security

- ✅ Credentials in `.env` (gitignored)
- ✅ Session isolation
- ✅ Auto-cleanup
- ✅ CORS configured
- ✅ Error sanitization

---

## Support

### File Structure
```
windsurf-project-3/
├── src/                    # Source code
├── examples/               # Example client
├── bruno/                  # Bruno API tests
├── package.json           # Dependencies
├── .env.example           # Environment template
└── DOCUMENTATION.md       # This file
```

### Common Commands
```bash
./setup.sh              # Setup
npm run dev            # Development
npm run example        # Test
npm run build          # Build
npm start              # Production
```

---

## License
MIT License

## Disclaimer
Educational purposes only. Use responsibly and in accordance with LinkedIn's Terms of Service.
