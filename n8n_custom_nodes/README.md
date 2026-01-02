# n8n LinkedIn API Custom Nodes

Custom n8n nodes for integrating with the LinkedIn API scraper service.

## Features

- **LinkedIn Login Node**: Initialize session, login, logout, and manage authentication
- **LinkedIn Profile Node**: Scrape profiles, visit profiles, and get profile views
- **LinkedIn Connection Node**: Send connection requests
- **LinkedIn Messaging Node**: List conversations, read messages, send messages, and monitor for new messages
- **LinkedIn Search Node**: Search for people on LinkedIn

## New Simplified Mode (Recommended)

The API now supports a **singleton browser mode** that simplifies session management:

- **No Session IDs required** - The API manages a single browser instance automatically
- **Simpler workflows** - Just Initialize once, then perform actions
- **Backward compatible** - Legacy session-based mode still works

### Quick Start (New Mode)

1. Use **LinkedIn Login > Initialize** to start the browser
2. Use **LinkedIn Login > Login** to authenticate
3. Perform actions (Profile, Search, Messaging, Connection) - no sessionId needed!
4. Use **LinkedIn Login > Logout** when done

### Legacy Mode

If you need multiple concurrent sessions, use:
1. **LinkedIn Login > Initialize and Login (Legacy)** - returns a sessionId
2. Pass the sessionId to all subsequent nodes
3. Use **LinkedIn Login > Logout** with the sessionId

## Installation

### Method 1: Install in n8n Docker Container

1. **Copy the nodes to the n8n container:**

```bash
# Copy the entire n8n_custom_nodes folder to the container
docker cp n8n_custom_nodes/ n8n:/home/node/.n8n/custom/
```

2. **Install dependencies inside the container:**

```bash
docker exec -it n8n sh
cd /home/node/.n8n/custom/n8n_custom_nodes
npm install
npm run build
exit
```

3. **Restart n8n:**

```bash
docker restart n8n
```

### Method 2: Mount as Volume (Recommended for Development)

Update your `docker-compose.yml`:

```yaml
services:
  n8n:
    image: n8nio/n8n:latest
    volumes:
      - n8n_data:/home/node/.n8n
      - ./n8n_custom_nodes:/home/node/.n8n/custom/n8n_custom_nodes
    environment:
      - N8N_CUSTOM_EXTENSIONS=/home/node/.n8n/custom
```

Then run:

```bash
cd n8n_custom_nodes
npm install
npm run build
docker-compose restart n8n
```

## Configuration

### 1. Set up LinkedIn API Credentials

1. In n8n, go to **Credentials** > **New**
2. Search for "LinkedIn API"
3. Fill in the fields:
   - **Base URL**: `http://linkedin-api:8080` (if using docker-compose) or `http://localhost:8080`
   - **Email**: Your LinkedIn email (optional if set in API .env)
   - **Password**: Your LinkedIn password (optional if set in API .env)

4. Click **Test** to verify connectivity
5. Click **Save**

### 2. Use the Nodes

The following nodes will be available in your n8n workflow editor:

#### LinkedIn Login Node

**Operations:**

- **Initialize** (New - Recommended)
  - Initializes the browser without returning a session ID
  - Use this for the new simplified mode
  - Output: Success status and authentication state

- **Initialize and Login (Legacy)**
  - Initialize browser session and login to LinkedIn
  - Returns a Session ID for backward compatibility
  - Inputs: Email (optional), Password (optional)
  - Output: Session ID and success status

- **Login**
  - Login to LinkedIn (after Initialize)
  - Inputs: Email (optional), Password (optional)
  - Output: Success status

- **Get Status** (New)
  - Get current authentication status
  - Output: isLoggedIn, browserInitialized, currentUrl

- **Force Authenticate** (New)
  - Workaround for timeout issues during login
  - Use when login appears stuck
  - Output: Success status

- **Logout**
  - Close browser session and logout
  - Input: Session ID (optional in new mode)
  - Output: Success status

- **Get Active Sessions (Legacy)**
  - List all active sessions
  - Output: List of session IDs with status

#### LinkedIn Profile Node

**Operations:**

- **Scrape Profile**: Extract complete profile data
  - Input: Profile URL, Session ID (optional)
  - Output: Profile data (name, headline, about, experience, education, etc.)

- **Visit Profile**: Visit a profile (increases profile views)
  - Input: Profile URL, Session ID (optional)
  - Output: Success status

- **Get Profile Views**: Get who viewed your profile
  - Input: Session ID (optional)
  - Output: List of profile viewers

#### LinkedIn Connection Node

**Operations:**

- **Send Connection Request**: Send a connection request
  - Inputs: Profile URL, Message (optional), Session ID (optional)
  - Output: Success status

#### LinkedIn Messaging Node

**Operations:**

- **Start Monitoring** (New)
  - Start monitoring for new messages in a separate browser tab
  - Input: Session ID (optional)
  - Output: Success status, monitoring state

- **Stop Monitoring** (New)
  - Stop message monitoring
  - Input: Session ID (optional)
  - Output: Success status

- **List Conversations**: Get all conversations
  - Input: Session ID (optional)
  - Output: List of conversations

- **Get Unread Messages**: Get unread messages
  - Input: Session ID (optional)
  - Output: List of unread messages

