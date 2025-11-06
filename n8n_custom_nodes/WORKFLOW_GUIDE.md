# LinkedIn API Workflow Guide

## 🔄 New Workflow Pattern

With the new **LinkedIn Login** node, the workflow pattern has changed. The sessionId is now managed through the workflow itself, not stored in credentials.

## 📋 Node Structure

### 1. LinkedIn API Credentials
- **Purpose**: Store API base URL and optional LinkedIn credentials
- **Fields**:
  - Base URL (required): `http://linkedin-api:8080`
  - Email (optional): Your LinkedIn email
  - Password (optional): Your LinkedIn password
- **Note**: No longer stores sessionId

### 2. LinkedIn Login Node
- **Purpose**: Initialize browser and login to LinkedIn
- **Inputs**: 
  - Email (optional, uses credential if not provided)
  - Password (optional, uses credential if not provided)
- **Outputs**: 
  - `sessionId`: Session ID for subsequent nodes
  - `success`: Login status
  - `message`: Status message
  - `timestamp`: Login timestamp

### 3. Operation Nodes (Profile, Connection, Messaging, Search)
- **Purpose**: Perform LinkedIn operations
- **Inputs**:
  - Session ID (auto-filled from previous node: `={{$json.sessionId}}`)
  - Operation-specific parameters
- **Outputs**: Operation results

## 🚀 Basic Workflow Pattern

```
LinkedIn Login
  ↓ (outputs sessionId)
LinkedIn Profile/Connection/Messaging/Search
  ↓
Process Results
```

## 📊 Example Workflows

### Example 1: Simple Profile Scraper

```
Manual Trigger
  ↓
LinkedIn Login
  ↓ (sessionId)
LinkedIn Profile (Scrape Profile)
  - Session ID: ={{$json.sessionId}}
  - URL: https://www.linkedin.com/in/someone/
  ↓
Google Sheets (Append)
```

### Example 2: Bulk Profile Scraper

```
Manual Trigger
  ↓
LinkedIn Login
  ↓ (sessionId)
Code Node (Generate URLs array)
  ↓
Split In Batches
  ↓
LinkedIn Profile (Scrape Profile)
  - Session ID: ={{$json.sessionId}}
  - URL: ={{$json.url}}
  ↓
Wait (2 seconds - rate limiting)
  ↓
Airtable (Create Record)
```

### Example 3: Search and Auto-Connect

```
Manual Trigger
  ↓
LinkedIn Login
  ↓ (sessionId)
LinkedIn Search (Search People)
  - Session ID: ={{$json.sessionId}}
  - Keywords: "Software Engineer"
  - Limit: 50
  ↓
Filter (Check criteria)
  ↓
Code (Generate personalized message)
  ↓
LinkedIn Connection (Send Request)
  - Session ID: ={{$json.sessionId}}
  - Profile URL: ={{$json.profileUrl}}
  - Message: ={{$json.personalizedMessage}}
  ↓
Slack (Send notification)
```

### Example 4: Message Monitor with Auto-Reply

```
Schedule Trigger (Every 5 minutes)
  ↓
LinkedIn Login
  ↓ (sessionId)
LinkedIn Messaging (Get Unread)
  - Session ID: ={{$json.sessionId}}
  ↓
Filter (Has unread messages)
  ↓
LinkedIn Messaging (Read Conversation)
  - Session ID: ={{$json.sessionId}}
  - Conversation URL: ={{$json.conversationUrl}}
  ↓
OpenAI (Generate response)
  ↓
LinkedIn Messaging (Send Message)
  - Session ID: ={{$json.sessionId}}
  - Conversation ID: ={{$json.conversationId}}
  - Message: ={{$json.aiResponse}}
  ↓
Slack (Notify)
```

### Example 5: Daily Profile Visitor Report

```
Schedule Trigger (Daily at 9 AM)
  ↓
LinkedIn Login
  ↓ (sessionId)
LinkedIn Profile (Get Profile Views)
  - Session ID: ={{$json.sessionId}}
  ↓
Filter (New viewers only)
  ↓
Split In Batches
  ↓
LinkedIn Profile (Scrape Profile)
  - Session ID: ={{$json.sessionId}}
  - URL: ={{$json.viewerProfileUrl}}
  ↓
Airtable (Create Record)
  ↓
Email (Send daily summary)
```

### Example 6: Reuse Session Across Multiple Operations

```
Manual Trigger
  ↓
LinkedIn Login
  ↓ (sessionId)
  ├─→ LinkedIn Profile (Get Views)
  │     - Session ID: ={{$json.sessionId}}
  │     ↓
  │   Process Views
  │
  ├─→ LinkedIn Messaging (Get Unread)
  │     - Session ID: ={{$json.sessionId}}
  │     ↓
  │   Process Messages
  │
  └─→ LinkedIn Search (Search People)
        - Session ID: ={{$json.sessionId}}
        ↓
      Process Results
```

