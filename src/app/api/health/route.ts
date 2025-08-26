import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Check database connectivity
    await prisma.$queryRaw`SELECT 1 as health_check`;
    
    // Check if schema is initialized by testing User table and new columns
    let schemaStatus = 'unknown';
    let missingColumns: string[] = [];
    
    try {
      await prisma.user.count();
      
      // Check if new transcription progress columns exist
      const result = await prisma.$queryRaw`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'gaming_sessions' 
        AND column_name IN ('transcription_progress', 'total_chunks', 'chunks_completed', 'current_step')
      ` as Array<{ column_name: string }>;
      
      const expectedColumns = ['transcription_progress', 'total_chunks', 'chunks_completed', 'current_step'];
      const existingColumns = result.map(r => r.column_name);
      missingColumns = expectedColumns.filter(col => !existingColumns.includes(col));
      
      if (missingColumns.length === 0) {
        schemaStatus = 'initialized';
      } else {
        schemaStatus = 'migration_needed';
      }
    } catch (schemaError) {
      console.warn('Schema check failed:', schemaError);
      schemaStatus = 'not_initialized';
    }
    
    return NextResponse.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      database: 'connected',
      schema: schemaStatus,
      ...(missingColumns.length > 0 && { missingColumns }),
      databaseUrl: process.env.DATABASE_URL?.replace(/:[^@]*@/, ':***@').replace(/\/[^\/]*$/, '/***'),
    });
  } catch (error) {
    console.error('Health check failed:', error);
    
    return NextResponse.json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      database: 'disconnected',
      schema: 'unknown',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 503 });
  }
}