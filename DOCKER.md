# Docker Deployment Guide

This guide explains how to deploy the D&D Session Recorder using Docker and Docker Compose.

## Prerequisites

- Docker and Docker Compose installed
- OpenAI API key
- (Optional) Google OAuth credentials

## Quick Start

1. **Clone the repository and navigate to the project directory**:
   ```bash
   git clone <repository-url>
   cd dnd-session-recorder
   ```

2. **Set up environment variables**:
   ```bash
   cp docker-compose.env.example .env
   ```
   
   Edit the `.env` file with your configuration (see Environment Variables section below).

3. **Create data directories**:
   ```bash
   mkdir -p data/database data/uploads
   ```

4. **Start the application**:
   ```bash
   docker-compose up -d
   ```

5. **Initialize the database** (first time only):
   ```bash
   docker-compose exec dnd-recorder npx prisma db push
   ```

6. **Access the application**:
   Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables

### Required Variables

```bash
# OpenAI API Key (Required)
OPENAI_API_KEY=your-openai-api-key

# NextAuth Configuration (Required)
NEXTAUTH_URL=http://localhost:3000  # Use your domain for production
NEXTAUTH_SECRET=your-secure-secret
```

### Optional Variables

```bash
# Google OAuth (Optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
NEXT_PUBLIC_GOOGLE_ENABLED=true

# File Upload Configuration
MAX_FILE_SIZE=100000000  # 100MB

# CORS Configuration
CORS_ORIGIN=http://localhost:3000
```

## Production Deployment

### 1. Update Environment Variables

For production deployment, update your `.env` file:

```bash
# Use your production domain
NEXTAUTH_URL=https://your-domain.com
CORS_ORIGIN=https://your-domain.com

# Use a strong secret (generate with: openssl rand -base64 32)
NEXTAUTH_SECRET=your-production-secret
```

### 2. Set up Google OAuth (Optional)

If using Google OAuth, configure your OAuth app:

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 credentials
3. Add authorized redirect URI: `https://your-domain.com/api/auth/callback/google`

### 3. Deploy with Docker Compose

```bash
# Build and start in production mode
docker-compose up -d --build

# Initialize database (first time only)
docker-compose exec dnd-recorder npx prisma db push
```

### 4. Set up Reverse Proxy (Recommended)

For production, use a reverse proxy like Nginx:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

## Docker Commands

### Basic Operations

```bash
# Start the application
docker-compose up -d

# Stop the application
docker-compose down

# View logs
docker-compose logs -f dnd-recorder

# Rebuild and restart
docker-compose up -d --build

# Access container shell
docker-compose exec dnd-recorder sh
```

### Database Operations

```bash
# Initialize database (first time setup)
docker-compose exec dnd-recorder npx prisma db push

# Reset database (WARNING: This will delete all data)
docker-compose exec dnd-recorder npx prisma db push --force-reset

# View database schema
docker-compose exec dnd-recorder npx prisma studio
```

### Maintenance

```bash
# Update the application
git pull
docker-compose up -d --build

# View system resources
docker-compose exec dnd-recorder top

# Check disk usage
docker-compose exec dnd-recorder df -h
```

## Volume Management

The application uses Docker volumes for data persistence:

- **Database**: `./data/database` → `/app/prisma/data`
- **Uploads**: `./data/uploads` → `/app/uploads`

### Backup Data

```bash
# Create backup directory
mkdir -p backups/$(date +%Y%m%d)

# Backup database
cp data/database/dev.db backups/$(date +%Y%m%d)/

# Backup uploads
cp -r data/uploads backups/$(date +%Y%m%d)/
```

### Restore Data

```bash
# Stop the application
docker-compose down

# Restore database
cp backups/20240101/dev.db data/database/

# Restore uploads
cp -r backups/20240101/uploads/* data/uploads/

# Start the application
docker-compose up -d
```

## Monitoring

### Health Checks

The container includes health checks that verify the application is running:

```bash
# Check container health
docker-compose ps

# View health check logs
docker-compose logs dnd-recorder | grep health
```

### Resource Usage

```bash
# Monitor container resources
docker stats dnd-recorder

# Check disk usage
docker-compose exec dnd-recorder df -h

# View memory usage
docker-compose exec dnd-recorder free -h
```

## Troubleshooting

### Common Issues

1. **Container won't start**:
   ```bash
   docker-compose logs dnd-recorder
   ```

2. **Database connection errors**:
   ```bash
   # Check if database directory exists
   ls -la data/database/
   
   # Recreate database
   docker-compose exec dnd-recorder npx prisma db push
   ```

3. **Permission errors**:
   ```bash
   # Fix permissions
   sudo chown -R 1001:1001 data/
   ```

4. **Out of disk space**:
   ```bash
   # Clean up Docker
   docker system prune -a
   
   # Clean up old uploads
   find data/uploads -type f -mtime +30 -delete
   ```

### Performance Optimization

1. **Limit memory usage**:
   ```yaml
   # Add to docker-compose.yml
   deploy:
     resources:
       limits:
         memory: 1G
       reservations:
         memory: 512M
   ```

2. **Log rotation**:
   ```yaml
   # Add to docker-compose.yml
   logging:
     driver: "json-file"
     options:
       max-size: "10m"
       max-file: "3"
   ```

## Security Considerations

1. **Use strong secrets**: Generate secure `NEXTAUTH_SECRET`
2. **Enable HTTPS**: Use SSL/TLS in production
3. **Regular updates**: Keep Docker images updated
4. **Network security**: Use Docker networks for isolation
5. **File permissions**: Ensure proper file permissions for uploads

## Support

For issues related to Docker deployment:

1. Check the logs: `docker-compose logs -f dnd-recorder`
2. Verify environment variables are set correctly
3. Ensure all required ports are available
4. Check disk space and memory usage