- **Read Conversation**: Read a specific conversation
  - Inputs: 
    - Conversation URL (required)
    - Profile URL for caching (optional, recommended)
    - Force Refresh (optional, default: false)
    - Session ID (optional)
  - Output: Conversation messages with `cached` indicator

- **Send Message**: Send a message
  - Inputs: Conversation URL, Message, Session ID (optional)
  - Output: Success status

- **Get Conversation URL** (New)
  - Get conversation URL from a profile URL
  - Input: Profile URL
  - Output: Conversation URL

#### LinkedIn Search Node

**Operations:**

- **Search People**: Search for people
  - Inputs: Keywords, Limit (default: 50), Session ID (optional)
  - Output: List of search results

## Example Workflows

### Example 1: Simple Profile Scrape (New Mode)

```
[Manual Trigger] 
  → [LinkedIn Login: Initialize]
  → [LinkedIn Login: Login]
  → [LinkedIn Profile: Scrape Profile]
  → [Google Sheets: Append]
  → [LinkedIn Login: Logout]
```

### Example 2: Complete Session Management (Legacy Mode)

```
[Manual Trigger] 
  → [LinkedIn Login: Initialize and Login (Legacy)]
  → [LinkedIn Profile: Scrape Profile] (pass sessionId)
  → [Google Sheets: Append]
  → [LinkedIn Login: Logout] (pass sessionId)
```

### Example 3: Scrape Multiple Profiles

```
[Manual Trigger] 
  → [LinkedIn Login: Initialize]
  → [LinkedIn Login: Login]
  → [Code Node: Generate URLs]
  → [LinkedIn Profile: Scrape Profile]
  → [Google Sheets: Append]
  → [LinkedIn Login: Logout]
```

### Example 4: Auto-Connect with Message

```
[LinkedIn Login: Initialize]
  → [LinkedIn Login: Login]
  → [LinkedIn Search: Search People]
  → [Filter: Check criteria]
  → [LinkedIn Connection: Send Request]
  → [Slack: Notify]
  → [LinkedIn Login: Logout]
```

### Example 5: Monitor Unread Messages with Real-time Monitoring

```
[LinkedIn Login: Initialize]
  → [LinkedIn Login: Login]
  → [LinkedIn Messaging: Start Monitoring]
  → [Schedule Trigger: Every 5 minutes]
  → [LinkedIn Messaging: Get Unread]
  → [Filter: Has unread]
  → [Slack: Send notification]
```

### Example 6: Handle Login Timeout Issues

```
[LinkedIn Login: Initialize]
  → [LinkedIn Login: Login]
  → [IF: Check if logged in using Get Status]
  → [YES: Continue workflow]
  → [NO: LinkedIn Login: Force Authenticate]
  → [Continue workflow]
```

## API Endpoints Used

### Authentication
- `POST /api/auth/initialize` - Initialize browser (new mode)
- `POST /api/auth/init` - Initialize browser (legacy, returns sessionId)
- `POST /api/auth/login` - Authenticate
- `GET /api/auth/status` - Get authentication status (new)
- `POST /api/auth/force-authenticate` - Force authentication (new)
- `DELETE /api/auth/logout` - Logout and close session
- `GET /api/auth/sessions` - List active sessions (legacy)

### Profile
- `POST /api/profile/scrape` - Scrape profile
- `POST /api/profile/visit` - Visit profile
- `GET /api/profile/views` - Get profile views

### Connection
- `POST /api/connection/request` - Send connection request

### Messaging
- `POST /api/messages/monitoring/start` - Start message monitoring (new)
- `POST /api/messages/monitoring/stop` - Stop message monitoring (new)
- `GET /api/messages/conversations` - List conversations
- `GET /api/messages/unread` - Get unread messages
- `GET /api/messages/conversation` - Read conversation
- `POST /api/messages/send` - Send message
- `GET /api/messages/conversation-url` - Get conversation URL from profile

### Search
- `POST /api/search/people` - Search people

## Troubleshooting

### Nodes not appearing in n8n

1. Check that the custom extensions path is correct in n8n settings
2. Verify the package.json has the correct n8n configuration
3. Run `npm run build` in the n8n_custom_nodes directory
4. Restart n8n container
5. Check n8n logs: `docker logs n8n`

### Session ID errors (Legacy Mode)

1. Test the credentials again to regenerate the session ID
2. Make sure the LinkedIn API is running and accessible
3. Check that the base URL is correct

### Login appears stuck or times out

1. Use the **Get Status** operation to check the current state
2. If login is stuck, use the **Force Authenticate** operation
3. This is a workaround for LinkedIn's occasional slow responses

### "Browser not initialized" errors

1. Make sure you've called **Initialize** before other operations
2. In new mode, call Initialize first, then Login
3. In legacy mode, use **Initialize and Login (Legacy)**

### TypeScript errors

The lint errors about `n8n-workflow` module are expected in the IDE. They will be resolved when the nodes are built inside the n8n container, which has access to the n8n-workflow package.

## Development

To modify the nodes:

1. Edit the `.ts` files in `credentials/` or `nodes/`
2. Run `npm run build` to compile
3. The changes will be automatically picked up if using volume mount
4. Restart n8n to reload the nodes

## License

MIT
