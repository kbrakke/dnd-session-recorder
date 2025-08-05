import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  // This middleware function only runs when authorized callback returns true
  function middleware(req) {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Allow health check endpoint
        if (req.nextUrl.pathname === '/api/health') {
          return true;
        }
        
        // Allow auth endpoints
        if (req.nextUrl.pathname.startsWith('/api/auth')) {
          return true;
        }

        // For API routes, require a valid token
        if (req.nextUrl.pathname.startsWith('/api/')) {
          return !!token;
        }

        // For all other routes, allow access (pages handle their own auth)
        return true;
      },
    },
  }
);

export const config = {
  // Only apply middleware to API routes (not all pages)
  matcher: ['/api/:path*'],
};