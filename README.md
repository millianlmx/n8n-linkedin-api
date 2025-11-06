# LinkedIn Scraper API

A powerful, containerized REST API for scraping LinkedIn profiles with TypeScript, Express, Puppeteer, and PostgreSQL caching.

## 📚 Documentation

- **[DOCUMENTATION.md](./DOCUMENTATION.md)** - Complete API reference and usage guide
- **[CUSTOM_IMPLEMENTATION.md](./CUSTOM_IMPLEMENTATION.md)** - How LinkedIn automation works (architecture & implementation details)
- **[DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md)** - Docker/Podman deployment guide
- **[FINAL_COVERAGE_REPORT.md](./FINAL_COVERAGE_REPORT.md)** - Test coverage report (80.95% coverage achieved)

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your LinkedIn credentials

# 3. Build the project
npm run build

# 4. Start with Docker/Podman
podman compose up -d

# 5. Access the API
# API: http://localhost:8080
# n8n: http://localhost:5678
# PostgreSQL: localhost:5432
```

## Features

- ✅ **Authentication**: Secure session-based login
- ✅ **Profile Scraping**: Extract comprehensive profile data
- ✅ **PostgreSQL Caching**: High-performance caching layer
- ✅ **Connection Requests**: Automated connection management
- ✅ **Messaging**: List, read, and send messages
- ✅ **Profile Visits**: Track and visit profiles
- ✅ **Search People**: Find LinkedIn users by keywords
- ✅ **Dockerized**: Easy deployment with Docker/Podman
- ✅ **n8n Integration**: Workflow automation support

## Project Structure

```
windsurf-project-3/
├── src/
│   ├── routes/             # API route handlers
│   ├── services/           # Business logic (LinkedInService, CacheService)
│   ├── utils/              # Utilities (Logger, SessionManager)
│   ├── types/              # TypeScript type definitions
│   └── server.ts           # Express server entry point
├── docker-compose.yml      # Container orchestration
├── Dockerfile              # API container build
├── n8n_custom_nodes/       # Custom n8n workflow nodes
└── package.json            # Dependencies and scripts
```

## API Endpoints

```
POST   /api/auth/init              # Initialize session
POST   /api/auth/login             # Login
DELETE /api/auth/logout            # Logout
GET    /api/auth/sessions          # List sessions

POST   /api/profile/scrape         # Scrape profile
POST   /api/profile/visit          # Visit profile
GET    /api/profile/views          # Get views

POST   /api/connection/connect     # Send connection

GET    /api/messages/conversations # List conversations
GET    /api/messages/conversation  # Read conversation
POST   /api/messages/send          # Send message

POST   /api/search/people          # Search people (NEW!)
```

## Technology Stack

- **Backend**: Node.js, Express.js, TypeScript
- **Scraping**: Puppeteer
- **Database**: PostgreSQL 15 (caching layer)
- **Logging**: Winston
- **Containerization**: Docker/Podman
- **Workflow Automation**: n8n

## Environment Variables

Create a `.env` file with the following:

```env
# LinkedIn Credentials
LINKEDIN_EMAIL=your_email@example.com
LINKEDIN_PASSWORD=your_password

# Database Configuration (auto-configured in Docker)
DB_HOST=linkedin-db
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=linkedin
```

## Caching System

The API uses PostgreSQL to cache scraped profiles:

- **First Request**: Scrapes LinkedIn and stores in database
- **Subsequent Requests**: Returns cached data instantly
- **Performance**: 60-80% faster for repeated requests
- **Schema**: JSONB storage with indexed profile URLs

## License

MIT

## Disclaimer

Educational purposes only. Use responsibly and in accordance with LinkedIn's Terms of Service.