## 🔧 Configuration Tips

### 1. Session ID Auto-Fill

All operation nodes have the Session ID field pre-filled with:
```
={{$json.sessionId}}
```

This automatically pulls the sessionId from the previous node's output.

### 2. Credentials Setup

1. Go to **Credentials** → **New** → **LinkedIn API**
2. Fill in:
   - **Base URL**: `http://linkedin-api:8080` (Docker) or `http://localhost:8080` (local)
   - **Email**: Your LinkedIn email (optional)
   - **Password**: Your LinkedIn password (optional)
3. Click **Save** (no need to test)

### 3. Login Node Usage

The Login node will:
1. Call `/api/auth/init` to initialize a browser session
2. Call `/api/auth/login` to authenticate
3. Output the `sessionId` for downstream nodes

**Email/Password Priority:**
- If provided in the Login node → uses those
- If empty in Login node → uses credentials
- If empty in both → uses API's `.env` file

### 4. Error Handling

Enable "Continue on Fail" for bulk operations:
- Right-click node → Settings → Continue on Fail

This ensures one failure doesn't stop the entire workflow.

### 5. Rate Limiting

Add delays between operations to avoid LinkedIn rate limits:
- Use **Wait** node between operations
- Recommended: 2-5 seconds between profile operations
- Use **Split In Batches** for bulk operations

## 🎯 Best Practices

### 1. Session Management

✅ **Do:**
- Start each workflow with LinkedIn Login
- Reuse the same sessionId across multiple operations
- Handle login failures gracefully

❌ **Don't:**
- Try to reuse sessionId across different workflow executions
- Store sessionId in variables for later use (sessions expire)

### 2. Bulk Operations

✅ **Do:**
```
Login → Split In Batches → Wait → Operation → Aggregate
```

❌ **Don't:**
```
Login → Loop without delays → Operation (rate limit!)
```

### 3. Error Recovery

✅ **Do:**
- Enable "Continue on Fail"
- Add error notifications
- Log failed operations

❌ **Don't:**
- Ignore errors silently
- Retry immediately without delays

### 4. Data Flow

✅ **Do:**
- Use expressions to pass data: `={{$json.field}}`
- Validate data before operations
- Transform data between nodes

❌ **Don't:**
- Hardcode values
- Assume data structure
- Skip validation

## 🐛 Troubleshooting

### Session ID Not Found

**Problem**: "Session ID not found" error in operation nodes

**Solution**:
1. Ensure LinkedIn Login node is before the operation node
2. Check that Login node succeeded (green checkmark)
3. Verify Session ID field shows: `={{$json.sessionId}}`

### Login Failures

**Problem**: Login node fails

**Solutions**:
1. Check LinkedIn credentials in credentials or Login node
2. Verify API is running: `curl http://localhost:8080/api/health`
3. Check API logs: `docker logs linkedin-api`
4. Ensure LinkedIn account doesn't require 2FA

### Session Expired

**Problem**: Operations fail with "Session expired"

**Solution**:
- Re-run the workflow from the Login node
- Sessions are browser-based and expire when browser closes
- Each workflow execution needs a fresh login

### Rate Limiting

**Problem**: "Too many requests" errors

**Solution**:
- Add **Wait** nodes (2-5 seconds) between operations
- Use **Split In Batches** with smaller batch sizes
- Reduce operation frequency

## 📝 Data Structure Reference

### Login Node Output

```json
{
  "success": true,
  "sessionId": "abc123...",
  "message": "Successfully logged in to LinkedIn",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### Profile Scrape Output

```json
{
  "success": true,
  "data": {
    "name": "John Doe",
    "headline": "Software Engineer at Company",
    "about": "...",
    "experiences": [...],
    "education": [...],
    "skills": [...]
  }
}
```

### Search Output

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "name": "...",
        "profileUrl": "...",
        "headline": "..."
      }
    ],
    "total": 50
  }
}
```

## 🔄 Migration from Old Pattern

If you have existing workflows using the old pattern (sessionId in credentials):

### Old Pattern:
```
Operation Node
  - Uses sessionId from credentials
```

### New Pattern:
```
LinkedIn Login
  ↓ (outputs sessionId)
Operation Node
  - Session ID: ={{$json.sessionId}}
```

**Migration Steps:**
1. Add LinkedIn Login node at the start
2. Update all operation nodes to use `={{$json.sessionId}}`
3. Remove sessionId from credentials (if present)
4. Test the workflow

## 📞 Support

For issues:
1. Check this guide
2. Review API logs: `docker logs linkedin-api`
3. Review n8n logs: `docker logs n8n`
4. Check the main README.md

## 📄 License

MIT
