# D&D Session Recorder

An AI-powered web application for recording, transcribing, and summarizing Dungeons & Dragons sessions. Built with Next.js, this application helps Dungeon Masters manage their campaigns with automatic transcription and intelligent summaries.

## Features

### Current Capabilities

- **🎙️ Audio Recording & Upload**: Support for various audio formats with automatic processing
- **🤖 AI Transcription**: Powered by OpenAI Whisper for accurate speech-to-text conversion
- **📋 Intelligent Summaries**: GPT-4 generates comprehensive session summaries with key events
- **👥 User Authentication**: Secure login with Google OAuth and local credentials
- **📚 Campaign Management**: Create, organize, and manage multiple D&D campaigns
- **🎮 Session Organization**: Track sessions by campaign with date and duration
- **🔍 Transcript Search**: Full-text search within session transcripts
- **📊 Session Analytics**: View session statistics and completion status
- **📱 Responsive Design**: Works seamlessly on desktop and mobile devices
- **💾 Export Options**: Download transcripts and summaries in various formats

## Technology Stack

- **Frontend**: Next.js 15 with React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes with serverless functions
- **Database**: SQLite with Prisma ORM
- **Authentication**: NextAuth.js with Google OAuth and local credentials
- **AI Services**: OpenAI API (Whisper for transcription, GPT-4 for summaries)
- **File Processing**: FFmpeg for audio processing and metadata extraction
- **UI Components**: Lucide React icons, custom Tailwind components
- **State Management**: TanStack Query for server state management

## Database Schema

The application uses a well-structured database with the following key entities:

### User Management
- **Users**: Stores user authentication data, profiles, and OAuth information
- **Accounts**: OAuth account linking (Google, etc.)
- **Sessions**: Authentication sessions and tokens
- **VerificationTokens**: Email verification and password reset tokens

### Campaign Structure
- **Campaigns**: D&D campaigns with descriptions and user ownership
- **GamingSessions**: Individual game sessions linked to campaigns
- **Transcriptions**: Timestamped transcript segments with confidence scores
- **Summaries**: AI-generated session summaries with key events

### Relationships
- Users can have multiple Campaigns
- Campaigns contain multiple GamingSessions
- GamingSessions have multiple Transcriptions and one Summary
- All data is properly scoped to authenticated users

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- OpenAI API key
- Google OAuth credentials (optional, for Google login)

### Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd dnd-session-recorder
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   ```bash
   cp env.example .env.local
   ```
   
   Edit `.env.local` with your configuration (see Environment Variables section below).

4. **Set up the database**:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. **Run the development server**:
   ```bash
   npm run dev
   ```

