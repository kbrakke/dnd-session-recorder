import type { NextAuthOptions } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { validateWhitelistAccess, isEmailWhitelisted, getWhitelistMessage } from '@/lib/whitelist';


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
          console.log(`[Auth] Whitelist check failed for email: ${user.email} - ${getWhitelistMessage('login')}`);
          return false; // Deny sign-in
        }

        // For OAuth providers, PrismaAdapter handles user/account creation automatically
        // We just need to verify the email is whitelisted
        if (account?.provider === 'google') {
          console.log(`[Auth] Google OAuth sign-in for: ${user.email}`);

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
                console.log(`[Auth] User ${user.email} tried to link different Google account`);
                return false;
              }

              // User exists with email/password only - allow linking
              console.log(`[Auth] Linking Google account to existing user: ${user.email}`);
            }
          } else {
            // New user - PrismaAdapter will create it
            console.log(`[Auth] Creating new user via Google OAuth: ${user.email}`);
          }
        }

        return true;
      } catch (error) {
        console.error('SignIn callback error:', error);
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