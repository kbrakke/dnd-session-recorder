import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Check database connectivity
    const dbCheck = await prisma.$queryRaw`SELECT 1 as health_check`;
    
    // Check if schema is initialized by testing User table
    let schemaStatus = 'unknown';
    try {
      await prisma.user.count();
      schemaStatus = 'initialized';
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