6. **Open the application**:
   Visit [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

Create a `.env.local` file in the project root with the following variables:

```bash
# Database
DATABASE_URL="file:./prisma/data/dev.db"

# OpenAI Configuration (Required)
OPENAI_API_KEY="your-openai-api-key"

# NextAuth Configuration (Required)
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-nextauth-secret"

# Google OAuth Configuration (Optional)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
NEXT_PUBLIC_GOOGLE_ENABLED="true"

# File Upload Configuration
UPLOAD_DIR="./uploads"
MAX_FILE_SIZE="100000000"
CORS_ORIGIN="http://localhost:3000"
```

### Production Deployment

1. **Build the application**:
   ```bash
   npm run build
   ```

2. **Start the production server**:
   ```bash
   npm start
   ```

3. **Update environment variables** for production:
   - Change `NEXTAUTH_URL` to your production domain
   - Use a secure `NEXTAUTH_SECRET`
   - Configure production database URL
   - Set up proper CORS origins

## Usage

1. **Sign up** or log in to your account
2. **Create a campaign** to organize your sessions
3. **Upload audio** from your D&D session
4. **Wait for processing** (transcription and summarization)
5. **Review transcripts** and summaries
6. **Export or share** your session documentation

## Future Enhancements

### 1. Campaign-Specific Transcription Prompts
- Custom prompts for better transcription accuracy
- Campaign-specific terminology and character names
- Context-aware transcription improvements
- Custom vocabulary for fantasy terms and names

### 2. Character and Player Management System
- Character profile creation with stats and backstories
- Player assignment and character progression tracking
- Character relationship mapping and development arcs
- Integration with transcription for character moment extraction

### 3. Advanced Session Analytics and Insights
- Speaking time analysis per player/character
- Combat vs. roleplay time breakdown
- Emotional tone analysis and player engagement metrics
- Session pacing analysis and improvement suggestions

### 4. Real-time Collaboration and Note-taking
- Live collaborative note-taking during sessions
- Real-time session bookmarking and annotations
- Mobile app for player contributions
- Integration with popular VTT platforms (Roll20, Foundry VTT)

## CI/CD and Deployment

This project uses GitHub Actions for continuous integration and deployment to Fly.io. The following workflows are configured:

### 1. Pull Request CI (~5 minutes)
- **Triggers**: On every PR
- **Tests**: Fast unit tests, linting, type checking, security audit, build verification
- **Purpose**: Quick feedback for development

### 2. Post-Merge CI (~30 minutes)  
- **Triggers**: When code is merged to main/staging
- **Tests**: Comprehensive workflow tests, staging deployment, integration tests
- **Purpose**: Full validation before production

### 3. PR Review Apps
- **Triggers**: On PR creation/updates
- **Creates**: Ephemeral Fly.io apps for each PR (e.g., `pr-123-dnd-rec.fly.dev`)
- **Tests**: Post-deploy validation against review app
- **Cleanup**: Automatic destruction when PR is closed

### Required GitHub Secrets

To enable full CI/CD functionality, add these secrets to your GitHub repository:

#### Core Application Secrets
```
NEXTAUTH_SECRET_STAGING     # NextAuth secret for staging/review apps (32+ characters)
OPENAI_API_KEY             # OpenAI API key for AI transcription and summarization
```

#### Fly.io Deployment Secrets  
```
FLY_API_TOKEN              # Fly.io API token for deployments
```

**To get your Fly.io API token:**
1. Install [flyctl CLI](https://fly.io/docs/hands-on/install-flyctl/)
2. Run: `fly tokens org <YOUR_ORG_NAME>`
3. Add the returned token as `FLY_API_TOKEN` in GitHub repository secrets

#### Database Configuration
```
DATABASE_URL      # Connection string for managed Postgres database
                          # Format: postgres://user:pass@host:port/db
                          # Example: postgres://user:pass@dnd-rec-db.fly.dev:5432/dnd_rec_db
```

### Setting Up GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret with the exact names listed above

### Database Setup

The application is configured to use a managed PostgreSQL database (`dnd-rec-db`) for staging and production:

- **Cluster ID**: `vmkq60981nvr35ln`
- **Name**: `dnd-rec-db`
- **Usage**: Shared across staging and review apps
- **Configuration**: Review apps connect to this shared database

### Deployment Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   PR Review     │    │   Staging       │    │   Production    │
│   Apps          │    │   Environment   │    │   Environment   │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ pr-N-dnd-rec    │    │ dnd-rec-staging │    │ dnd-rec-prod    │
│ .fly.dev        │    │ .fly.dev        │    │ .fly.dev        │
│                 │    │                 │    │                 │
│ • Ephemeral     │    │ • Auto-deploy   │    │ • Manual deploy │
│ • Per PR        │    │ • from main     │    │ • from staging  │
│ • Auto cleanup  │    │ • Full testing  │    │ • Production    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                  ┌─────────────────┐
                  │ Shared Postgres │
                  │   dnd-rec-db    │
                  │ vmkq60981nvr35ln│
                  └─────────────────┘
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Workflow

1. **Create PR**: Automatically deploys review app for testing
2. **Review**: Use review app URL to test changes
3. **Merge**: Triggers staging deployment and comprehensive tests
4. **Production**: Manual promotion from staging when ready

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions, please open an issue in the GitHub repository.