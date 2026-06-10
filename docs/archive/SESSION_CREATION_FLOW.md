# Session Creation Flow

## Overview

The session creation flow has been redesigned to be atomic, robust, and user-friendly. The key improvement is a single API endpoint that handles file upload + session creation in one transaction.

## New Flow

### User Experience

1. User fills in session information (title, campaign, date)
2. User selects audio file to upload (or skips)
3. User clicks "Create Session"
4. System creates session + uploads file atomically
5. Processing starts immediately
6. User is redirected to session detail page to watch progress

### Technical Implementation

```
┌─────────────────────────────────────────────────────────────┐
│                    Session Creation Flow                     │
└─────────────────────────────────────────────────────────────┘

User Action: Submit Form
         │
         ├─► Has Audio File?
         │   │
         │   ├─► YES: POST /api/sessions/create-with-upload
         │   │          ┌────────────────────────────────┐
         │   │          │ 1. Validate campaign ownership │
         │   │          │ 2. Upload audio file           │
         │   │          │ 3. Create session record       │
         │   │          │ 4. Link upload to session      │
         │   │          │ 5. Trigger processing pipeline │
         │   │          └────────────────────────────────┘
         │   │          ↓
         │   │   Navigate to /sessions/{id}
         │   │
         │   └─► NO: POST /api/sessions
         │              ↓
         │       Navigate to /sessions/{id}
         │
         ↓
Session Detail Page
         │
         ├─► Poll for progress
         │   ┌──────────────────────────────┐
         │   │ Status: uploaded             │
         │   │ Status: transcribing (0-100%)│
         │   │ Status: summarizing          │
         │   │ Status: completed            │
         │   └──────────────────────────────┘
         │
         └─► Display results when complete
```

## API Endpoints

### Atomic Session Creation with Upload

**POST /api/sessions/create-with-upload**

Atomically creates a session and uploads audio file in a single request.

**Request**: `multipart/form-data`
```
title: string
campaign_id: string
session_date: ISO 8601 datetime
audio: File (optional)
```

**Response**: `201 Created`
```json
{
  "message": "Session created successfully",
  "session": {
    "id": "clxyz123",
    "title": "Dragon Hunt Session",
    "campaignId": "clxyz456",
    "sessionDate": "2025-10-17T00:00:00.000Z",
    "uploadId": "clxyz789",
    "duration": 3600,
    "status": "uploaded",
    "createdAt": "2025-10-17T12:00:00.000Z"
  }
}
```

**Error Response**: `207 Multi-Status` (partial success)
```json
{
  "error": "Session created but encountered an error during setup",
  "sessionId": "clxyz123",
  "message": "You can continue from the session page"
}
```

**Benefits**:
- **Atomic**: Session + upload in one transaction
- **Resilient**: If processing fails, session still exists
- **Fast**: Single network request
- **Simple**: No multi-step coordination needed

### Legacy Upload Linking

**POST /api/sessions/{id}/upload**

Links an existing upload to a session (for "Use Existing Upload" mode).

**Fixed Issues**:
- Now uses direct `userId` check instead of going through Campaign
- Faster authorization (single query instead of two)

## Processing Pipeline

### Status Flow

```
draft → uploaded → transcribing → transcribed → summarizing → completed
                                                           ↓
                                                        error
```

### Progress Tracking

The session detail page polls `/api/sessions/{id}/progress` every second to display:

1. **Upload**: File uploaded successfully
2. **Analyzing File**: Determining duration and preparing chunks
3. **Transcribing**: Progress bar (0-100%)
   - Shows current chunk: "Transcribing chunk 3 of 12"
   - Shows audio duration
4. **Summarizing**: Generating AI summary
5. **TODO**: Generating DM prep TODO list
6. **Completed**: All processing finished

### Error Handling

If any step fails:
- Session remains in database (never orphaned)
- Status set to "error"
- `errorStep` field indicates where it failed
- `errorMessage` field contains details
- User can retry processing from session page

## Code Files

### API Routes

- `src/app/api/sessions/create-with-upload/route.ts` - Atomic session creation (NEW)
- `src/app/api/sessions/route.ts` - Legacy session creation
- `src/app/api/sessions/[id]/upload/route.ts` - Upload linking (FIXED)
- `src/app/api/sessions/[id]/process/route.ts` - Processing orchestrator

### UI Components

- `src/app/sessions/upload/page.tsx` - Upload form (UPDATED)
- `src/app/sessions/[id]/page.tsx` - Session detail with progress tracking

### Database

- `GamingSession` model now has direct `userId` for fast authorization
- No deprecated `audioFilePath` field - all files go through Upload relationship
- Cascade delete: session deletion removes associated uploads

## Comparison: Old vs New

### Old Flow (3 separate API calls)

```
1. POST /api/uploads        →  Upload file
2. POST /api/sessions       →  Create session
3. POST /api/sessions/{id}/upload →  Link upload to session
4. POST /api/sessions/{id}/process → Start processing
```

**Problems**:
- ❌ Multiple failure points
- ❌ Complex error handling
- ❌ Race conditions possible
- ❌ Orphaned uploads if step 2-3 fails
- ❌ Slow (4 network requests)

### New Flow (1 API call)

```
1. POST /api/sessions/create-with-upload  →  Everything
```

**Benefits**:
- ✅ Single atomic operation
- ✅ Simple error handling
- ✅ No orphaned records
- ✅ Fast (1 network request)
- ✅ Processing starts immediately

## Future Improvements

1. **WebSocket Progress**: Replace polling with WebSocket for real-time updates
2. **Retry Logic**: Automatic retry for transient errors
3. **Queue System**: Handle high volume with background job queue
4. **Partial Upload Resume**: Handle large files with chunked uploads
5. **Pre-signed URLs**: Direct-to-storage uploads for better performance

## Migration Notes

The old flow (`POST /api/sessions` → link upload) still works for:
- "Use Existing Upload" mode
- Sessions without audio
- Backwards compatibility

New sessions with file upload should use `/api/sessions/create-with-upload` for the best experience.
