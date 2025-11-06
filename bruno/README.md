# Bruno API Tests

This folder contains Bruno API client tests for the LinkedIn Scraper API.

## What is Bruno?

Bruno is a fast and Git-friendly open-source API client. Download it from [usebruno.com](https://www.usebruno.com/)

## Setup

1. **Install Bruno**
   - Download from https://www.usebruno.com/
   - Or install via Homebrew: `brew install bruno`

2. **Open Collection**
   - Open Bruno
   - Click "Open Collection"
   - Select the `bruno/` folder

3. **Configure Environment**
   - The `local` environment is pre-configured
   - Base URL: `http://localhost:3000`
   - Test Profile: `https://www.linkedin.com/in/nicolas-briffaud/`

## Usage

### Running Tests

**Recommended Order:**

1. **Health Check** - Verify server is running
2. **Auth → Initialize Session** - Creates browser session (saves sessionId)
3. **Auth → Login** - Authenticates with LinkedIn
4. **Profile → Scrape Profile** - Scrapes test profile
5. **Profile → Visit Profile** - Visits test profile
6. **Profile → Get Profile Views** - Gets who viewed your profile
7. **Messages → List Conversations** - Lists all conversations
8. **Connection → Send Connection Request** ⚠️ (sends real request!)
9. **Messages → Send Message** ⚠️ (sends real message!)
10. **Auth → Logout** - Cleanup session

### Auto-Save Session ID

The "Initialize Session" test automatically saves the `sessionId` to the environment, so you don't need to copy/paste it for subsequent requests.

## Test Structure

```
bruno/
├── bruno.json                     # Collection config
├── environments/
│   └── local.bru                 # Local environment variables
├── Health Check.bru              # Server health check
├── Auth/
│   ├── Initialize Session.bru   # Create session
│   ├── Login.bru                # Login to LinkedIn
│   ├── Get Active Sessions.bru  # List sessions
│   └── Logout.bru               # Cleanup
├── Profile/
│   ├── Scrape Profile.bru       # Scrape profile data
│   ├── Visit Profile.bru        # Visit profile
│   └── Get Profile Views.bru    # Get views
├── Connection/
│   └── Send Connection Request.bru  # Send connection
└── Messages/
    ├── List Conversations.bru   # List conversations
    ├── Read Conversation.bru    # Read messages
    └── Send Message.bru         # Send message
```

## Environment Variables

The `local` environment includes:

- `baseUrl`: http://localhost:3000
- `sessionId`: (auto-populated by Initialize Session test)
- `testProfileUrl`: https://www.linkedin.com/in/nicolas-briffaud/

## Test Assertions

Each test includes assertions to verify:
- ✅ HTTP status code (200)
- ✅ Response success field
- ✅ Expected data structure

## Warnings

⚠️ **These tests interact with real LinkedIn accounts:**

- **Send Connection Request** - Actually sends a connection request
- **Send Message** - Actually sends a message

Only run these tests if you intend to perform the action!

## Tips

1. **Run in sequence** - Some tests depend on previous ones (e.g., Login before Scrape)
2. **Check server logs** - Watch the terminal for detailed operation logs
3. **Wait between tests** - LinkedIn may rate limit rapid requests
4. **Logout when done** - Always cleanup sessions

## Troubleshooting

### Session not found
- Run "Initialize Session" first
- Check that sessionId is saved in environment

### Not authenticated
- Run "Login" after initializing session
- Check credentials in `.env` file

### Server not responding
- Verify server is running: `npm run dev`
- Check health endpoint: http://localhost:3000/health

## Example Workflow

```
1. Start server: npm run dev
2. Open Bruno
3. Open this collection
4. Run "Health Check"
5. Run "Initialize Session"
6. Run "Login"
7. Run profile/message tests
8. Run "Logout"
```

## Documentation

For complete API documentation, see [DOCUMENTATION.md](../DOCUMENTATION.md)
