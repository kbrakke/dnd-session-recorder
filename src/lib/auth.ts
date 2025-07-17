import { NextAuthOptions } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) {
          return null;
        }

        const isPasswordValid = await compare(credentials.password, user.password);

        if (!isPasswordValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  session: {
    strategy: 'database',
  },
  pages: {
    signIn: '/auth/signin',
    signUp: '/auth/signup',
    error: '/auth/error',
  },
  callbacks: {
    async signIn({ user, account, profile, email, credentials }) {
      try {
        console.log('SignIn callback - User:', user);
        console.log('SignIn callback - Account:', account);
        console.log('SignIn callback - Profile:', profile);
        
        if (account?.provider === 'google') {
          console.log('Google OAuth sign in attempt');
          // Add any custom Google OAuth validation here
          return true;
        }
        
        return true;
      } catch (error) {
        console.error('SignIn callback error:', error);
        return false;
      }
    },
    async session({ session, user }) {
      try {
        // When using database sessions, user object is available
        if (user) {
          session.user.id = user.id;
        }
        return session;
      } catch (error) {
        console.error('Session callback error:', error);
        return session;
      }
    },
  },
  events: {
    async signIn({ user, account, profile, isNewUser }) {
      console.log('SignIn event - Success:', { user, account, profile, isNewUser });
    },
    async signOut({ session, token }) {
      console.log('SignOut event:', { session, token });
    },
    async createUser({ user }) {
      console.log('CreateUser event:', user);
    },
    async linkAccount({ user, account, profile }) {
      console.log('LinkAccount event:', { user, account, profile });
    },
    async session({ session, token }) {
      console.log('Session event:', { session, token });
    },
  },
  debug: process.env.NODE_ENV === 'development',
};