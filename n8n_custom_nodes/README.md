# n8n LinkedIn API Custom Nodes

Custom n8n nodes for integrating with the LinkedIn API scraper service.

## Features

- **LinkedIn Profile Node**: Scrape profiles, visit profiles, and get profile views
- **LinkedIn Connection Node**: Send connection requests
- **LinkedIn Messaging Node**: List conversations, read messages, send messages
- **LinkedIn Search Node**: Search for people on LinkedIn

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
docker-compose restart n8n
```

## Configuration

### 1. Set up LinkedIn API Credentials

1. In n8n, go to **Credentials** → **New**
2. Search for "LinkedIn API"
3. Fill in the fields:
   - **Base URL**: `http://linkedin-api:8080` (if using docker-compose) or `http://localhost:8080`
   - **Email**: Your LinkedIn email (optional if set in API .env)
   - **Password**: Your LinkedIn password (optional if set in API .env)
   - **Session ID**: Leave empty (will be auto-generated)

4. Click **Test** to authenticate and generate a session ID
5. Click **Save**

### 2. Use the Nodes

The following nodes will be available in your n8n workflow editor:

#### LinkedIn Profile Node

**Operations:**
- **Scrape Profile**: Extract complete profile data
  - Input: Profile URL
  - Output: Profile data (name, headline, about, experience, education, etc.)

- **Visit Profile**: Visit a profile (increases profile views)
  - Input: Profile URL
  - Output: Success status

- **Get Profile Views**: Get who viewed your profile
  - Output: List of profile viewers

#### LinkedIn Connection Node

**Operations:**
- **Send Connection Request**: Send a connection request
  - Inputs: Profile URL, Message (optional)
  - Output: Success status

#### LinkedIn Messaging Node

**Operations:**
- **List Conversations**: Get all conversations
  - Output: List of conversations

- **Get Unread Messages**: Get unread messages
  - Output: List of unread messages

- **Read Conversation**: Read a specific conversation
  - Input: Conversation URL
  - Output: Conversation messages

- **Send Message**: Send a message
  - Inputs: Conversation ID, Message
  - Output: Success status

#### LinkedIn Search Node

**Operations:**
- **Search People**: Search for people
  - Inputs: Keywords, Limit (default: 50)
  - Output: List of search results

## Example Workflows

### Example 1: Scrape Multiple Profiles

```
[Manual Trigger] 
  → [Code Node: Generate URLs]
  → [LinkedIn Profile: Scrape Profile]
  → [Google Sheets: Append]
```

### Example 2: Auto-Connect with Message

```
[LinkedIn Search: Search People]
  → [Filter: Check criteria]
  → [LinkedIn Connection: Send Request]
  → [Slack: Notify]
```

### Example 3: Monitor Unread Messages

```
[Schedule Trigger: Every 5 minutes]
  → [LinkedIn Messaging: Get Unread]
  → [Filter: Has unread]
  → [Slack: Send notification]
```

## API Endpoints Used

- `POST /api/auth/init` - Initialize session
- `POST /api/auth/login` - Authenticate
- `POST /api/profile/scrape` - Scrape profile
- `POST /api/profile/visit` - Visit profile
- `GET /api/profile/views` - Get profile views
- `POST /api/connection/send-request` - Send connection request
- `GET /api/messages/conversations` - List conversations
- `GET /api/messages/unread` - Get unread messages
- `GET /api/messages/conversation` - Read conversation
- `POST /api/messages/send` - Send message
- `POST /api/search/people` - Search people

## Troubleshooting

### Nodes not appearing in n8n

1. Check that the custom extensions path is correct in n8n settings
2. Verify the package.json has the correct n8n configuration
3. Restart n8n container
4. Check n8n logs: `docker logs n8n`

### Session ID errors

1. Test the credentials again to regenerate the session ID
2. Make sure the LinkedIn API is running and accessible
3. Check that the base URL is correct

### TypeScript errors

The lint errors about `n8n-workflow` module are expected in the IDE. They will be resolved when the nodes are built inside the n8n container, which has access to the n8n-workflow package.

## Development

To modify the nodes:

1. Edit the `.ts` files in `credentials/` or `nodes/`
2. The changes will be automatically picked up if using volume mount
3. Restart n8n to reload the nodes

## License

MIT
