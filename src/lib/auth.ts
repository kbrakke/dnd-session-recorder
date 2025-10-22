import type { NextAuthOptions } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { validateWhitelistAccess, isEmailWhitelisted, getWhitelistMessage } from '@/lib/whitelist';
import { logger } from '@/lib/logger';


export const authOptions: NextAuthOptions = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true, // Allow linking accounts with same email
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

        // Validate whitelist access for login
        const whitelistValidation = validateWhitelistAccess(credentials.email);
        if (!whitelistValidation.allowed) {
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
    strategy: 'jwt',
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  callbacks: {
    async signIn({ user, account }) {
      try {
        // Check whitelist for all sign-in attempts
        if (!isEmailWhitelisted(user.email!)) {
          logger.warn('Whitelist check failed for email', {
            email: user.email,
            message: getWhitelistMessage('login')
          });
          return false; // Deny sign-in
        }

        // For OAuth providers, PrismaAdapter handles user/account creation automatically
        // We just need to verify the email is whitelisted
        if (account?.provider === 'google') {
          logger.debug('Google OAuth sign-in', { email: user.email });

          // Check if user exists
          const existingUser = await prisma.user.findUnique({
            where: { email: user.email! },
            include: { accounts: true },
          });

          if (existingUser) {
            // User exists - check if this specific OAuth account is linked
            const isAccountLinked = existingUser.accounts.some(
              acc => acc.provider === account.provider && acc.providerAccountId === account.providerAccountId
            );

            if (!isAccountLinked) {
              // User exists but this OAuth account is not linked
              // Check if user has ANY Google account linked
              const hasGoogleLinked = existingUser.accounts.some(acc => acc.provider === 'google');

              if (hasGoogleLinked) {
                // Different Google account - don't allow
                logger.warn('User tried to link different Google account', { email: user.email });
                return false;
              }

              // User exists with email/password only - allow linking
              logger.info('Linking Google account to existing user', { email: user.email });
            }
          } else {
            // New user - PrismaAdapter will create it
            logger.info('Creating new user via Google OAuth', { email: user.email });
          }
        }

        return true;
      } catch (error) {
        logger.error('SignIn callback error', error as Error);
        return false;
      }
    },
    async jwt({ token, user }) {
      // Add user ID to token on first sign in
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      try {
        // When using JWT sessions, token object is available
        if (token) {
          session.user.id = token.id as string;
        }
        return session;
      } catch (error) {
        logger.error('Session callback error', error as Error);
        return session;
      }
    },
  },
  events: {
    async signIn({ user, account, profile, isNewUser }) {
      logger.trace('SignIn event - Success', { user, account, profile, isNewUser });
    },
    async signOut({ session, token }) {
      logger.trace('SignOut event', { session, token });
    },
    async createUser({ user }) {
      logger.info('CreateUser event', { user });
    },
    async linkAccount({ user, account, profile }) {
      logger.info('LinkAccount event', { user, account, profile });
    },
    async session({ session, token }) {
      logger.trace('Session event', { session, token });
    },
  },
  debug: process.env.NODE_ENV === 'development',
};