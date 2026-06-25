# docker/

Docker-related configuration files for the PostgreSQL database.

## Structure

```
docker/
  postgres/
    init/          SQL scripts run on first PostgreSQL container startup
```

## Behavior

The `init/` directory contains SQL initialization scripts that PostgreSQL runs automatically when the container is first created (via the `docker-entrypoint-initdb.d` volume mount in `docker-compose.yml`). These scripts set up the initial database schema or seed data before Prisma migrations take over.

## Related Files (at project root)

- `Dockerfile` — Multi-stage production image (Node 22 Alpine + FFmpeg + PostgreSQL client tools). Three stages: deps, builder, runner. Non-root user. Standalone Next.js output.
- `docker-compose.yml` — Local dev stack with PostgreSQL 16 Alpine, optional PgAdmin, optional full app. Includes healthchecks and volume persistence.
- `docker-entrypoint.sh` — Docker startup script that runs Prisma migrations before starting the app.
